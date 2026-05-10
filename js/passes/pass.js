// Named-pass domain. A "pass" is a declared scope of review activity:
// "the citations pass on chapter 3", "the voice pass for the whole book".
// Notes created while a pass is active carry its id so the gutter can later
// filter to "only this pass". Passes are resumable across workspace opens.
// Pure data + factory; no DOM, no I/O.

export class Pass {
    constructor(props) {
        Object.assign(this, props);
    }

    static create({ name }) {
        const trimmed = String(name ?? "").trim();
        if (!trimmed) throw new Error("Pass name cannot be empty");
        const now = new Date().toISOString();
        return new Pass({
            id: passId(trimmed, now),
            name: trimmed,
            createdAt: now,
            lastActiveAt: now,
        });
    }

    touch() {
        return new Pass({ ...this, lastActiveAt: new Date().toISOString() });
    }

    toJSON() { return { ...this }; }
}

function passId(name, isoTimestamp) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const stamp = isoTimestamp.slice(0, 10);
    return `p-${slug || "pass"}-${stamp}`;
}
