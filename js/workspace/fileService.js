// File service. Reads and writes Markdown files inside a workspace handle.
// Pattern: repository over FileSystemDirectoryHandle. UI never touches handles directly.

const MD_EXTENSIONS = [".md", ".markdown"];

// Directories the file walker skips. `reviews/` holds MDGalley's exported
// review files, which are outputs not source documents; dot-prefixed dirs
// (including .mdgalley/) hold tool state.
const EXCLUDED_DIRS = new Set(["reviews"]);

function isMarkdown(name) {
    const lower = name.toLowerCase();
    return MD_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export class FileService {
    /**
     * Recursively list every Markdown file inside the workspace.
     * @param {FileSystemDirectoryHandle} root
     * @returns {Promise<Array<{path: string, name: string, group: string, handle: FileSystemFileHandle}>>}
     */
    async list(root) {
        const out = [];
        await this.#walk(root, "", out);
        out.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
        return out;
    }

    async #walk(dir, prefix, out) {
        for await (const [name, entry] of dir.entries()) {
            if (name.startsWith(".")) continue;
            if (entry.kind === "directory" && EXCLUDED_DIRS.has(name)) continue;
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
