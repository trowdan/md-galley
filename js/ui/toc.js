// Toc rail. Walks the rendered manuscript for chapter/section/subsection
// headings and renders a collapsible left rail. Click an entry → scrolls the
// matching heading into view. Each entry shows colored note-count chips for
// every category that has at least one note in that heading's section.
//
// Sectioning rule: a heading "owns" every block from itself up to (but not
// including) the next heading of equal-or-shallower level inside the same
// containing block. Annotations are bucketed by walking the rendered DOM in
// order, maintaining the active heading bucket and counting `mark.hl` spans.

import { Component } from "../lib/component.js";
import { Events } from "../lib/eventBus.js";

const STORAGE_KEY = "mdgalley:toc";
const COLLAPSED_KEY = "mdgalley:toc-collapsed";
const HEADING_SELECTOR = ".manuscript__body :is(h1, h2, h3), .file-segment__title";

export class Toc extends Component {
    constructor(rootEl, deps) {
        super(rootEl, deps);
        this.textEl = document.getElementById("manuscript-text");
        this.toggleEl = document.getElementById("toc-toggle");
        this.scheduled = false;
        this.entries = null;
        this.collapsed = loadCollapsed();
        this.activeId = null;
        this.scrollRaf = false;
        this.onWindowScroll = this.onWindowScroll.bind(this);
        // Set body[data-toc] eagerly so layout-dependent CSS (`.app-shell`
        // padding-left, the toggle's flipped position) settles before paint.
        this.applyStored();
    }

    mount() {
        this.listen(Events.FILE_LOADED, this.scheduleBuild);
        this.listen(Events.WORKSPACE_RENDERED, this.scheduleBuild);
        this.listen(Events.WORKSPACE_CLEARED, this.clear);
        // Note placement updates fire LAYOUT_REFLOW after every annotation
        // mutation (create / update / delete) and after the rehighlight pass
        // on file load. Re-counting on this single channel covers all cases
        // where a heading's bucket may have changed.
        this.listen(Events.LAYOUT_REFLOW, this.scheduleRecount);

        this.bind(this.root, "click", this.onClick);
        if (this.toggleEl) this.bind(this.toggleEl, "click", this.onToggleClick);
        this.syncToggle();
    }

    onToggleClick() {
        this.toggle();
        this.syncToggle();
    }

    syncToggle() {
        if (!this.toggleEl) return;
        const on = document.body.dataset.toc === "true";
        this.toggleEl.setAttribute("aria-expanded", on ? "true" : "false");
    }

    applyStored() {
        let on = true;
        try {
            const v = localStorage.getItem(STORAGE_KEY);
            if (v === "false") on = false;
        } catch {}
        document.body.dataset.toc = String(on);
    }

    /** Public: flip rail visibility and persist. Called from chrome. */
    toggle() {
        const next = document.body.dataset.toc !== "true";
        document.body.dataset.toc = String(next);
        try { localStorage.setItem(STORAGE_KEY, String(next)); } catch {}
        return next;
    }

    clear() {
        this.root.innerHTML = "";
        this.entries = null;
        window.removeEventListener("scroll", this.onWindowScroll);
        this.activeId = null;
        for (const old of this.textEl.querySelectorAll(".toc-sentinel")) old.remove();
    }

    scheduleBuild() {
        if (this.scheduled) return;
        this.scheduled = true;
        requestAnimationFrame(() => {
            this.scheduled = false;
            this.build();
        });
    }

    scheduleRecount() {
        if (this.scheduled) return;
        this.scheduled = true;
        requestAnimationFrame(() => {
            this.scheduled = false;
            if (!this.entries) this.build();
            else this.recount();
        });
    }

    build() {
        // Drop any sentinels left over from a previous build of this document.
        for (const old of this.textEl.querySelectorAll(".toc-sentinel")) old.remove();

        const headings = [...this.textEl.querySelectorAll(HEADING_SELECTOR)];
        if (headings.length === 0) {
            this.root.innerHTML = `
                <header class="toc-rail__head">outline</header>
                <p class="toc-rail__empty">no headings in this document.</p>
            `;
            this.entries = null;
            return;
        }

        const entries = headings.map((el, idx) => {
            if (!el.id) el.id = `toc-h-${idx}`;
            return {
                id: el.id,
                level: levelFor(el),
                text: (el.textContent ?? "").trim(),
                el,
                sentinel: insertSentinel(el),
            };
        });

        const tree = buildTree(entries);
        const html = `
            <header class="toc-rail__head">outline</header>
            ${renderTree(tree, this.collapsed)}
        `;
        this.root.innerHTML = html;
        this.entries = entries;
        this.recount();
        this.setupActiveTracking();
    }

