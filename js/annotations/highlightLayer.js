// Highlight layer. Wraps anchored quotes in <mark.hl> spans on the rendered
// manuscript, scoped to the block whose source line range overlaps the
// annotation. Renders only anchored-scope notes; section/chapter scopes
// have no inline mark.
//
// On reload, the source on disk may have changed and the verbatim quote may
// no longer match. When that happens, we fall back to a block-level anchor:
// the (headingChain, ordinal) snapshot captured at note creation. The result
// is reported back as a resolution map so the gutter can re-position the
// note's card on its (now changed) paragraph or flag it as orphan.
//
// Pattern: pure DOM mutation. No event emission.

import { findBlockByRef } from "./blockAnchor.js";

const NORMALISE_RE = /\s+/g;

/** Apply all anchored annotations as <mark.hl> tags. Idempotent.
 *  In continuous (workspace-as-one-text) mode, each note's search is scoped
 *  to its own `<section data-file-path="…">`, so identical lines across
 *  files cannot cross-anchor. In single-file mode, the textRoot is the
 *  scope for every note.
 *  @returns {Map<string, { state: 'quote'|'block'|'orphan', blockEl: HTMLElement|null }>} */
export function applyHighlights(textRoot, annotations) {
    clearHighlights(textRoot);
    const states = new Map();
    const anchored = annotations.filter((a) => a.scope === "anchored");
    for (const ann of anchored) {
        const scope = scopeFor(textRoot, ann);
        if (!scope) {
            // Continuous mode and the file segment for this note is not in
            // the rendered DOM (file removed from the workspace, etc.) -- no
            // way to anchor it. Mark orphan and move on.
            states.set(ann.id, { state: "orphan", blockEl: null });
            continue;
        }
        let placed = false;
        if (ann.quote) {
            try { placed = wrapQuote(scope, ann); }
            catch (err) { console.warn("highlightLayer: anchor failed", ann.id, err); }
        }
        if (placed) {
            states.set(ann.id, { state: "quote", blockEl: null });
            continue;
        }
        if (ann.block) {
            const { blockEl, state } = findBlockByRef(scope, ann.block);
            if (state === "found" && blockEl) {
                states.set(ann.id, { state: "block", blockEl });
                continue;
            }
            states.set(ann.id, { state: "orphan", blockEl: null });
            continue;
        }
        states.set(ann.id, { state: "orphan", blockEl: null });
    }
    return states;
}

function scopeFor(textRoot, ann) {
    // If the textRoot already represents one file (single-file mode), return
    // it directly. Otherwise, find the segment whose data-file-path matches
    // the note. Falls back to textRoot when filePath is missing (legacy).
    if (!ann.filePath) return textRoot;
    const segment = textRoot.querySelector(`[data-file-path="${CSS.escape(ann.filePath)}"]`);
    return segment ?? textRoot;
}

export function clearHighlights(textRoot) {
    textRoot.querySelectorAll("mark.hl").forEach((mark) => {
        const parent = mark.parentNode;
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        parent.removeChild(mark);
        parent.normalize?.();
    });
}

export function setFocused(textRoot, annotationId) {
    textRoot.querySelectorAll("mark.hl[data-focused='true']").forEach((m) => {
        m.removeAttribute("data-focused");
    });
    if (!annotationId) return;
    const target = textRoot.querySelector(`mark.hl[data-annotation-id="${CSS.escape(annotationId)}"]`);
    if (target) target.setAttribute("data-focused", "true");
}

/** Wrap the live selection's quote inside textRoot as a transient draft mark.
 *  Stays in the DOM while the composer is open; cleared on cancel; replaced
 *  by a permanent mark when the composer saves and applyHighlights runs. */
export function applyDraftMark(textRoot, anchor, category) {
    clearDraftMark(textRoot);
    if (!anchor || !anchor.quote) return;
    const draft = {
        id: "draft",
        category,
        status: "open",
        lineStart: anchor.lineStart,
        lineEnd: anchor.lineEnd,
        quote: anchor.quote,
        isDraft: true,
    };
    const blocks = blocksInRange(textRoot, draft.lineStart, draft.lineEnd);
    if (blocks.length === 0) return;
    const needle = draft.quote.replace(NORMALISE_RE, " ").trim();
    if (!needle) return;
    for (const block of blocks) {
        if (tryWrapInside(block, needle, draft)) return;
    }
    tryWrapInside(textRoot, needle, draft);
}

