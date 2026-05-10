// Bootstrap. Composition root: instantiates services, mounts components,
// runs the orchestrator that translates between event channels, wires the
// global keyboard map. No business logic, no DOM rendering.

import { bus, Events } from "./lib/eventBus.js";
import { workspace, WorkspaceService } from "./workspace/workspaceService.js";
import { files } from "./workspace/fileService.js";
import { annotationStore } from "./annotations/annotationStore.js";
import { buildReviewMarkdown } from "./annotations/exporter.js";
import { splitFrontmatter } from "./markdown/frontmatter.js";

import { writeToolState } from "./lib/toolDir.js";
import { performReset, consumeResetFlag } from "./lib/reset.js";
import { NotesDiskPersister } from "./lib/notesPersistence.js";

import { Gate } from "./ui/gate.js";
import { Chrome } from "./ui/chrome.js";
import { Manuscript } from "./ui/manuscript.js";
import { Marginalia } from "./ui/marginalia.js";
import { Palette } from "./ui/palette.js";
import { Toast } from "./ui/toast.js";
import { FilterStrip } from "./ui/filterStrip.js";

const supported = WorkspaceService.isSupported();

const deps = {
    bus,
    workspace,
    files,
    annotationStore,
    exporter: (byFile) => buildReviewMarkdown(byFile),
    openWorkspace,
    runReset: null, // wired below once gate exists
};

const gate = new Gate(document.getElementById("gate"), deps);
gate.mount();
deps.gate = gate;
deps.runReset = () => performReset({ workspace, bus, Events, gate });

const notesPersister = new NotesDiskPersister({ workspace, annotationStore, bus });

if (!supported) {
    gate.showUnsupported();
} else {
    bootApp();
}

async function bootApp() {
    document.getElementById("chrome").hidden = false;
    document.getElementById("filter-strip").hidden = false;
    document.getElementById("app-shell").hidden = false;

    const components = [
        new Chrome(document.getElementById("chrome"), deps),
        new FilterStrip(document.getElementById("filter-strip"), deps),
        new Manuscript(document.getElementById("manuscript"), deps),
        new Marginalia(document.getElementById("manuscript"), deps),
        new Palette(document.getElementById("palette"), deps),
        new Toast(document.getElementById("toast"), deps),
    ];
    components.forEach((c) => c.mount());
    notesPersister.mount();

    bus.on(Events.WORKSPACE_OPENED, onWorkspaceOpened);
    bus.on(Events.FILE_SELECTED, onFileSelected);
    bus.on(Events.SELECTION_MADE, onSelectionMade);
    bus.on(Events.COMPOSER_CLOSE, () => composerOpen = false);
    bus.on(Events.COMPOSER_OPEN, () => composerOpen = true);

    document.addEventListener("keydown", onGlobalKeydown);

    const justReset = consumeResetFlag();
    const restored = !justReset && await workspace.restore({ requestIfNeeded: false });
    if (restored) {
        bus.emit(Events.WORKSPACE_OPENED, { reload: true });
    } else {
        gate.showOpenWorkspace({ afterReset: justReset });
    }
}

let composerOpen = false;
let currentFile = null;

async function onWorkspaceOpened() {
    if (!workspace.handle) return;
    gate.hide();
    const workspaceName = workspace.handle.name;
    console.log(`[bookwright] workspace opened: "${workspaceName}"`);

    // Drop a marker into the workspace's tool folder. Idempotent: only
    // creates state.json on first open of this workspace.
    await writeToolState(workspace.handle).catch((err) => {
        console.warn("[bookwright] writeToolState failed", err);
    });
    // Disk is the source of truth for notes: hydrate the IndexedDB cache
    // from .bookwright/notes/*.json BEFORE the first FILE_LOADED event.
    // The manuscript view always reads notes from the (now-warm) cache.
    await notesPersister.hydrate().catch((err) => {
        console.warn("[bookwright] notesPersistence: hydrate failed", err);
    });

    let fileList = [];
    try {
        fileList = await files.list(workspace.handle);
        console.log(`[bookwright] workspace "${workspaceName}" -> ${fileList.length} markdown file(s)`,
            fileList.map((f) => f.path));
    } catch (err) {
        console.error("[bookwright] files.list failed", err);
        bus.emit(Events.TOAST, {
            message: `could not read workspace: ${err?.message ?? err?.name ?? "unknown error"}`,
        });
    }

    bus.emit(Events.FILES_LISTED, { files: fileList, workspaceName });
    if (fileList.length > 0) {
        bus.emit(Events.FILE_SELECTED, { path: fileList[0].path });
    }
}

