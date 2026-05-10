// Annotation domain model. Pure data + factory. No DOM, no I/O.
// v2 model adds scope (anchored | section | chapter), status (open | resolved),
// priority (low | normal | high), updatedAt.

export const Categories = Object.freeze({
    PROSE: "prose",
    ACCURACY: "accuracy",
    CITATION: "citation",
    STRUCTURE: "structure",
    LENGTH: "length",
    VOICE: "voice",
    KEEP: "keep",
});

export const CategoryLabels = Object.freeze({
    prose: "prose",
    accuracy: "accuracy",
    citation: "citation",
    structure: "structure",
    length: "length",
    voice: "voice",
    keep: "keep",
});

export const CATEGORY_ORDER = [
    Categories.PROSE,
    Categories.ACCURACY,
    Categories.CITATION,
    Categories.STRUCTURE,
    Categories.LENGTH,
    Categories.VOICE,
    Categories.KEEP,
];

export const Scopes = Object.freeze({
    ANCHORED: "anchored",
    SECTION: "section",
    CHAPTER: "chapter",
});

export const Statuses = Object.freeze({
    OPEN: "open",
    RESOLVED: "resolved",
});

export const Priorities = Object.freeze({
    LOW: "low",
    NORMAL: "normal",
    HIGH: "high",
});

export class Annotation {
    constructor(props) {
        Object.assign(this, props);
    }

    static create({
        filePath,
        chapterTitle = null,
        scope,
        heading = null,
        sectionAnchor = null,
        lineStart = null,
        lineEnd = null,
        quote = "",
        category,
        body,
        priority = Priorities.NORMAL,
    }) {
        const now = new Date().toISOString();
        return new Annotation({
            id: cryptoRandomId(),
            filePath,
            chapterTitle,
            scope,
            heading,
            sectionAnchor,
            lineStart,
            lineEnd,
            quote,
            category,
            body,
            priority,
            status: Statuses.OPEN,
            createdAt: now,
            updatedAt: now,
        });
    }

    update(patch) {
        return new Annotation({
            ...this,
            ...patch,
            updatedAt: new Date().toISOString(),
        });
    }

    resolve() { return this.update({ status: Statuses.RESOLVED }); }
    reopen()  { return this.update({ status: Statuses.OPEN }); }

    toJSON() {
        return { ...this };
    }
}

function cryptoRandomId() {
    const c = globalThis.crypto;
    if (c?.randomUUID) return c.randomUUID();
    return "a-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