export function clearDraftMark(textRoot) {
    textRoot.querySelectorAll('mark.hl[data-draft="true"]').forEach((m) => {
        const parent = m.parentNode;
        while (m.firstChild) parent.insertBefore(m.firstChild, m);
        parent.removeChild(m);
        parent.normalize?.();
    });
}

export function updateDraftCategory(textRoot, category) {
    textRoot.querySelectorAll('mark.hl[data-draft="true"]').forEach((m) => {
        m.dataset.category = category;
    });
}

function wrapQuote(textRoot, ann) {
    const blocks = blocksInRange(textRoot, ann.lineStart, ann.lineEnd);
    const needle = ann.quote.replace(NORMALISE_RE, " ").trim();
    if (!needle) return false;

    for (const block of blocks) {
        if (tryWrapInside(block, needle, ann)) return true;
    }
    return tryWrapInside(textRoot, needle, ann);
}

function blocksInRange(root, lineStart, lineEnd) {
    return [...root.querySelectorAll(".block")].filter((b) => {
        const s = Number(b.dataset.lineStart);
        const e = Number(b.dataset.lineEnd);
        return s <= lineEnd && e >= lineStart;
    });
}

function tryWrapInside(scope, needle, ann) {
    const segments = collectTextSegments(scope);
    const flat = segments.map((s) => s.text).join("").replace(NORMALISE_RE, " ");
    const idx = flat.indexOf(needle);
    if (idx < 0) return false;

    const startPos = mapFlatToOriginal(segments, idx);
    const endPos = mapFlatToOriginal(segments, idx + needle.length);
    if (!startPos || !endPos) return false;

    const range = document.createRange();
    range.setStart(startPos.node, startPos.offset);
    range.setEnd(endPos.node, endPos.offset);

    surroundSafely(range, ann);
    return true;
}

function collectTextSegments(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            if (node.parentElement?.closest("mark.hl")) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        },
    });
    const segments = [];
    let node;
    while ((node = walker.nextNode())) segments.push({ node, text: node.nodeValue });
    return segments;
}

function mapFlatToOriginal(segments, flatIdx) {
    let acc = 0;
    for (const seg of segments) {
        const normalised = seg.text.replace(NORMALISE_RE, " ");
        const segLen = normalised.length;
        if (flatIdx <= acc + segLen) {
            const offsetInNormalised = flatIdx - acc;
            const offset = mapNormalisedOffsetToOriginal(seg.text, offsetInNormalised);
            return { node: seg.node, offset };
        }
        acc += segLen;
    }
    return null;
}

function mapNormalisedOffsetToOriginal(text, offset) {
    let out = 0;
    let normalisedIdx = 0;
    let lastWasSpace = false;
    while (normalisedIdx < offset && out < text.length) {
        const ch = text[out];
        const isSpace = /\s/.test(ch);
        if (isSpace) {
            if (!lastWasSpace) normalisedIdx++;
            lastWasSpace = true;
        } else {
            normalisedIdx++;
            lastWasSpace = false;
        }
        out++;
    }
    return out;
}

function surroundSafely(range, ann) {
    const wrap = (textNode, start, end) => {
        if (start === end) return null;
        const before = textNode.nodeValue.slice(0, start);
        const middle = textNode.nodeValue.slice(start, end);
        const after = textNode.nodeValue.slice(end);
        const parent = textNode.parentNode;
        const beforeNode = before ? document.createTextNode(before) : null;
        const afterNode = after ? document.createTextNode(after) : null;
        const mark = document.createElement("mark");
        mark.className = "hl";
        mark.dataset.annotationId = ann.id;
        mark.dataset.category = ann.category;
        mark.dataset.status = ann.status;
        if (ann.isDraft) mark.dataset.draft = "true";
        mark.appendChild(document.createTextNode(middle));
        if (beforeNode) parent.insertBefore(beforeNode, textNode);
        parent.insertBefore(mark, textNode);
        if (afterNode) parent.insertBefore(afterNode, textNode);
        parent.removeChild(textNode);
        return mark;
    };

    const startContainer = range.startContainer;
    const endContainer = range.endContainer;

    if (startContainer === endContainer && startContainer.nodeType === Node.TEXT_NODE) {
        wrap(startContainer, range.startOffset, range.endOffset);
        return;
    }

    const collected = [];
    const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
        if (range.intersectsNode(node)) collected.push(node);
    }
    for (const tn of collected) {
        const start = tn === startContainer ? range.startOffset : 0;
        const end = tn === endContainer ? range.endOffset : tn.nodeValue.length;
        wrap(tn, start, end);
    }
}
