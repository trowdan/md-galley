// Marginalia. Owns everything inside the manuscript's right gutter: rendered
// notes (anchored, section, chapter), the inline composer, the empty-state
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
        this.manuscriptEl = rootEl;
        this.gutterEl = rootEl.querySelector("#manuscript-gutter");
        this.textEl = rootEl.querySelector("#manuscript-text");
        this.currentFile = null;
        this.annotations = [];
        this.activeFilter = "open";
        this.composerOpen = null; // { context, scope, anchorEl }
        this.editingId = null;
        this.scheduledLayout = null;
    }

    mount() {
        this.listen(Events.FILE_LOADED, this.onFileLoaded);
        this.listen(Events.ANNOTATION_CREATED, this.refresh);
        this.listen(Events.ANNOTATION_UPDATED, this.refresh);
        this.listen(Events.ANNOTATION_DELETED, this.refresh);
        this.listen(Events.LAYOUT_REFLOW, this.scheduleLayout);
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
        const c = this.composerOpen;

        if (c.editingId) {
            // Edit mode: patch in place. Updates body and category; the
            // anchor stays attached to whatever passage the original note
            // referenced.
            await this.deps.annotationStore.patch(this.currentFile, c.editingId, {
                body,
                category: c.selectedCategory,
            });
            this.deps.bus.emit(Events.TOAST, { message: "note updated" });
        } else {
            const ann = Annotation.create({
                filePath: c.filePath,
                chapterTitle: c.chapterTitle,
                scope: c.scope,
                heading: c.anchor?.heading ?? null,
                sectionAnchor: c.anchor?.sectionAnchor ?? null,
                lineStart: c.anchor?.lineStart ?? null,
                lineEnd: c.anchor?.lineEnd ?? null,
                quote: c.anchor?.quote ?? "",
                category: c.selectedCategory,
                body,
            });
            // Clear the draft before persisting; refreshFromStore in
            // Manuscript will run applyHighlights and lay down the
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
        this.manuscriptEl.dataset.filter = filter;
        this.render();
    }

    async refresh() {
        if (!this.currentFile) return;
        this.annotations = await this.deps.annotationStore.listFor(this.currentFile);
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
        if (this.activeFilter === "all") return true;
        if (this.activeFilter === "open") return ann.status === Statuses.OPEN;
        if (this.activeFilter === "resolved") return ann.status === Statuses.RESOLVED;
        return true;
    }

    onComposerOpen(payload) {
        // Re-anchor support: if a composer is already open, capture the
        // typed body and the chosen category so the reviewer does not lose
        // their work when they highlight a different passage.
        const wasOpen = !!this.composerOpen;
        const previousBody = wasOpen
            ? (this.gutterEl.querySelector(".composer__body")?.value ?? "")
            : "";
        const previousCategory = wasOpen
            ? this.composerOpen.selectedCategory
            : Categories.PROSE;

        this.composerOpen = {
            scope: payload.scope,
            anchor: payload.anchor,
            filePath: payload.filePath,
            chapterTitle: payload.chapterTitle,
            selectedCategory: previousCategory,
        };
        this.editingId = null;
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

    onGutterClick(ev) {
        const noteEl = ev.target.closest(".note");
        if (!noteEl) return;
        const id = noteEl.dataset.id;
        const action = ev.target.closest("[data-action]");

        if (action) {
            ev.stopPropagation();
            const what = action.dataset.action;
            if (what === "resolve") this.deps.annotationStore.toggleStatus(this.currentFile, id);
            else if (what === "delete") this.deps.annotationStore.remove(this.currentFile, id);
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
            chapterTitle: ann.chapterTitle,
            selectedCategory: ann.category,
        };
        this.editingId = id;

        // No draft mark for edits: the permanent mark already represents the
        // anchor. The category live-updates on the permanent mark via
        // setComposerCategory.
        clearDraftMark(this.textEl);
        this.render();

        const ta = this.gutterEl.querySelector(".composer__body");
        if (ta) ta.value = ann.body ?? "";

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

        const anchorText = describeAnchor(ann);
        const cat = CAT_LABELS[ann.category] ?? ann.category;

        el.innerHTML = `
            <p class="note__meta">
                <span class="note__meta-anchor">${escape(anchorText)}</span>
                <span class="note__meta-cat">· ${escape(cat)}</span>
            </p>
            <p class="note__body">${escape(ann.body || "(no comment)")}</p>
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

        const form = document.createElement("form");
        form.className = "composer";
        form.innerHTML = `
            <p class="composer__meta">${escape(meta)}</p>
            <textarea class="composer__body" rows="3"
                      placeholder="What about this passage? (1–7 to categorise. ⌘↵ to save.)"></textarea>
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

    // Anchored note: position next to the highlight that matches its id.
    if (id) {
        const mark = textRoot.querySelector(`mark.hl[data-annotation-id="${CSS.escape(id)}"]`);
        if (mark) return mark.getBoundingClientRect().top;
    }
    return 0;
}

function describeAnchor(ann) {
    if (ann.lineStart && ann.lineEnd) {
        return ann.lineStart === ann.lineEnd
            ? `L${ann.lineStart}`
            : `L${ann.lineStart}-${ann.lineEnd}`;
    }
    return "·";
}

function escape(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
}
