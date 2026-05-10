// Marginalia. Owns everything inside the document's right gutter: rendered
// notes (anchored, section, document), the inline composer, the empty-state
// hint. Computes vertical offsets so each note sits beside the line it
// comments on, then runs a settle pass to prevent overlap.
// Pattern: imperative DOM rendering with a layout engine on top.

import { Component } from "../lib/component.js";
import { Events } from "../lib/eventBus.js";
import { Annotation, CATEGORY_ORDER, Categories, Statuses } from "../annotations/annotation.js";
import { applyDraftMark, clearDraftMark, updateDraftCategory } from "../annotations/highlightLayer.js";

const SETTLE_GAP = 14;       // px between notes
const NOTE_RAF_DEBOUNCE = 1; // frames

const CAT_LABELS = {
    prose: "prose",
    accuracy: "accuracy",
    citation: "cite",
    structure: "struct",
    length: "length",
    voice: "voice",
    keep: "keep",
};

export class Marginalia extends Component {
    constructor(rootEl, deps) {
        super(rootEl, deps);
        this.documentEl = rootEl;
        this.gutterEl = rootEl.querySelector("#document-gutter");
        this.textEl = rootEl.querySelector("#document-text");
        this.currentFile = null;
        this.annotations = [];
        this.activeFilter = "open";
        this.composerOpen = null; // { context, scope, anchorEl }
        this.editingId = null;
        this.scheduledLayout = null;
        this.anchorStates = new Map(); // id -> { state, blockEl }
        this.activePassId = null;
        this.continuous = false;
    }

    mount() {
        this.listen(Events.FILE_LOADED, this.onFileLoaded);
        this.listen(Events.ANNOTATION_CREATED, this.refresh);
        this.listen(Events.ANNOTATION_UPDATED, this.refresh);
        this.listen(Events.ANNOTATION_DELETED, this.refresh);
        this.listen(Events.LAYOUT_REFLOW, this.scheduleLayout);
        this.listen(Events.ANCHOR_STATES_RESOLVED, this.onAnchorStatesResolved);
        this.listen(Events.PASS_CHANGED, this.onPassChanged);
        this.listen(Events.WORKSPACE_RENDERED, this.onWorkspaceRendered);
        this.listen(Events.FILTER_CHANGED, this.onFilterChanged);
        this.listen(Events.COMPOSER_OPEN, this.onComposerOpen);
        this.listen(Events.COMPOSER_CLOSE, this.closeComposer);
        this.listen(Events.WORKSPACE_CLEARED, this.onWorkspaceCleared);

        this.bind(window, "resize", this.scheduleLayout);
        this.bind(this.gutterEl, "click", this.onGutterClick);
        this.bind(document, "keydown", this.onKeydown);
    }

