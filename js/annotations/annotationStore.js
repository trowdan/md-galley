// Annotation repository over IndexedDB. Keyed by file path; value is
// an array of Annotation JSON. Survives tab close.
// Pattern: repository over key-value store, with bus emission on every mutation.

import { idb } from "../lib/idb.js";
import { Annotation, Statuses } from "./annotation.js";
import { bus, Events } from "../lib/eventBus.js";

const STORE = "annotations";

export class AnnotationStore {
    /** @returns {Promise<Annotation[]>} */
    async listFor(filePath) {
        const raw = (await idb.get(STORE, filePath)) ?? [];
        return raw.map((r) => new Annotation(r));
    }

    /** @returns {Promise<Map<string, Annotation[]>>} */
    async listAll() {
        const keys = await idb.keys(STORE);
        const out = new Map();
        for (const key of keys) {
            const raw = (await idb.get(STORE, key)) ?? [];
            out.set(key, raw.map((r) => new Annotation(r)));
        }
        return out;
    }

    async add(annotation) {
        const list = await this.listFor(annotation.filePath);
        list.push(annotation);
        await this.#save(annotation.filePath, list);
        bus.emit(Events.ANNOTATION_CREATED, annotation);
        return annotation;
    }

    async update(annotation) {
        const list = await this.listFor(annotation.filePath);
        const idx = list.findIndex((a) => a.id === annotation.id);
        if (idx < 0) return null;
        list[idx] = annotation;
        await this.#save(annotation.filePath, list);
        bus.emit(Events.ANNOTATION_UPDATED, annotation);
        return annotation;
    }

    async patch(filePath, id, patch) {
        const list = await this.listFor(filePath);
        const idx = list.findIndex((a) => a.id === id);
        if (idx < 0) return null;
        const next = list[idx].update(patch);
        list[idx] = next;
        await this.#save(filePath, list);
        bus.emit(Events.ANNOTATION_UPDATED, next);
        return next;
    }

    async toggleStatus(filePath, id) {
        const list = await this.listFor(filePath);
        const found = list.find((a) => a.id === id);
        if (!found) return null;
        const next = found.status === Statuses.RESOLVED ? found.reopen() : found.resolve();
        return this.update(next);
    }

    async remove(filePath, id) {
        const list = await this.listFor(filePath);
        const next = list.filter((a) => a.id !== id);
        if (next.length === list.length) return false;
        await this.#save(filePath, next);
        bus.emit(Events.ANNOTATION_DELETED, { filePath, id });
        return true;
    }

    /** Replace the IDB cache wholesale. Used by the disk-persistence layer
     *  to seed the cache from <workspace>/.bookwright/notes/ on workspace
     *  open. Bypasses event emission: the UI will redraw via FILE_LOADED. */
    async bulkReplace(byFile) {
        await idb.clear(STORE);
        for (const [filePath, list] of byFile) {
            if (!list || list.length === 0) continue;
            const arr = list.map((a) => (a instanceof Annotation ? a.toJSON() : a));
            await idb.set(STORE, filePath, arr);
        }
    }

    /** Total open + resolved counts across all files. */
    async tallies() {
        const all = await this.listAll();
        const perFile = new Map();
        let open = 0, resolved = 0;
        for (const [path, arr] of all) {
            const o = arr.filter((a) => a.status === Statuses.OPEN).length;
            const r = arr.length - o;
            perFile.set(path, { open: o, resolved: r, total: arr.length });
            open += o;
            resolved += r;
        }
        return { perFile, open, resolved, total: open + resolved };
    }

    async #save(filePath, list) {
        if (list.length === 0) {
            await idb.delete(STORE, filePath);
        } else {
            await idb.set(STORE, filePath, list.map((a) => a.toJSON()));
        }
    }
}

export const annotationStore = new AnnotationStore();
