// Markdown renderer. Tokenises with marked, renders block-by-block, wraps
// each top-level block in a div carrying its source line range, and runs
// every block's HTML through DOMPurify before it reaches the DOM.
// Pattern: visitor over marked tokens with a defang pass at the boundary.

import { marked } from "../../vendor/marked.esm.js";
import { splitFrontmatter } from "./frontmatter.js";
import { sanitize } from "../lib/sanitizer.js";

/**
 * @param {string} rawSource raw file content
 * @returns {{html: string, data: object|null, bodyStartLine: number}}
 */
export function renderMarkdown(rawSource) {
    const source = rawSource.replace(/\r\n/g, "\n");
    const { body, data, bodyStartLine } = splitFrontmatter(source);

    const tokens = marked.lexer(body, { gfm: true });
    const parts = [];
    let cursor = bodyStartLine;

    for (const token of tokens) {
        const raw = token.raw ?? "";
        const newlines = countNewlines(raw);

        if (token.type === "space") {
            cursor += newlines;
            continue;
        }

        const blockLineCount = stripTrailingNewlines(raw).split("\n").length;
        const start = cursor;
        const end = start + blockLineCount - 1;

        const inner = sanitize(marked.parser([token], { gfm: true }));
        parts.push(
            `<div class="block" data-line-start="${start}" data-line-end="${end}">${inner}</div>`
        );

        cursor += newlines;
    }

    return { html: parts.join(""), data, bodyStartLine };
}

function countNewlines(s) {
    let n = 0;
    for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++;
    return n;
}

function stripTrailingNewlines(s) {
    let i = s.length;
    while (i > 0 && s.charCodeAt(i - 1) === 10) i--;
    return s.slice(0, i);
}