    onKeydown(ev) {
        if (!this.composerOpen) return;

        if (ev.key === "Escape") {
            ev.preventDefault();
            this.deps.bus.emit(Events.COMPOSER_CLOSE);
            return;
        }
        if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") {
            ev.preventDefault();
            this.saveComposer();
            return;
        }
        // Ctrl+1-7 always works (lets the user re-categorise mid-typing
        // without leaving the textarea). Cmd+number conflicts with browser
        // tab switching, so we use Ctrl only on every platform.
        if (ev.ctrlKey && !ev.metaKey && !ev.altKey && /^[1-7]$/.test(ev.key)) {
            ev.preventDefault();
            this.setComposerCategory(CATEGORY_ORDER[Number(ev.key) - 1]);
            return;
        }
        // Bare 1-7 still works as a quickness when the textarea is empty.
        const ta = this.gutterEl.querySelector(".composer__body");
        if (ta && document.activeElement === ta && ta.value === "" && /^[1-7]$/.test(ev.key) && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
            ev.preventDefault();
            this.setComposerCategory(CATEGORY_ORDER[Number(ev.key) - 1]);
        }
    }

    async saveComposer() {
        if (!this.composerOpen) return;
        const ta = this.gutterEl.querySelector(".composer__body");
        const body = ta?.value.trim() ?? "";
        const becauseTa = this.gutterEl.querySelector(".composer__because");
        const because = becauseTa?.value.trim() ?? "";
        const c = this.composerOpen;

        if (c.editingId) {
            // Edit mode: patch in place. Always updates body, because, and
            // category. If the reviewer reselected a different passage during
            // this edit session (anchorReanchored is set in onComposerOpen),
            // also patch the anchor fields so the note jumps to the new
            // passage on next applyHighlights.
            const patch = {
                body,
                because,
                category: c.selectedCategory,
            };
            if (c.anchorReanchored && c.anchor) {
                patch.lineStart = c.anchor.lineStart ?? null;
                patch.lineEnd = c.anchor.lineEnd ?? null;
                patch.quote = c.anchor.quote ?? "";
                patch.heading = c.anchor.heading ?? null;
                patch.sectionAnchor = c.anchor.sectionAnchor ?? null;
                patch.block = c.anchor.block ?? null;
                patch.scope = c.scope ?? "anchored";
            }
            const editFilePath = c.filePath ?? this.filePathFor(c.editingId);
            await this.deps.annotationStore.patch(editFilePath, c.editingId, patch);
            this.deps.bus.emit(Events.TOAST, {
                message: c.anchorReanchored ? "note re-anchored" : "note updated",
            });
        } else {
            const ann = Annotation.create({
                filePath: c.filePath,
                documentTitle: c.documentTitle,
                scope: c.scope,
                heading: c.anchor?.heading ?? null,
                sectionAnchor: c.anchor?.sectionAnchor ?? null,
                lineStart: c.anchor?.lineStart ?? null,
                lineEnd: c.anchor?.lineEnd ?? null,
                quote: c.anchor?.quote ?? "",
                category: c.selectedCategory,
                body,
                because,
                block: c.anchor?.block ?? null,
                passId: this.deps.passStore?.getActive()?.id ?? null,
            });
            // Clear the draft before persisting; refreshFromStore in
            // DocumentView will run applyHighlights and lay down the
            // permanent mark.
            clearDraftMark(this.textEl);
            await this.deps.annotationStore.add(ann);
            this.deps.bus.emit(Events.TOAST, { message: "note saved" });
        }

        this.composerOpen = null;
        this.editingId = null;
        document.getSelection()?.removeAllRanges();
    }

    async onFileLoaded({ filePath }) {
        this.currentFile = filePath;
        this.editingId = null;
        this.composerOpen = null;
        await this.refresh();
    }

    onWorkspaceCleared() {
        this.currentFile = null;
        this.annotations = [];
        this.gutterEl.innerHTML = "";
    }

    onFilterChanged({ filter }) {
        this.activeFilter = filter;
        this.documentEl.dataset.filter = filter;
        this.render();
    }

    async refresh() {
        if (this.continuous) {
            const all = await this.deps.annotationStore.listAll();
            this.annotations = [];
            for (const list of all.values()) this.annotations.push(...list);
            this.render();
            return;
        }
        if (!this.currentFile) return;
        this.annotations = await this.deps.annotationStore.listFor(this.currentFile);
        this.render();
    }

    async onWorkspaceRendered() {
        this.continuous = true;
        this.currentFile = null;
        await this.refresh();
    }

    onAnchorStatesResolved({ states }) {
        this.anchorStates = states ?? new Map();
        this.render();
    }

    onPassChanged({ active }) {
        this.activePassId = active?.id ?? null;
        this.render();
    }

    render() {
        const visible = this.annotations.filter((a) => this.passesFilter(a));
        this.gutterEl.innerHTML = "";

        if (visible.length === 0 && !this.composerOpen) {
            this.gutterEl.appendChild(this.renderEmptyHint());
        }

        for (const ann of visible) {
            // The note being edited is replaced by the composer in its slot,
            // so skip rendering it twice.
            if (this.composerOpen?.editingId === ann.id) continue;
            this.gutterEl.appendChild(this.renderNote(ann));
        }

        if (this.composerOpen) {
            this.gutterEl.appendChild(this.renderComposer());
        }

        this.scheduleLayout();
    }

    passesFilter(ann) {
        // Status filter (open/resolved/all) composes with the active pass:
        // when a pass is active, hide notes that belong to a different
        // pass. Notes with no passId always pass the pass-scope filter so
        // legacy notes do not vanish when the reviewer declares a pass.
        if (this.activePassId && ann.passId && ann.passId !== this.activePassId) {
            return false;
        }
        if (this.activeFilter === "all") return true;
        if (this.activeFilter === "open") return ann.status === Statuses.OPEN;
        if (this.activeFilter === "resolved") return ann.status === Statuses.RESOLVED;
        return true;
    }

    onComposerOpen(payload) {
        // Re-anchor support: if a composer is already open, capture the
        // typed body, the chosen category, and (when editing an existing
        // note) the editingId so the reviewer does not lose their work or
        // their edit context when they highlight a different passage.
        const wasOpen = !!this.composerOpen;
        const previousEditingId = wasOpen ? this.composerOpen.editingId ?? null : null;
        const previousBody = wasOpen
            ? (this.gutterEl.querySelector(".composer__body")?.value ?? "")
            : "";
        const previousBecause = wasOpen
            ? (this.gutterEl.querySelector(".composer__because")?.value ?? "")
            : "";
        const previousCategory = wasOpen
            ? this.composerOpen.selectedCategory
            : Categories.PROSE;

        this.composerOpen = {
            scope: payload.scope,
            anchor: payload.anchor,
            filePath: payload.filePath,
            documentTitle: payload.documentTitle,
            selectedCategory: previousCategory,
            preloadBecause: !!previousBecause.trim(),
            // In-edit re-anchor: keep the editingId so the next save patches
            // the existing note instead of creating a new one. The fresh
            // anchor will overwrite the note's quote/lineStart/lineEnd/block.
            editingId: previousEditingId,
            anchorReanchored: !!previousEditingId,
        };
        this.editingId = previousEditingId;
        // Always wipe the previous draft mark; we will paint a fresh one for
        // the new anchor below.
        clearDraftMark(this.textEl);
        this.render();
        if (payload.scope === "anchored") {
            applyDraftMark(this.textEl, payload.anchor, this.composerOpen.selectedCategory);
        }
        // Restore typed text before layout so the textarea height is correct.
        if (previousBody) {
            const ta = this.gutterEl.querySelector(".composer__body");
            if (ta) ta.value = previousBody;
        }
        if (previousBecause) {
            const becauseTa = this.gutterEl.querySelector(".composer__because");
            if (becauseTa) becauseTa.value = previousBecause;
        }
        // Run layout synchronously so the composer is positioned beside the
        // selection BEFORE focus, then focus without letting the browser scroll
        // the viewport to bring the textarea into view.
        this.layout();
        queueMicrotask(() => {
            const ta = this.gutterEl.querySelector(".composer__body");
            if (!ta) return;
            ta.focus({ preventScroll: true });
            if (previousBody) ta.setSelectionRange(previousBody.length, previousBody.length);
        });
    }

    closeComposer() {
        if (!this.composerOpen) return;
        const wasEditing = this.composerOpen.editingId;
        this.composerOpen = null;
        this.editingId = null;
        clearDraftMark(this.textEl);
        document.getSelection()?.removeAllRanges();

        // If the user changed the category during edit but cancelled, the
        // permanent <mark.hl> for that note still carries the in-progress
        // category. Restore it from the persisted annotation.
        if (wasEditing) {
            const ann = this.annotations.find((a) => a.id === wasEditing);
            if (ann) {
                const mark = this.textEl.querySelector(
                    `mark.hl[data-annotation-id="${CSS.escape(wasEditing)}"]`
                );
                if (mark) mark.dataset.category = ann.category;
            }
        }
        this.render();
    }

    /** Set the composer's category from any input source: button click,
     *  bare 1-7, Ctrl+1-7. Also updates the live mark colour: a draft
     *  mark when creating, the permanent mark when editing. */
    setComposerCategory(cat) {
        if (!this.composerOpen) return;
        this.composerOpen.selectedCategory = cat;
        this.gutterEl.querySelectorAll(".composer__cats button").forEach((b) => {
            b.setAttribute("aria-checked", b.dataset.cat === cat ? "true" : "false");
        });
        if (this.composerOpen.editingId) {
            const mark = this.textEl.querySelector(
                `mark.hl[data-annotation-id="${CSS.escape(this.composerOpen.editingId)}"]`
            );
            if (mark) mark.dataset.category = cat;
        } else if (this.composerOpen.scope === "anchored") {
            updateDraftCategory(this.textEl, cat);
        }
    }

    filePathFor(id) {
        // In continuous mode, this.currentFile is null; the annotation's own
        // filePath is the source of truth. Single-file mode keeps the old
        // currentFile fallback so the existing flow is unchanged.
        const ann = this.annotations.find((a) => a.id === id);
        return ann?.filePath ?? this.currentFile ?? null;
    }

    onGutterClick(ev) {
        const noteEl = ev.target.closest(".note");
        if (!noteEl) return;
        const id = noteEl.dataset.id;
        const action = ev.target.closest("[data-action]");

        if (action) {
            ev.stopPropagation();
            const what = action.dataset.action;
            const filePath = this.filePathFor(id);
            if (what === "resolve") this.deps.annotationStore.toggleStatus(filePath, id);
            else if (what === "delete") this.deps.annotationStore.remove(filePath, id);
            else if (what === "edit") this.startEdit(id);
            return;
        }

        this.deps.bus.emit(Events.ANNOTATION_FOCUSED, { id, fromMargin: true });
        noteEl.toggleAttribute("data-expanded");
    }

    /** Open the composer in edit mode: pre-populate the textarea with the
     *  existing body, the category buttons with the existing category. The
     *  user can change either; save patches the annotation in place. */
    startEdit(id) {
        const ann = this.annotations.find((a) => a.id === id);
        if (!ann) return;
        const mark = this.textEl.querySelector(
            `mark.hl[data-annotation-id="${CSS.escape(id)}"]`
        );

        this.composerOpen = {
            editingId: id,
            scope: "anchored",
            anchor: {
                lineStart: ann.lineStart,
                lineEnd: ann.lineEnd,
                quote: ann.quote,
                heading: ann.heading,
                anchorEl: mark,
            },
            filePath: ann.filePath,
            documentTitle: ann.documentTitle,
            selectedCategory: ann.category,
            preloadBecause: !!(ann.because && ann.because.trim()),
        };
        this.editingId = id;

        // No draft mark for edits: the permanent mark already represents the
        // anchor. The category live-updates on the permanent mark via
        // setComposerCategory.
        clearDraftMark(this.textEl);
        this.render();

        const ta = this.gutterEl.querySelector(".composer__body");
        if (ta) ta.value = ann.body ?? "";
        const becauseTa = this.gutterEl.querySelector(".composer__because");
        if (becauseTa) becauseTa.value = ann.because ?? "";

        this.layout();
        queueMicrotask(() => {
            const tx = this.gutterEl.querySelector(".composer__body");
            if (!tx) return;
            tx.focus({ preventScroll: true });
            tx.setSelectionRange(tx.value.length, tx.value.length);
        });
    }

    /** Recompute --offset-px on every gutter child so each note sits next to
     *  its anchor. Then walk top-to-bottom and bump-down any colliders. */
    scheduleLayout() {
        if (this.scheduledLayout) return;
        this.scheduledLayout = requestAnimationFrame(() => {
            this.scheduledLayout = null;
            this.layout();
        });
    }

    layout() {
        const items = [...this.gutterEl.children].filter(
            (el) => el.classList.contains("note") || el.classList.contains("composer")
        );
        if (items.length === 0) return;

        const textTop = this.textEl.getBoundingClientRect().top;

        // Pass 1: natural offsets from each item's anchor.
        const placements = items.map((el) => {
            const naturalTop = anchorTopFor(el, this.textEl, this.composerOpen) - textTop;
            return { el, top: Math.max(0, naturalTop) };
        });

        // Pass 2: settle. Walk top to bottom; bump if overlap.
        placements.sort((a, b) => a.top - b.top);
        for (let i = 1; i < placements.length; i++) {
            const prev = placements[i - 1];
            const prevHeight = prev.el.offsetHeight;
            const minTop = prev.top + prevHeight + SETTLE_GAP;
            if (placements[i].top < minTop) placements[i].top = minTop;
        }

        for (const { el, top } of placements) {
            el.style.setProperty("--offset-px", String(top));
        }
    }

    renderNote(ann) {
        const el = document.createElement("aside");
        el.className = "note";
        el.dataset.id = ann.id;
        el.dataset.category = ann.category;
        el.dataset.scope = ann.scope;
        el.dataset.status = ann.status;

        // Anchor resolution state from the highlight layer (quote / block /
        // orphan). For section/document scopes, anchor state is irrelevant; we
        // leave it unset and the gutter aligns by other means.
        const resolution = this.anchorStates.get(ann.id);
        if (resolution) {
            el.dataset.anchorState = resolution.state;
            if (resolution.state === "block" && resolution.blockEl) {
                const lineStart = resolution.blockEl.dataset.lineStart;
                if (lineStart) el.dataset.blockLineStart = lineStart;
            }
        }
        // Continuous mode: stamp the file path so anchorTopFor scopes its
        // mark.hl and block lookups to the right file segment when several
        // files share the same line numbers.
        if (ann.filePath) el.dataset.filePath = ann.filePath;

        const anchorText = describeAnchor(ann);
        const cat = CAT_LABELS[ann.category] ?? ann.category;

        const becauseHtml = ann.because && ann.because.trim()
            ? `<p class="note__because"><span class="note__because-tag">because</span> ${escape(ann.because)}</p>`
            : "";

        const orphanBadge = resolution?.state === "orphan"
            ? `<span class="note__orphan-badge">orphan</span>`
            : "";

        // Acceptance trace: when a note is resolved, render a small italic
        // line recording when it closed and how (manual click or applied.md
        // roundtrip from a drafter agent). This survives across reloads.
        const traceHtml = ann.status === "resolved" && ann.resolvedAt
            ? `<p class="note__trace">${escape(ann.acceptedSource === "applied" ? "applied" : "resolved")} ${escape(formatTraceDate(ann.resolvedAt))}</p>`
            : "";

        el.innerHTML = `
            <p class="note__meta">
                <span class="note__meta-anchor">${escape(anchorText)}</span>
                <span class="note__meta-cat">· ${escape(cat)}</span>
                ${orphanBadge}
            </p>
            <p class="note__body">${escape(ann.body || "(no comment)")}</p>
            ${becauseHtml}
            ${traceHtml}
            <div class="note__actions">
                <button data-action="resolve">${ann.status === "resolved" ? "reopen" : "resolve"}</button>
                <button data-action="edit">edit</button>
                <button data-action="delete">delete</button>
            </div>
        `;
        return el;
    }

    renderComposer() {
        const c = this.composerOpen;
        const verb = c.editingId ? "editing" : "new note";
        const meta = `${describeAnchor({ ...c.anchor, scope: "anchored" })} · ${verb}`;
        // Auto-expand the rationale disclosure on edit when the persisted
        // note already has a non-empty `because`. New notes start collapsed.
        const becauseOpen = !!(c.editingId && c.preloadBecause);

        const form = document.createElement("form");
        form.className = "composer";
        form.innerHTML = `
            <p class="composer__meta">${escape(meta)}</p>
            <textarea class="composer__body" rows="3"
                      placeholder="What about this passage? (1–7 to categorise. ⌘↵ to save.)"></textarea>
            <details class="composer__because-disclosure"${becauseOpen ? " open" : ""}>
                <summary>+ rationale (optional)</summary>
                <textarea class="composer__because" rows="2"
                          placeholder="Why this note? (citation, style rule, prior note, etc.)"></textarea>
            </details>
            <div class="composer__cats" role="radiogroup" aria-label="Category">
                ${CATEGORY_ORDER.map((cat, i) => `
                    <button type="button" data-cat="${cat}"
                            aria-checked="${cat === c.selectedCategory ? "true" : "false"}">
                        ${i + 1}. ${CAT_LABELS[cat]}
                    </button>
                `).join("")}
            </div>
            <p class="composer__hint">
                <kbd>esc</kbd> cancel · <kbd>⌘↵</kbd> save · <kbd>⌃1–7</kbd> category
            </p>
        `;

        form.addEventListener("submit", (e) => e.preventDefault());
        form.querySelectorAll(".composer__cats button").forEach((btn) => {
            btn.addEventListener("click", () => this.setComposerCategory(btn.dataset.cat));
        });
        return form;
    }

    renderEmptyHint() {
        const el = document.createElement("div");
        el.className = "gutter-empty";
        el.innerHTML = `
            no notes yet. select any passage to leave a note.
            <div class="dots">
                ${CATEGORY_ORDER.map((c) => `<span style="--cat: var(--cat-${c})"></span>`).join("")}
            </div>
        `;
        return el;
    }
}