    /** Track which heading the reader is currently inside by mirroring the
     *  sticky-deepest rule: a heading is "passed" when its top has crossed
     *  the sticky threshold (chrome + filter strip). The active entry is the
     *  latest-in-DOM-order heading among the passed ones.
     *
     *  We use a window scroll listener with `offsetTop` (NOT `getBoundingClientRect`)
     *  because the headings live inside `position: sticky` blocks: their painted
     *  rect is the stuck position, not the natural one, which makes IO-based
     *  tracking unreliable. `offsetTop` is layout-flow-only, immune to sticky. */
    setupActiveTracking() {
        window.removeEventListener("scroll", this.onWindowScroll);
        if (!this.entries || this.entries.length === 0) return;
        window.addEventListener("scroll", this.onWindowScroll, { passive: true });
        this.recomputeActive();
        // Defensive: re-run after fonts settle (which can shift offsetTop
        // values) and once more on the next frame so a slow-laying-out doc
        // still ends up with a correct initial highlight.
        if (typeof document.fonts?.ready?.then === "function") {
            document.fonts.ready.then(() => this.recomputeActive());
        }
        requestAnimationFrame(() => this.recomputeActive());
    }

    onWindowScroll() {
        if (this.scrollRaf) return;
        this.scrollRaf = true;
        requestAnimationFrame(() => {
            this.scrollRaf = false;
            this.recomputeActive();
        });
    }

    recomputeActive() {
        if (!this.entries) return;
        // chrome (56) + filter strip (36) = sticky threshold. Same constant
        // as in manuscript.css. If the chrome height token changes, both
        // sites need to move together.
        const stickyTop = 92;
        // Entries are in DOM order. The active heading is the latest one
        // whose natural-flow top has crossed the threshold — same rule as
        // the sticky paint order picks the latest-in-DOM heading to show.
        let next = null;
        for (const entry of this.entries) {
            // Read the sentinel's viewport top directly: the sentinel is in
            // normal flow (not sticky), so this is always the heading's true
            // current viewport position.
            const top = sentinelTop(entry);
            if (top < stickyTop) next = entry.id;
            else break;
        }
        // Top of doc (no heading passed yet): highlight the first one so the
        // rail isn't context-less. Mirrors what the reader sees: they're in
        // the lead-up to the first section.
        if (next == null && this.entries.length > 0) next = this.entries[0].id;
        if (next === this.activeId) return;
        this.activeId = next;
        for (const li of this.root.querySelectorAll(".toc-rail__item")) {
            li.dataset.active = String(li.dataset.id === next);
        }
    }

    /** Re-bucket every visible note into its containing heading and refresh
     *  the colored count chips. Reads the live DOM (no store walk) so the
     *  result reflects exactly what the reader currently sees post-filter. */
    recount() {
        if (!this.entries) return;
        const counts = bucketAnnotations(this.entries, this.textEl);
        for (const entry of this.entries) {
            const slot = this.root.querySelector(
                `[data-target-id="${cssEscape(entry.id)}"] .toc-rail__counts`
            );
            if (!slot) continue;
            slot.innerHTML = renderCounts(counts.get(entry.id) ?? null);
        }
    }

    onClick(ev) {
        const toggle = ev.target.closest(".toc-rail__toggle");
        if (toggle && !toggle.classList.contains("toc-rail__toggle--leaf")) {
            ev.preventDefault();
            const item = toggle.closest(".toc-rail__item");
            if (!item) return;
            const expanded = item.dataset.expanded !== "false";
            const next = !expanded;
            item.dataset.expanded = String(next);
            const id = item.dataset.id;
            if (id) {
                if (next) this.collapsed.delete(id);
                else this.collapsed.add(id);
                saveCollapsed(this.collapsed);
            }
            return;
        }
        const entryEl = ev.target.closest("[data-target-id]");
        if (!entryEl) return;
        ev.preventDefault();
        const id = entryEl.dataset.targetId;
        const entry = this.entries?.find((e) => e.id === id);
        if (!entry) return;
        // Use the sentinel (a non-sticky, zero-height anchor we inject right
        // before each heading-block). When the heading-block is currently
        // sticky-engaged, the heading's getBoundingClientRect is the stuck
        // position (~92), so `scrollIntoView` would only nudge a few pixels.
        // The sentinel is non-sticky, so its rect is always the heading's
        // true natural-flow position.
        const docTop = sentinelTop(entry) + window.scrollY;
        // Land 4px above the sticky threshold so sticky engages on arrival.
        window.scrollTo({ top: Math.max(0, docTop - 88), behavior: "smooth" });
    }
}

/** Insert a zero-height sentinel right before the heading-block (or, in
 *  continuous mode, before the file-segment). The sentinel is non-sticky, so
 *  its `getBoundingClientRect()` is the heading's true natural viewport
 *  position regardless of whether the heading-block is currently stuck. */
