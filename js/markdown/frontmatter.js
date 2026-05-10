// Tiny YAML front-matter parser. Scope is intentionally narrow: only the
// flat shape this app expects (key: scalar, key: [scalar, ...]).
// Returns body, parsed front matter object, and the source line on which
// body starts.

const FENCE = "---";

export function splitFrontmatter(source) {
    if (!source.startsWith(`${FENCE}\n`)) {
        return { body: source, data: null, bodyStartLine: 1 };
    }
    const closeIdx = source.indexOf(`\n${FENCE}`, FENCE.length);
    if (closeIdx < 0) return { body: source, data: null, bodyStartLine: 1 };

    const fmRaw = source.slice(FENCE.length + 1, closeIdx);
    const after = closeIdx + 1 + FENCE.length;
    const trimmedAfter = source[after] === "\n" ? after + 1 : after;
    const headSlice = source.slice(0, trimmedAfter);
    const bodyStartLine = headSlice.split("\n").length;

    return {
        body: source.slice(trimmedAfter),
        data: parseSimpleYaml(fmRaw),
        bodyStartLine,
    };
}

function parseSimpleYaml(text) {
    const out = {};
    text.split("\n").forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return;
        const colon = trimmed.indexOf(":");
        if (colon < 0) return;
        const key = trimmed.slice(0, colon).trim();
        const raw = trimmed.slice(colon + 1).trim();
        out[key] = parseScalar(raw);
    });
    return out;
}

function parseScalar(raw) {
    if (raw === "" || raw === "~" || raw === "null") return null;
    if (raw === "true") return true;
    if (raw === "false") return false;
    if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
    if (raw.startsWith("[") && raw.endsWith("]")) {
        const inner = raw.slice(1, -1).trim();
        if (!inner) return [];
        return inner.split(",").map((s) => parseScalar(s.trim()));
    }
    if ((raw.startsWith('"') && raw.endsWith('"'))
        || (raw.startsWith("'") && raw.endsWith("'"))) {
        return raw.slice(1, -1);
    }
    return raw;
}
