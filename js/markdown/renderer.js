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

/** Render a sequence of files as one continuous workspace text. Each file
 *  becomes a `<section.file-segment>` carrying its path; the section's
 *  blocks keep their normal `.block[data-line-start]` shape so anchor
 *  resolution and highlights work per-file. A small file-boundary header
 *  precedes each segment.
 *  @param {Array<{path: string, source: string}>} files in render order
 *  @returns {{html: string, files: Array<{path: string, title: string|null}>}}
 */
export function renderWorkspace(files) {
    const parts = [];
    const meta = [];
    for (const { path, source } of files) {
        const { html, data } = renderMarkdown(source);
        const title = data?.title ?? null;
        meta.push({ path, title });
        const escapedPath = escapeAttr(path);
        const escapedTitle = title ? escapeText(title) : escapeText(path);
        parts.push(
            `<section class="file-segment" data-file-path="${escapedPath}" id="file-${slugForId(path)}">` +
                `<header class="file-segment__head">` +
                    `<span class="file-segment__kicker">file</span>` +
                    `<span class="file-segment__path">${escapeText(path)}</span>` +
                    `<h2 class="file-segment__title">${escapedTitle}</h2>` +
                `</header>` +
                html +
            `</section>`
        );
    }
    return { html: parts.join(""), files: meta };
}

function escapeAttr(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
}
function escapeText(s) {
    return String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}
function slugForId(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
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
