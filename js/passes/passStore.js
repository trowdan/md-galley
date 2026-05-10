// Pass repository. In-memory state plus a single-file disk mirror at
// `<workspace>/.mdgalley/passes.json`. Small data, simple lifecycle:
// list, active pointer, activate / deactivate / create / rename / forget.
// Pattern: repository over a JSON file, with bus emission on change.

import { Pass } from "./pass.js";
import { TOOL_DIR } from "../lib/toolDir.js";
import { Events } from "../lib/eventBus.js";

const PASSES_FILE = "passes.json";
const PASSES_SCHEMA_VERSION = "mdgalley-passes/1.0";

export class PassStore {
    constructor({ workspace, bus }) {
        this.workspace = workspace;
        this.bus = bus;
        this.passes = new Map(); // id -> Pass
        this.activeId = null;
    }

    /** Load passes from disk. Tolerates missing file (fresh workspace). */
    async hydrate() {
        if (!this.workspace.handle) return;
        try {
            const dir = await this.workspace.handle.getDirectoryHandle(TOOL_DIR);
            const fileHandle = await dir.getFileHandle(PASSES_FILE);
            const file = await fileHandle.getFile();
            const json = JSON.parse(await file.text());
            const list = Array.isArray(json?.passes) ? json.passes : [];
            this.passes = new Map(list.map((p) => [p.id, new Pass(p)]));
            this.activeId = json?.active && this.passes.has(json.active) ? json.active : null;
        } catch {
            // Missing or malformed: start clean, do not throw.
            this.passes = new Map();
            this.activeId = null;
        }
        this.bus.emit(Events.PASS_CHANGED, this.snapshot());
    }

    snapshot() {
        return {
            active: this.getActive(),
            list: [...this.passes.values()].sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt)),
        };
    }

    getActive() {
        return this.activeId ? this.passes.get(this.activeId) ?? null : null;
    }

    list() {
        return [...this.passes.values()];
    }

    /** Start a new pass with the given name and activate it. Returns the
     *  created Pass. Throws on empty name. */
    async start(name) {
        const pass = Pass.create({ name });
        this.passes.set(pass.id, pass);
        this.activeId = pass.id;
        await this.#persist();
        this.bus.emit(Events.PASS_CHANGED, this.snapshot());
        return pass;
    }

    /** Activate an existing pass by id. No-op if id is unknown. */
    async activate(id) {
        if (!this.passes.has(id)) return null;
        const next = this.passes.get(id).touch();
        this.passes.set(id, next);
        this.activeId = id;
        await this.#persist();
        this.bus.emit(Events.PASS_CHANGED, this.snapshot());
        return next;
    }

    /** End the active pass: clear the active pointer, keep the pass in the
     *  list (so it can be resumed later). */
    async end() {
        if (!this.activeId) return;
        this.activeId = null;
        await this.#persist();
        this.bus.emit(Events.PASS_CHANGED, this.snapshot());
    }

    /** Permanently forget a pass. Does NOT scrub passId from existing notes;
     *  notes that referenced this pass simply lose their group. */
    async forget(id) {
        this.passes.delete(id);
        if (this.activeId === id) this.activeId = null;
        await this.#persist();
        this.bus.emit(Events.PASS_CHANGED, this.snapshot());
    }

    async #persist() {
        if (!this.workspace.handle) return;
        try {
            const dir = await this.workspace.handle.getDirectoryHandle(TOOL_DIR, { create: true });
            const fileHandle = await dir.getFileHandle(PASSES_FILE, { create: true });
            const writable = await fileHandle.createWritable();
            const payload = {
                schema: PASSES_SCHEMA_VERSION,
                generator: "mdgalley",
                active: this.activeId,
                passes: [...this.passes.values()].map((p) => p.toJSON()),
            };
            await writable.write(JSON.stringify(payload, null, 2));
            await writable.close();
        } catch (err) {
            console.warn("passStore: persist failed", err);
        }
    }
}
