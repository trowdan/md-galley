// Tool-owned directory inside the user's workspace. Anything Bookwright
// writes to disk that is NOT a user-facing review file lives under
// <workspace>/.bookwright/. The reset action treats this folder as ours
// to delete.

export const TOOL_DIR = ".bookwright";
export const NOTES_SUBDIR = "notes";
const STATE_FILE = "state.json";

/** Idempotent: writes <workspace>/.bookwright/state.json on first open of
 *  this workspace. Future versions may put more diagnostic info here. */
export async function writeToolState(rootHandle) {
    if (!rootHandle) return;
    try {
        const dir = await rootHandle.getDirectoryHandle(TOOL_DIR, { create: true });
        let exists = false;
        try {
            await dir.getFileHandle(STATE_FILE);
            exists = true;
        } catch {}
        if (exists) return;
        const fileHandle = await dir.getFileHandle(STATE_FILE, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify({
            generator: "bookwright",
            version: "2",
            first_opened_at: new Date().toISOString(),
        }, null, 2));
        await writable.close();
    } catch (err) {
        console.warn("toolDir: could not write state", err);
    }
}

/** Delete the entire .bookwright/ folder, if it exists. */
export async function removeToolDir(rootHandle) {
    if (!rootHandle) return;
    try {
        await rootHandle.removeEntry(TOOL_DIR, { recursive: true });
    } catch {
        // missing or already gone, fine.
    }
}
