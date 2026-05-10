// Anchor resolver. Translates a live DOM Selection into the persistent
// fields stored on an annotation: source line range, nearest preceding
// heading (for context), the verbatim quoted text, a block-level fallback
// reference (heading chain + ordinal), and a viewport rect.

import { captureBlockRef } from "./blockAnchor.js";

const HEADING_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);

/**
 * @param {Selection} selection a non-collapsed Selection inside the manuscript text
 * @param {HTMLElement} textRoot the manuscript text root
 * @returns {null | { scope: "anchored", lineStart: number, lineEnd: number,
 *                   quote: string, heading: string|null, rect: DOMRect,
 *                   anchorEl: HTMLElement }}
 */
export function resolveAnchored(selection, textRoot) {
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

    const range = selection.getRangeAt(0);
    if (!textRoot.contains(range.commonAncestorContainer)) return null;

    const startBlock = nearestBlock(range.startContainer, textRoot);
    const endBlock = nearestBlock(range.endContainer, textRoot);
    if (!startBlock || !endBlock) return null;

    const lineStart = Number(startBlock.dataset.lineStart);
    const lineEnd = Number(endBlock.dataset.lineEnd);
    if (!Number.isFinite(lineStart) || !Number.isFinite(lineEnd)) return null;

    const quote = range.toString().replace(/\s+/g, " ").trim();
    if (!quote) return null;

    // Continuous-mode support: when the workspace is rendered as one text,
    // each file lives inside a `<section data-file-path="…">`. Capture the
    // path from the DOM so the composer creates the note against the right
    // file regardless of which segment the reviewer was scrolled to.
    const fileSegment = startBlock.closest("[data-file-path]");
    const filePath = fileSegment?.getAttribute("data-file-path") ?? null;

    return {
        scope: "anchored",
        lineStart: Math.min(lineStart, lineEnd),
        lineEnd: Math.max(lineStart, lineEnd),
        quote,
        heading: findPrecedingHeading(startBlock, textRoot),
        block: captureBlockRef(startBlock, textRoot),
        filePath,
        rect: range.getBoundingClientRect(),
        anchorEl: startBlock,
    };
}

function nearestBlock(node, root) {
    let n = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    while (n && n !== root) {
        if (n.classList?.contains("block")) return n;
        n = n.parentElement;
    }
    return null;
}

function findPrecedingHeading(block, root) {
    const innerHeading = block.querySelector("h1, h2, h3, h4, h5, h6");
    if (innerHeading) return innerHeading.textContent.trim();
    let cur = block.previousElementSibling;
    while (cur && cur !== root) {
        const h = cur.querySelector("h1, h2, h3, h4, h5, h6");
        if (h) return h.textContent.trim();
        if (cur.tagName && HEADING_TAGS.has(cur.tagName)) return cur.textContent.trim();
        cur = cur.previousElementSibling;
    }
    return null;
}