function anchorTopFor(el, textRoot, composerCtx) {
    const id = el.dataset.id;

    if (el.classList.contains("composer") && composerCtx) {
        const anchorEl = composerCtx.anchor?.anchorEl ?? textRoot.firstElementChild;
        if (!anchorEl) return 0;
        return anchorEl.getBoundingClientRect().top;
    }

    // In continuous mode, scope the lookups to the right file segment so
    // identical line numbers across files cannot cross-anchor.
    const segment = scopeForNoteEl(el, textRoot);

    // Quote-anchored note: position next to the highlight that matches its id.
    if (id) {
        const mark = segment.querySelector(`mark.hl[data-annotation-id="${CSS.escape(id)}"]`);
        if (mark) return mark.getBoundingClientRect().top;
    }

    // Block-anchored note: align to the top of the resolved block (no mark.hl
    // exists in this state). The block's source-line start was stamped on the
    // note element when the resolution map arrived.
    const blockLineStart = el.dataset.blockLineStart;
    if (blockLineStart) {
        const block = segment.querySelector(`.block[data-line-start="${CSS.escape(blockLineStart)}"]`);
        if (block) return block.getBoundingClientRect().top;
    }

    // Orphan or unknown: stay at the top of the gutter so it is visible.
    return 0;
}

function scopeForNoteEl(el, textRoot) {
    const filePath = el.dataset.filePath;
    if (!filePath) return textRoot;
    const segment = textRoot.querySelector(`[data-file-path="${CSS.escape(filePath)}"]`);
    return segment ?? textRoot;
}

function describeAnchor(ann) {
    if (ann.lineStart && ann.lineEnd) {
        return ann.lineStart === ann.lineEnd
            ? `L${ann.lineStart}`
            : `L${ann.lineStart}-${ann.lineEnd}`;
    }
    return "·";
}

function formatTraceDate(iso) {
    // Render the resolved-at as just the date (YYYY-MM-DD) for the gutter;
    // the full ISO timestamp is preserved on the annotation and in exports.
    if (typeof iso !== "string") return "";
    const m = iso.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : iso;
}

function escape(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
}
