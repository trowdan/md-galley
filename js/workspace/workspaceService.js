// Workspace service. Owns the FileSystemDirectoryHandle lifecycle:
//  - prompt-and-pick on first run,
//  - persist via IndexedDB,
//  - re-acquire permission on subsequent loads.
// Pattern: facade + singleton. Everything filesystem-related funnels through here.

import { idb } from "../lib/idb.js";

const STORE = "workspace";
const KEY_HANDLE = "directoryHandle";

export class WorkspaceService {
    constructor() {
        this.handle = null;
    }

    static isSupported() {
        return typeof window !== "undefined"
            && typeof window.showDirectoryPicker === "function";
    }

    /** Prompt the user to pick a workspace folder. Stores the handle. */
    async pick() {
        const handle = await window.showDirectoryPicker({ id: "mdgalley-workspace", mode: "readwrite" });
        await this.acceptHandle(handle);
        return handle;
    }

    /** Persist a handle the caller already obtained from showDirectoryPicker.
     *  Used when the picker has to be invoked synchronously inside a click
     *  handler to avoid losing the user-activation gesture. */
    async acceptHandle(handle) {
        await idb.set(STORE, KEY_HANDLE, handle);
        this.handle = handle;
    }

    /** Restore a previously picked workspace. Returns null if none stored
     *  or if the user denies the silent permission re-grant. */
    async restore({ requestIfNeeded = false } = {}) {
        const stored = await idb.get(STORE, KEY_HANDLE);
        if (!stored) return null;

        const granted = await this.#ensurePermission(stored, { request: requestIfNeeded });
        if (!granted) return null;

        this.handle = stored;
        return stored;
    }

    /** Forget the stored workspace. */
    async forget() {
        await idb.delete(STORE, KEY_HANDLE);
        this.handle = null;
    }

    async #ensurePermission(handle, { request }) {
        const opts = { mode: "readwrite" };
        const current = await handle.queryPermission(opts);
        if (current === "granted") return true;
        if (!request) return false;
        const next = await handle.requestPermission(opts);
        return next === "granted";
    }
}

export const workspace = new WorkspaceService();
