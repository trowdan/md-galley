// Hard reset. Wipes every byte Bookwright owns in the user's environment:
// IndexedDB stores, our localStorage keys, the .bookwright/ folder.
// Reviews the user has exported are user artefacts and stay untouched.
//
// Confirmation goes through Gate.showConfirm (a typeset in-app modal) so
// the destructive intent has to be explicitly clicked, never dismissed by
// accident. A sessionStorage flag survives the reload so the post-reset
// gate can tell the user the operation completed.

import { idb } from "./idb.js";
import { removeToolDir } from "./toolDir.js";

const LS_KEYS = [
    "bookwright:theme",
    "bookwright:filter",
    "bookwright:rail",
];

const IDB_STORES = ["annotations", "workspace"];

const RESET_FLAG_KEY = "bookwright:just-reset";

export async function performReset({ workspace, bus, Events, gate }) {
    const ok = await gate.showConfirm({
        kicker: "danger",
        title: "Reset Bookwright?",
        body: `
            This deletes every note in your browser, the saved theme, the saved
            filter, and the <code>.bookwright</code> folder in your workspace.
            Reviews you exported (under <code>reviews/</code>) are kept.<br><br>
            <strong>This cannot be undone.</strong>
        `,
        dangerLabel: "yes, reset",
        cancelLabel: "cancel",
    });
    if (!ok) return false;

    if (workspace.handle) {
        try { await removeToolDir(workspace.handle); } catch (e) { console.warn("reset: tool dir", e); }
    }
    workspace.handle = null;

    for (const store of IDB_STORES) {
        try { await idb.clear(store); } catch (e) { console.warn("reset: idb", store, e); }
    }

    for (const key of LS_KEYS) {
        try { localStorage.removeItem(key); } catch {}
    }

    // Survives the reload (sessionStorage is per-tab, untouched by reset).
    try { sessionStorage.setItem(RESET_FLAG_KEY, "1"); } catch {}

    bus.emit(Events.TOAST, { message: "reset complete. reloading." });
    setTimeout(() => location.reload(), 600);
    return true;
}

export function consumeResetFlag() {
    try {
        const flag = sessionStorage.getItem(RESET_FLAG_KEY) === "1";
        if (flag) sessionStorage.removeItem(RESET_FLAG_KEY);
        return flag;
    } catch {
        return false;
    }
}
