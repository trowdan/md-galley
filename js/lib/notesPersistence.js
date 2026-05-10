// Disk persistence for annotations.
//
// Disk is the source of truth. IndexedDB is a session-scoped cache:
// hydrated from disk on workspace open, mirrored on every mutation.
//
// Layout under the workspace root:
//   .bookwright/
//     state.json              tool metadata (created by toolDir)
//     notes/
//       <file path>.json      one JSON array per manuscript file
//       chapters/01-...md.json
//       chapters/02-...md.json
//
// The directory tree mirrors the manuscript tree, so files are easy to
// diff, grep, and commit to source control if the author wants to.
//
// Pattern: observer over the bus. On ANNOTATION_CREATED / UPDATED /
// DELETED, the persister reads the latest state for the affected file
// and writes the JSON. Writes are serialised per-file via a small queue
// so two rapid events cannot race the file system.

import { TOOL_DIR, NOTES_SUBDIR } from "./toolDir.js";
import { Events } from "./eventBus.js";
import { Annotation } from "../annotations/annotation.js";

export class NotesDiskPersister {
    constructor({ workspace, annotationStore, bus }) {
        this.workspace = workspace;
        this.annotationStore = annotationStore;
        this.bus = bus;
        this.writeQueue = new Map(); // filePath -> tail Promise
    }

    mount() {
        this.bus.on(Events.ANNOTATION_CREATED, (a) => this.#enqueue(a.filePath));
        this.bus.on(Events.ANNOTATION_UPDATED, (a) => this.#enqueue(a.filePath));
        this.bus.on(Events.ANNOTATION_DELETED, (e) => this.#enqueue(e.filePath));
    }

    /** Read every notes JSON under .bookwright/notes/ and seed the
     *  AnnotationStore. Called from the workspace-open orchestrator
     *  BEFORE any file is loaded, so the manuscript view never has to
     *  redraw to pick up disk-only notes. */
    async hydrate() {
        if (!this.workspace.handle) return;
        const map = new Map();

        let notesDir;
        try {
            const toolDir = await this.workspace.handle.getDirectoryHandle(TOOL_DIR);
            notesDir = await toolDir.getDirectoryHandle(NOTES_SUBDIR);
        } catch {
            // No notes directory yet (fresh workspace). IDB cache is wiped
            // anyway so the cache matches disk: empty.
            await this.annotationStore.bulkReplace(map);
            return;
        }

        await this.#walk(notesDir, "", map);
        await this.annotationStore.bulkReplace(map);
    }

    async #walk(dir, prefix, out) {
        for await (const [name, entry] of dir.entries()) {
            if (entry.kind === "directory") {
                const next = prefix ? `${prefix}/${name}` : name;
                await this.#walk(entry, next, out);
                continue;
            }
            if (entry.kind !== "file" || !name.endsWith(".json")) continue;
            try {
                const file = await entry.getFile();
                const json = JSON.parse(await file.text());
                if (!Array.isArray(json)) continue;
                const filePath = (prefix ? `${prefix}/` : "") + name.replace(/\.json$/, "");
                const annotations = json.map((j) => new Annotation(j));
                out.set(filePath, annotations);
            } catch (err) {
                console.warn("notesPersistence: skipping invalid file", name, err);
            }
        }
    }

    /** Serialise writes per file path so two near-simultaneous events
     *  cannot trigger overlapping createWritable calls on the same file. */
    #enqueue(filePath) {
        if (!filePath || !this.workspace.handle) return;
        const tail = this.writeQueue.get(filePath) ?? Promise.resolve();
        const next = tail
            .catch(() => {})            // never let an earlier failure block the queue
            .then(() => this.#persistFor(filePath));
        this.writeQueue.set(filePath, next);
    }

    async #persistFor(filePath) {
        const annotations = await this.annotationStore.listFor(filePath);
        if (!annotations || annotations.length === 0) {
            await this.#deleteNotesFile(filePath);
            return;
        }
        await this.#writeNotesFile(filePath, annotations);
    }

    async #writeNotesFile(filePath, annotations) {
        const segments = [TOOL_DIR, NOTES_SUBDIR, ...filePath.split("/").filter(Boolean)];
        const filename = segments.pop() + ".json";
        const dir = await this.#ensureDir(segments);
        const fileHandle = await dir.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        const payload = annotations.map((a) => (a.toJSON ? a.toJSON() : a));
        await writable.write(JSON.stringify(payload, null, 2));
        await writable.close();
    }

    async #deleteNotesFile(filePath) {
        const segments = [TOOL_DIR, NOTES_SUBDIR, ...filePath.split("/").filter(Boolean)];
        const filename = segments.pop() + ".json";
        let dir;
        try { dir = await this.#openDir(segments); }
        catch { return; } // path doesn't exist, nothing to delete
        try { await dir.removeEntry(filename); } catch {}
    }

    async #ensureDir(segments) {
        let dir = this.workspace.handle;
        for (const seg of segments) {
            dir = await dir.getDirectoryHandle(seg, { create: true });
        }
        return dir;
    }

    async #openDir(segments) {
        let dir = this.workspace.handle;
        for (const seg of segments) {
            dir = await dir.getDirectoryHandle(seg);
        }
        return dir;
    }
}
