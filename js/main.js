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
import { readAppliedIds, flipAccepted } from "./annotations/appliedRoundtrip.js";
import { TasteLogger } from "./lib/tasteLog.js";
import { PassStore } from "./passes/passStore.js";

import { Gate } from "./ui/gate.js";
import { Chrome } from "./ui/chrome.js";
import { DocumentView } from "./ui/documentView.js";
import { Marginalia } from "./ui/marginalia.js";
import { Palette } from "./ui/palette.js";
import { Toast } from "./ui/toast.js";
import { FilterStrip } from "./ui/filterStrip.js";
import { PassDialog } from "./ui/passDialog.js";
import { Toc } from "./ui/toc.js";

const supported = WorkspaceService.isSupported();

const passStore = new PassStore({ workspace, bus });

const deps = {
    bus,
    workspace,
    files,
    annotationStore,
    passStore,
    exporter: (byFile) => buildReviewMarkdown(byFile),
    openWorkspace,
    runReset: null, // wired below once gate exists
};

const gate = new Gate(document.getElementById("gate"), deps);
gate.mount();
deps.gate = gate;
deps.runReset = () => performReset({ workspace, bus, Events, gate });

const notesPersister = new NotesDiskPersister({ workspace, annotationStore, bus });
const tasteLogger = new TasteLogger({ workspace, bus, annotationStore });

if (!supported) {
    gate.showUnsupported();
} else {
    bootApp();
}

async function bootApp() {
    document.getElementById("chrome").hidden = false;
    document.getElementById("filter-strip").hidden = false;
    document.getElementById("app-shell").hidden = false;

    const toc = new Toc(document.getElementById("toc-rail"), deps);
    deps.toc = toc;
    const components = [
        new Chrome(document.getElementById("chrome"), deps),
        new FilterStrip(document.getElementById("filter-strip"), deps),
        new DocumentView(document.getElementById("document"), deps),
        new Marginalia(document.getElementById("document"), deps),
        new Palette(document.getElementById("palette"), deps),
        new Toast(document.getElementById("toast"), deps),
        new PassDialog(document.getElementById("pass-dialog"), deps),
        toc,
    ];
    components.forEach((c) => c.mount());
    notesPersister.mount();
    tasteLogger.mount();

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
    console.log(`[mdgalley] workspace opened: "${workspaceName}"`);

    // Drop a marker into the workspace's tool folder. Idempotent: only
    // creates state.json on first open of this workspace.
    await writeToolState(workspace.handle).catch((err) => {
        console.warn("[mdgalley] writeToolState failed", err);
    });
    // Disk is the source of truth for notes: hydrate the IndexedDB cache
    // from .mdgalley/notes/*.json BEFORE the first FILE_LOADED event.
    // The document view always reads notes from the (now-warm) cache.
    await notesPersister.hydrate().catch((err) => {
        console.warn("[mdgalley] notesPersistence: hydrate failed", err);
    });
    // Seed the taste logger's status cache before any auto-resolve fires, so
    // RESOLVE entries record the correct previous status.
    await tasteLogger.hydrate().catch((err) => {
        console.warn("[mdgalley] tasteLogger: hydrate failed", err);
    });
    await passStore.hydrate().catch((err) => {
        console.warn("[mdgalley] passStore: hydrate failed", err);
    });
    // Applied roundtrip: any reviews/*-applied.md files left by a downstream
    // agent flip matching `open` notes to `resolved` so the reviewer's gutter
    // reflects the addressed work without manual click-through. Idempotent
    // on subsequent opens (already-resolved notes are skipped).
    try {
        const appliedIds = await readAppliedIds(workspace.handle);
        const flipped = await flipAccepted(annotationStore, appliedIds);
        if (flipped > 0) {
            console.log(`[mdgalley] applied roundtrip: auto-resolved ${flipped} note(s)`);
            bus.emit(Events.TOAST, { message: `${flipped} note(s) auto-resolved from applied.md` });
        }
    } catch (err) {
        console.warn("[mdgalley] applied roundtrip failed", err);
    }

    let fileList = [];
    try {
        fileList = await files.list(workspace.handle);
        console.log(`[mdgalley] workspace "${workspaceName}" -> ${fileList.length} markdown file(s)`,
            fileList.map((f) => f.path));
    } catch (err) {
        console.error("[mdgalley] files.list failed", err);
        bus.emit(Events.TOAST, {
            message: `could not read workspace: ${err?.message ?? err?.name ?? "unknown error"}`,
        });
    }

    bus.emit(Events.FILES_LISTED, { files: fileList, workspaceName });

    // Continuous (single-document-across-files) mode: read every file in
    // workspace order and render them as one continuous text. The mode is
    // persisted in localStorage; flipping it requires a page reload (chrome
    // toggle).
    if (continuousModeOn() && fileList.length > 0) {
        try {
            const sources = [];
            for (const f of fileList) {
                const text = await files.read(f.handle);
                sources.push({ path: f.path, source: text });
            }
            bus.emit(Events.WORKSPACE_RENDERED, { files: sources });
        } catch (err) {
            console.error("[mdgalley] continuous render failed", err);
            // Fall back to single-file mode for this session.
            if (fileList.length > 0) bus.emit(Events.FILE_SELECTED, { path: fileList[0].path });
        }
        return;
    }

    if (fileList.length > 0) {
        bus.emit(Events.FILE_SELECTED, { path: fileList[0].path });
    }
}

function continuousModeOn() {
    try { return localStorage.getItem("mdgalley:continuous") === "true"; }
    catch { return false; }
}

async function onFileSelected({ path }) {
    if (!workspace.handle) return;
    // Continuous mode: the document view already holds every file. Treat the
    // selection as a scroll-to action against the rendered file segment.
    if (continuousModeOn()) {
        bus.emit(Events.FILE_FOCUSED, { filePath: path });
        return;
    }
    const fileList = await files.list(workspace.handle);
    const meta = fileList.find((f) => f.path === path);
    if (!meta) return;
    const source = await files.read(meta.handle);
    const { data } = splitFrontmatter(source);
    currentFile = { path, documentTitle: data?.title ?? null };
    bus.emit(Events.FILE_LOADED, {
        filePath: path,
        documentTitle: currentFile.documentTitle,
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
        documentTitle: payload.documentTitle,
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
            "[mdgalley] showDirectoryPicker has not resolved after 4s. " +
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
        console.error("[mdgalley] picker failed", err);
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
        console.error("[mdgalley] could not store handle", err);
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
