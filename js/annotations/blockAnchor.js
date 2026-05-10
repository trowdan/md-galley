// Block-level anchor capture and lookup. Pure DOM, no I/O.
//
// A block's identity is (headingChain, ordinal):
//   - headingChain: text of preceding headings at strictly higher levels,
//     outermost first. Empty for blocks before any heading.
//   - ordinal: 1-based index of this block within its immediate section
//     (between this section's heading and the next sibling-or-higher heading),
//     counting only non-heading-only blocks.
//
// Used by:
//   - anchor.js (capture at note creation)
//   - highlightLayer.js (lookup as fallback when quote-match fails)

const HEADING_TAGS = ["H1", "H2", "H3", "H4", "H5", "H6"];

/**
 * @param {HTMLElement} blockEl a `.block` element produced by the renderer
 * @param {HTMLElement} textRoot the manuscript text root
 * @returns {{ headingChain: string[], ordinal: number } | null}
 */
export function captureBlockRef(blockEl, textRoot) {
    if (!blockEl || !textRoot.contains(blockEl)) return null;
    const blocks = [...textRoot.querySelectorAll(".block")];
    const myIndex = blocks.indexOf(blockEl);
    if (myIndex < 0) return null;

    const myHeadingLevel = blockHeadingLevel(blockEl);
    if (myHeadingLevel) {
        // Block IS a heading. We anchor only to non-heading blocks. Treat the
        // first non-heading block under this heading as the canonical anchor.
        return null;
    }

    // Walk back to find the immediate preceding heading and the chain of
    // strictly-higher-level ancestors above it.
    let immediateLevel = 0;
    let immediateText = null;
    const chain = [];
    for (let i = myIndex - 1; i >= 0; i--) {
        const lvl = blockHeadingLevel(blocks[i]);
        if (!lvl) continue;
        if (immediateText === null) {
            immediateLevel = lvl;
            immediateText = blockText(blocks[i]);
            chain.unshift(immediateText);
            continue;
        }
        if (lvl < immediateLevel) {
            immediateLevel = lvl;
            chain.unshift(blockText(blocks[i]));
            if (lvl === 1) break;
        }
    }

    // Ordinal: count non-heading blocks between the immediate heading and
    // this block, inclusive of this one (1-based).
    let ordinal = 0;
    const startIdx = immediateText === null
        ? 0
        : findHeadingIndex(blocks, myIndex, immediateText, immediateLevel);
    for (let i = startIdx; i <= myIndex; i++) {
        if (!blockHeadingLevel(blocks[i])) ordinal++;
    }

    return { headingChain: chain, ordinal };
}

/**
 * @param {HTMLElement} textRoot
 * @param {{ headingChain: string[], ordinal: number }} ref
 * @returns {{ blockEl: HTMLElement|null, state: 'found'|'ambiguous'|'missing' }}
 */
export function findBlockByRef(textRoot, ref) {
    if (!ref || !Number.isFinite(ref.ordinal) || ref.ordinal < 1) {
        return { blockEl: null, state: "missing" };
    }
    const blocks = [...textRoot.querySelectorAll(".block")];

    // Locate the immediate heading: the last heading in `headingChain` (or
    // start-of-file when the chain is empty). Disambiguate against the chain.
    const startCandidates = findSectionStarts(blocks, ref.headingChain);
    if (startCandidates.length === 0 && ref.headingChain.length > 0) {
        return { blockEl: null, state: "missing" };
    }
    if (startCandidates.length > 1) {
        return { blockEl: null, state: "ambiguous" };
    }

    const sectionStart = startCandidates.length === 1 ? startCandidates[0] : 0;
    const sectionEnd = sectionEndIndex(blocks, sectionStart);

    // Walk forward, skipping heading blocks, counting until we hit the ordinal.
    let count = 0;
    for (let i = sectionStart; i <= sectionEnd; i++) {
        if (blockHeadingLevel(blocks[i])) continue;
        count++;
        if (count === ref.ordinal) {
            return { blockEl: blocks[i], state: "found" };
        }
    }
    return { blockEl: null, state: "missing" };
}

function blockHeadingLevel(blockEl) {
    if (!blockEl) return 0;
    // A block is a "heading block" iff its only meaningful child is an
    // h1..h6. Renderer wraps each top-level marked token in a `.block` div,
    // and a heading token produces exactly an <h1..h6> inside.
    for (const tag of HEADING_TAGS) {
        const h = blockEl.querySelector(tag);
        if (h && blockEl.firstElementChild === h) {
            return Number(tag.slice(1));
        }
    }
    return 0;
}

function blockText(blockEl) {
    return (blockEl?.textContent ?? "").trim().replace(/\s+/g, " ");
}

function findHeadingIndex(blocks, beforeIndex, text, level) {
    for (let i = beforeIndex - 1; i >= 0; i--) {
        if (blockHeadingLevel(blocks[i]) === level && blockText(blocks[i]) === text) {
            return i;
        }
    }
    return 0;
}

/** Find every section start whose heading-chain matches `chain`. A "section
 *  start" is the index of the chain's last heading; the chain ancestors must
 *  appear earlier (in order, at strictly higher levels) without an interrupting
 *  heading at the same level as the named ancestor. */
function findSectionStarts(blocks, chain) {
    if (chain.length === 0) return [];
    const lastText = chain[chain.length - 1];
    const matches = [];
    for (let i = 0; i < blocks.length; i++) {
        const lvl = blockHeadingLevel(blocks[i]);
        if (!lvl) continue;
        if (blockText(blocks[i]) !== lastText) continue;
        if (chainMatchesUpTo(blocks, i, chain)) matches.push(i);
    }
    return matches;
}

function chainMatchesUpTo(blocks, headingIdx, chain) {
    if (chain.length === 1) return true;
    const ancestors = chain.slice(0, -1).reverse();
    let cursor = headingIdx - 1;
    let expectedLevel = blockHeadingLevel(blocks[headingIdx]) - 1;
    for (const text of ancestors) {
        let found = false;
        while (cursor >= 0 && expectedLevel > 0) {
            const lvl = blockHeadingLevel(blocks[cursor]);
            if (lvl > 0 && lvl <= expectedLevel) {
                if (lvl === expectedLevel && blockText(blocks[cursor]) === text) {
                    found = true;
                    expectedLevel--;
                    cursor--;
                    break;
                }
                if (lvl < expectedLevel) {
                    return false;
                }
            }
            cursor--;
        }
        if (!found) return false;
    }
    return true;
}

function sectionEndIndex(blocks, sectionStart) {
    const startLevel = blockHeadingLevel(blocks[sectionStart]) || 0;
    for (let i = sectionStart + 1; i < blocks.length; i++) {
        const lvl = blockHeadingLevel(blocks[i]);
        if (lvl > 0 && lvl <= startLevel) return i - 1;
    }
    return blocks.length - 1;
}