function insertSentinel(headingEl) {
    const block = headingEl.closest(".block");
    const head = headingEl.closest(".file-segment__head");
    let target = block;
    if (!target && head) target = head.closest(".file-segment");
    if (!target || !target.parentNode) return null;
    const sentinel = document.createElement("span");
    sentinel.className = "toc-sentinel";
    sentinel.setAttribute("aria-hidden", "true");
    target.parentNode.insertBefore(sentinel, target);
    return sentinel;
}

/** Heading's current viewport y, via its sentinel. */
function sentinelTop(entry) {
    if (entry.sentinel) return entry.sentinel.getBoundingClientRect().top;
    // Fallback: the heading's own rect (less reliable when sticky).
    return entry.el.getBoundingClientRect().top;
}

function levelFor(el) {
    if (el.classList.contains("file-segment__title")) return 1;
    const tag = el.tagName.toLowerCase();
    if (tag === "h1") return 1;
    if (tag === "h2") return 2;
    return 3;
}

/** Convert a flat ordered list of {id, level, text, el} into a tree. Levels
 *  may skip (h1 → h3 with no h2); we always treat each heading as a child of
 *  the nearest preceding heading with a smaller level. */
function buildTree(entries) {
    const root = { level: 0, children: [] };
    const stack = [root];
    for (const entry of entries) {
        while (stack[stack.length - 1].level >= entry.level) stack.pop();
        const node = { ...entry, children: [] };
        stack[stack.length - 1].children.push(node);
        stack.push(node);
    }
    return root.children;
}

function renderTree(nodes, collapsed) {
    if (nodes.length === 0) return "";
    return `<ol class="toc-rail__list">${nodes.map((n) => renderNode(n, collapsed)).join("")}</ol>`;
}

function renderNode(node, collapsed) {
    const hasChildren = node.children.length > 0;
    const isCollapsed = hasChildren && collapsed.has(node.id);
    const expanded = hasChildren && !isCollapsed;
    return `
        <li class="toc-rail__item toc-rail__item--l${node.level}"
            data-id="${escapeAttr(node.id)}"
            data-expanded="${expanded ? "true" : "false"}">
            <div class="toc-rail__row">
                ${hasChildren
                    ? `<button class="toc-rail__toggle" type="button"
                               aria-label="${expanded ? "Collapse" : "Expand"} section">
                         <span class="toc-rail__toggle-glyph" aria-hidden="true">▾</span>
                       </button>`
                    : `<span class="toc-rail__toggle toc-rail__toggle--leaf" aria-hidden="true"></span>`
                }
                <a href="#${escapeAttr(node.id)}" class="toc-rail__entry"
                   data-target-id="${escapeAttr(node.id)}"
                   title="${escapeAttr(node.text)}">
                    <span class="toc-rail__entry-text">${escapeText(node.text)}</span>
                    <span class="toc-rail__counts" aria-hidden="true"></span>
                </a>
            </div>
            ${hasChildren ? renderTree(node.children, collapsed) : ""}
        </li>
    `;
}

function renderCounts(byCategory) {
    if (!byCategory) return "";
    const parts = [];
    for (const [cat, n] of byCategory) {
        if (n <= 0) continue;
        parts.push(
            `<span class="toc-rail__count" data-category="${escapeAttr(cat)}">` +
                `<span class="toc-rail__count-dot" aria-hidden="true"></span>` +
                `<span class="toc-rail__count-num">${n}</span>` +
            `</span>`
        );
    }
    return parts.join("");
}

/** Walk every node: when we hit a heading, that becomes the active bucket.
 *  When we hit a `mark.hl`, increment the active bucket's category count.
 *  Notes that appear before the first heading are dropped (no bucket).
 *  @returns {Map<string, Map<string, number>>} entryId → (category → n) */
function bucketAnnotations(entries, textEl) {
    const byId = new Map(entries.map((e) => [e.id, e]));
    const counts = new Map();
    const walker = document.createTreeWalker(textEl, NodeFilter.SHOW_ELEMENT);
    let activeId = null;
    let node = walker.nextNode();
    while (node) {
        if (node.id && byId.has(node.id)) {
            activeId = node.id;
        } else if (node.classList?.contains("hl")) {
            const cat = node.dataset.category;
            if (activeId && cat) {
                let m = counts.get(activeId);
                if (!m) { m = new Map(); counts.set(activeId, m); }
                m.set(cat, (m.get(cat) ?? 0) + 1);
            }
        }
        node = walker.nextNode();
    }
    return counts;
}

function loadCollapsed() {
    try {
        const raw = localStorage.getItem(COLLAPSED_KEY);
        if (!raw) return new Set();
        const arr = JSON.parse(raw);
        return new Set(Array.isArray(arr) ? arr : []);
    } catch { return new Set(); }
}
function saveCollapsed(set) {
    try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...set])); } catch {}
}

function escapeAttr(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
}
function escapeText(s) {
    return String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}
function cssEscape(s) {
    return (window.CSS?.escape ?? ((x) => String(x).replace(/[^a-zA-Z0-9_-]/g, "\\$&")))(s);
}
