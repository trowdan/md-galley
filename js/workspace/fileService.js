// File service. Reads and writes Markdown files inside a workspace handle.
// Pattern: repository over FileSystemDirectoryHandle. UI never touches handles directly.

const MD_EXTENSIONS = [".md", ".markdown"];

// Directory walk skips dot-prefixed entries only (`.mdgalley/`, `.git/`, …).
// MDGalley's own outputs (review exports, applied-roundtrip replies) used to
// be hidden by excluding `reviews/`, but a workspace can legitimately have a
// `reviews/` folder of human-authored docs. Tool outputs are now identified
// per file by a `schema: mdgalley-…` line in the front matter; every other
// non-hidden subfolder is walked.
const TOOL_SCHEMA_PREFIX = "mdgalley-";
// Front matter sits at the top of the file; 4 KiB is enough to fit any
// realistic header without paying for the whole file.
const FRONTMATTER_PEEK_BYTES = 4096;

function isMarkdown(name) {
    const lower = name.toLowerCase();
    return MD_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

async function isToolOutput(handle) {
    try {
        const file = await handle.getFile();
        const head = await file.slice(0, FRONTMATTER_PEEK_BYTES).text();
        if (!head.startsWith("---\n") && !head.startsWith("---\r\n")) return false;
        const close = head.indexOf("\n---", 3);
        const fm = close < 0 ? head.slice(3) : head.slice(3, close);
        for (const line of fm.split(/\r?\n/)) {
            const t = line.trim();
            if (!t.startsWith("schema:")) continue;
            const value = t.slice("schema:".length).trim().replace(/^['"]|['"]$/g, "");
            return value.startsWith(TOOL_SCHEMA_PREFIX);
        }
        return false;
    } catch {
        return false;
    }
}

export class FileService {
    /**
     * Recursively list every Markdown file inside the workspace, skipping
     * dot-prefixed entries and MDGalley's own tool outputs (identified by
     * `schema: mdgalley-…` front matter).
     * @param {FileSystemDirectoryHandle} root
     * @returns {Promise<Array<{path: string, name: string, group: string, handle: FileSystemFileHandle}>>}
     */
    async list(root) {
        const candidates = [];
        await this.#walk(root, "", candidates);
        const flags = await Promise.all(candidates.map((c) => isToolOutput(c.handle)));
        const out = candidates.filter((_, i) => !flags[i]);
        out.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
        return out;
    }

    async #walk(dir, prefix, out) {
        for await (const [name, entry] of dir.entries()) {
            if (name.startsWith(".")) continue;
            const path = prefix ? `${prefix}/${name}` : name;
            if (entry.kind === "directory") {
                await this.#walk(entry, path, out);
            } else if (entry.kind === "file" && isMarkdown(name)) {
                out.push({
                    path,
                    name,
                    group: prefix || ".",
                    handle: entry,
                });
            }
        }
    }

    /** Read a markdown file's text content. */
    async read(fileHandle) {
        const file = await fileHandle.getFile();
        return file.text();
    }

    /**
     * Write text to <root>/<relativePath>. Creates intermediate directories as needed.
     * @returns {Promise<string>} the absolute-style path that was written
     */
    async write(root, relativePath, content) {
        const parts = relativePath.split("/").filter(Boolean);
        const filename = parts.pop();
        let dir = root;
        for (const part of parts) {
            dir = await dir.getDirectoryHandle(part, { create: true });
        }
        const fileHandle = await dir.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        return relativePath;
    }
}

export const files = new FileService();
