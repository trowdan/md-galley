// Manuscript component. Renders the chapter and resolves selections into
// SELECTION_MADE payloads. Owns the text root inside the .manuscript grid.

import { Component } from "../lib/component.js";
import { Events } from "../lib/eventBus.js";
import { renderMarkdown, renderWorkspace } from "../markdown/renderer.js";
import { resolveAnchored } from "../annotations/anchor.js";
import { applyHighlights, setFocused } from "../annotations/highlightLayer.js";

const FOCUS_FLASH_MS = 900;

export class Manuscript extends Component {
    constructor(rootEl, deps) {
        super(rootEl, deps);
        this.textEl = rootEl.querySelector("#manuscript-text");
        this.currentFile = null;
        this.currentAnnotations = [];
    }

    mount() {
        this.listen(Events.FILE_LOADED, this.onFileLoaded);
        this.listen(Events.FILES_LISTED, this.onFilesListed);
        this.listen(Events.WORKSPACE_RENDERED, this.onWorkspaceRendered);
        this.listen(Events.FILE_FOCUSED, this.onFileFocused);
        this.listen(Events.ANNOTATION_CREATED, this.refreshFromStore);
        this.listen(Events.ANNOTATION_UPDATED, this.refreshFromStore);
        this.listen(Events.ANNOTATION_DELETED, this.refreshFromStore);
        this.listen(Events.ANNOTATION_FOCUSED, this.onAnnotationFocused);
        this.listen(Events.WORKSPACE_CLEARED, this.onWorkspaceCleared);

        this.bind(this.textEl, "mouseup", this.scheduleSelectionResolve);
        this.bind(this.textEl, "keyup", this.scheduleSelectionResolve);
        this.bind(this.textEl, "click", this.onClick);
    }

    /** Continuous-mode entry point: receives every loaded source in render
     *  order and renders one workspace-as-one-text view. Replaces single-
     *  file currentFile bookkeeping with a continuous flag. */
    onWorkspaceRendered({ files }) {
        const { html } = renderWorkspace(files);
        this.textEl.innerHTML = `<div class="manuscript__body manuscript__body--continuous">${html}</div>`;
        this.continuous = true;
        this.currentFile = null;
        this.refreshFromStore();
        this.root.parentElement?.scrollTo?.({ top: 0 });
    }

    /** In continuous mode, FILE_SELECTED becomes a scroll-to action against
     *  the rendered file segment. We re-route via FILE_FOCUSED so single-
     *  file mode stays untouched. */
    onFileFocused({ filePath }) {
        if (!this.continuous) return;
        const segment = this.textEl.querySelector(`[data-file-path="${CSS.escape(filePath)}"]`);
        if (segment) segment.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    onFilesListed({ files, workspaceName }) {
        // The workspace was just opened. If it has zero markdown files,
        // surface an inline notice so the reviewer knows the workspace is
        // not broken; they can recover via ⌘K → select workspace.
        if (files.length === 0 && !this.currentFile) {
            this.renderEmptyWorkspace(workspaceName);
        }
    }

    renderEmptyWorkspace(workspaceName) {
        const name = workspaceName ? `<em>${escape(workspaceName)}</em>` : "this folder";
        this.textEl.innerHTML = `
            <div class="manuscript__empty">
                <p class="manuscript__empty-kicker">empty workspace</p>
                <h2 class="manuscript__empty-title">No markdown files in ${name}.</h2>
                <p class="manuscript__empty-body">
                    MDGalley walked this folder and found no <code>.md</code> chapters
                    (it skips <code>reviews/</code> and the <code>.mdgalley</code> folder).
                </p>
                <p class="manuscript__empty-body">
                    If you intended a different folder, press <kbd>⌘K</kbd> to open the
                    palette and click <em>select workspace</em>.
                    Otherwise, open the developer console: a line beginning with
                    <code>[mdgalley] workspace</code> shows what the file walker found.
                </p>
            </div>
        `;
    }

    onFileLoaded({ filePath, source, chapterTitle }) {
        const { html, data } = renderMarkdown(source);
        const titleHtml = renderMasthead(data?.chapter, chapterTitle ?? data?.title ?? filePath);
        this.textEl.innerHTML = `${titleHtml}<div class="manuscript__body">${html}</div>`;

        this.currentFile = { filePath, chapterTitle: chapterTitle ?? data?.title ?? null };
        this.refreshFromStore();
        this.root.parentElement?.scrollTo?.({ top: 0 });
    }

    onWorkspaceCleared() {
        this.currentFile = null;
        this.currentAnnotations = [];
        this.textEl.innerHTML = "";
    }

    async refreshFromStore() {
        if (!this.currentFile && !this.continuous) return;
        if (this.continuous) {
            // Continuous mode: aggregate every file's annotations and let
            // applyHighlights wrap each note inside its own file segment.
            const all = await this.deps.annotationStore.listAll();
            this.currentAnnotations = [];
            for (const list of all.values()) this.currentAnnotations.push(...list);
        } else {
            this.currentAnnotations = await this.deps.annotationStore.listFor(this.currentFile.filePath);
        }
        const states = applyHighlights(this.textEl, this.currentAnnotations);
        this.deps.bus.emit(Events.ANCHOR_STATES_RESOLVED, { states });
        this.deps.bus.emit(Events.LAYOUT_REFLOW, null);
    }

    onAnnotationFocused({ id }) {
        setFocused(this.textEl, id);
        const mark = this.textEl.querySelector(`mark.hl[data-annotation-id="${CSS.escape(id)}"]`);
        if (!mark) return;
        mark.scrollIntoView({ behavior: "smooth", block: "center" });
        mark.animate(
            [{ backgroundColor: "var(--mark-soft)" }, { backgroundColor: "transparent" }],
            { duration: FOCUS_FLASH_MS, easing: "ease-out" }
        );
    }

    scheduleSelectionResolve() {
        if (!this.currentFile && !this.continuous) return;
        // mouseup fires after the selection settles; no debounce, no race.
        queueMicrotask(() => this.emitSelection());
    }

    emitSelection() {
        const sel = document.getSelection();
        const anchor = resolveAnchored(sel, this.textEl);
        if (!anchor) {
            this.deps.bus.emit(Events.SELECTION_CLEARED);
            return;
        }
        // In continuous mode, the anchor carries its own filePath captured
        // from the file-segment DOM ancestor; in single-file mode, fall back
        // to the loaded file. This lets the composer save against the right
        // path regardless of which segment the reviewer is scrolled to.
        const filePath = anchor.filePath ?? this.currentFile?.filePath ?? null;
        const chapterTitle = anchor.filePath
            ? null
            : this.currentFile?.chapterTitle ?? null;
        this.deps.bus.emit(Events.SELECTION_MADE, {
            anchor,
            filePath,
            chapterTitle,
        });
    }

    onClick(ev) {
        const mark = ev.target.closest("mark.hl");
        if (!mark) return;
        const id = mark.dataset.annotationId;
        if (id) this.deps.bus.emit(Events.ANNOTATION_FOCUSED, { id, fromManuscript: true });
    }
}

function renderMasthead(chapterNum, title) {
    const kicker = chapterNum != null ? `Chapter ${escape(chapterNum)}` : "manuscript";
    return `
        <header class="manuscript__masthead">
            <p class="manuscript__kicker">${escape(kicker)}</p>
            <h1 class="manuscript__title">${escape(title ?? "")}</h1>
        </header>
    `;
}

function escape(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
}
