// Drafter roundtrip. When a downstream agent applies review notes to the
// source, it writes `reviews/YYYY-MM-DD-applied.md` listing the IDs of the
// notes it acted on. On the next workspace open, MDGalley reads every
// `*-applied.md` file under `reviews/` and flips matching annotations from
// `open` to `resolved` so the reviewer sees the addressed notes settled
// without manual click-through.
//
// File format (mdgalley-applied/1.0):
//   ---
//   applied_date: YYYY-MM-DD
//   schema: mdgalley-applied/1.0
//   generator: <agent name>
//   applied_count: N
//   ---
//
//   # Applied notes (YYYY-MM-DD)
//
//   - <annotation-id>     # optional free-text comment after the id
//   - <annotation-id>
//
// MDGalley only needs the IDs from the body. Every line whose first
// non-whitespace token after an optional `-` is a 6+ char id-shaped string
// counts. Front matter is parsed loosely; only `schema` and `generator` are
// inspected, both informationally.

const APPLIED_FILE_RE = /^\d{4}-\d{2}-\d{2}-applied\.md$/;
const ID_LINE_RE = /^[\s-]*([A-Za-z0-9][A-Za-z0-9_-]{5,})/gm;

export const APPLIED_SCHEMA_VERSION = "mdgalley-applied/1.0";

/** Read every `reviews/*-applied.md` in the workspace and return the set
 *  of annotation IDs they reference. Missing `reviews/` directory or
 *  malformed files are tolerated silently. */
export async function readAppliedIds(workspaceHandle) {
    const ids = new Set();
    if (!workspaceHandle) return ids;
    let reviewsDir;
    try {
        reviewsDir = await workspaceHandle.getDirectoryHandle("reviews");
    } catch {
        return ids;
    }
    try {
        for await (const [name, handle] of reviewsDir.entries()) {
            if (handle.kind !== "file" || !APPLIED_FILE_RE.test(name)) continue;
            try {
                const file = await handle.getFile();
                const text = await file.text();
                for (const id of parseAppliedIds(text)) ids.add(id);
            } catch (err) {
                console.warn("appliedRoundtrip: skipping malformed file", name, err);
            }
        }
    } catch (err) {
        console.warn("appliedRoundtrip: reviews/ enumeration failed", err);
    }
    return ids;
}

function parseAppliedIds(text) {
    const out = [];
    // Strip front matter if present; the IDs live in the body. The regex
    // tolerates files with no front matter and files that omit the trailing
    // newline.
    const fmMatch = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
    const body = fmMatch ? fmMatch[1] : text;
    let m;
    while ((m = ID_LINE_RE.exec(body))) {
        // Skip heading text and the literal word "Applied" that may appear
        // first on a line; require at least one digit somewhere in the token
        // to look id-shaped.
        const token = m[1];
        if (/[0-9]/.test(token)) out.push(token);
    }
    return out;
}

/** For every id in `ids` that names an `open` annotation in the store, flip
 *  it to `resolved` with `acceptedSource: 'applied'` so the gutter trace
 *  records that the close came from a drafter agent. Returns the number of
 *  flips performed.
 *  @param {{ listAll: Function, acceptApplied: Function }} annotationStore
 *  @param {Set<string>} ids
 */
export async function flipAccepted(annotationStore, ids) {
    if (!ids || ids.size === 0) return 0;
    const all = await annotationStore.listAll();
    let flipped = 0;
    for (const [filePath, list] of all) {
        for (const ann of list) {
            if (ids.has(ann.id) && ann.status === "open") {
                await annotationStore.acceptApplied(filePath, ann.id);
                flipped++;
            }
        }
    }
    return flipped;
}
