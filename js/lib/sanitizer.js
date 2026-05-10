// HTML sanitiser. Wraps DOMPurify with a configuration tuned for the
// rendered Markdown surface: allows the standard prose subset, blocks
// inline event handlers, neutralises javascript: URLs.
// Pattern: facade over the third-party library so callers don't have
// to know DOMPurify exists.

import DOMPurify from "../../vendor/purify.esm.js";

const PROFILE = {
    USE_PROFILES: { html: true },
    ALLOWED_ATTR: [
        "href", "title", "alt", "src", "class", "id", "lang",
        "colspan", "rowspan",
        "data-line-start", "data-line-end",
    ],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#|\/|\.\.?\/|\?)/i,
    FORBID_TAGS: ["form", "input", "button", "iframe", "object", "embed", "style", "link", "meta"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur", "style"],
    KEEP_CONTENT: true,
};

let purifier = null;

function getPurifier() {
    if (purifier) return purifier;
    purifier = DOMPurify(window);
    purifier.addHook("afterSanitizeAttributes", (node) => {
        if (!(node instanceof Element)) return;
        if (node.tagName === "A") {
            node.setAttribute("rel", "noopener noreferrer");
            node.setAttribute("target", "_blank");
        }
    });
    return purifier;
}

export function sanitize(html) {
    return getPurifier().sanitize(html, PROFILE);
}