async function onFileSelected({ path }) {
    if (!workspace.handle) return;
    const fileList = await files.list(workspace.handle);
    const meta = fileList.find((f) => f.path === path);
    if (!meta) return;
    const source = await files.read(meta.handle);
    const { data } = splitFrontmatter(source);
    currentFile = { path, chapterTitle: data?.title ?? null };
    bus.emit(Events.FILE_LOADED, {
        filePath: path,
        chapterTitle: currentFile.chapterTitle,
        source,
    });
}

function onSelectionMade(payload) {
    // Always re-emit. If a composer is already open, marginalia.onComposerOpen
    // updates the anchor in place and preserves the typed body, so the user
    // can re-select a different passage without losing their note text.
    bus.emit(Events.COMPOSER_OPEN, {
        scope: "anchored",
        anchor: payload.anchor,
        filePath: payload.filePath,
        chapterTitle: payload.chapterTitle,
    });
}

/** Canonical workspace-pick entry. Called from the gate's primary action
 *  AND from the palette's "select workspace" row. showDirectoryPicker is
 *  invoked as the first await so the user-activation gesture is preserved
 *  across the chain (click → openWorkspace → picker). */
async function openWorkspace() {
    // Soft-timeout. If the picker has not resolved in 4s the tab is most
    // likely in a stuck state from a previous run; tell the user to recycle.
    const stuckTimer = setTimeout(() => {
        bus.emit(Events.TOAST, {
            message: "picker stuck. close this tab and reopen the page.",
        });
        console.warn(
            "[bookwright] showDirectoryPicker has not resolved after 4s. " +
            "Close this tab (⌘W) and open a fresh one at this URL."
        );
    }, 4000);

    let handle;
    try {
        handle = await window.showDirectoryPicker({ mode: "readwrite" });
    } catch (err) {
        clearTimeout(stuckTimer);
        if (err?.name === "AbortError") return;
        if (err?.name === "NotAllowedError") return; // duplicate trigger
        console.error("[bookwright] picker failed", err);
        bus.emit(Events.TOAST, { message: `picker failed: ${err?.name ?? "error"}` });
        return;
    }
    clearTimeout(stuckTimer);

    try {
        await workspace.acceptHandle(handle);
        gate.hide();
        bus.emit(Events.PALETTE_CLOSE);
        bus.emit(Events.WORKSPACE_OPENED, { reload: false });
    } catch (err) {
        console.error("[bookwright] could not store handle", err);
        bus.emit(Events.TOAST, { message: "could not open workspace" });
    }
}

function onGlobalKeydown(ev) {
    const k = ev.key;
    const meta = ev.metaKey || ev.ctrlKey;

    if (meta && k.toLowerCase() === "k") {
        ev.preventDefault();
        bus.emit(Events.PALETTE_OPEN);
        return;
    }
    if (meta && k.toLowerCase() === "o") {
        // Hijack the browser's open-file shortcut. Keyboard activation still
        // counts as a user gesture, so showDirectoryPicker resolves cleanly.
        ev.preventDefault();
        bus.emit(Events.PALETTE_CLOSE);
        openWorkspace();
        return;
    }
    if (k === "Escape") {
        // palette and composer handle their own escape; this is a fallback.
        bus.emit(Events.PALETTE_CLOSE);
        return;
    }

}
