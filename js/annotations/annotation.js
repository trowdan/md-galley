// Annotation domain model. Pure data + factory. No DOM, no I/O.
// Adds scope (anchored | section | document), status (open | resolved),
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

// Pin: CategoryLabels and Categories must move in lockstep. A rename of a
// Categories key without the matching label edit would silently change the
// export label without a REVIEW_SCHEMA_VERSION bump. Verify at module load.
for (const value of Object.values(Categories)) {
    if (!(value in CategoryLabels)) {
        throw new Error(
            `CategoryLabels missing entry for "${value}". Update both maps in lockstep, ` +
            `and bump REVIEW_SCHEMA_VERSION if the visible label changes.`
        );
    }
}

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
    DOCUMENT: "document",
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
        documentTitle = null,
        scope,
        heading = null,
        sectionAnchor = null,
        lineStart = null,
        lineEnd = null,
        quote = "",
        category,
        body,
        because = "",
        block = null,
        passId = null,
        priority = Priorities.NORMAL,
    }) {
        const now = new Date().toISOString();
        return new Annotation({
            id: cryptoRandomId(),
            filePath,
            documentTitle,
            scope,
            heading,
            sectionAnchor,
            lineStart,
            lineEnd,
            quote,
            category,
            body,
            because,
            block,
            passId,
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

    /** Mark resolved. `source` is the acceptance trace: who/what closed
     *  this note. `'manual'` = a human click in the gutter; `'applied'` = a
     *  drafter agent's `reviews/*-applied.md` import. */
    resolve(source = "manual") {
        return this.update({
            status: Statuses.RESOLVED,
            resolvedAt: new Date().toISOString(),
            acceptedSource: source,
        });
    }
    reopen() {
        return this.update({
            status: Statuses.OPEN,
            resolvedAt: null,
            acceptedSource: null,
        });
    }

    toJSON() {
        return { ...this };
    }
}

function cryptoRandomId() {
    const c = globalThis.crypto;
    if (c?.randomUUID) return c.randomUUID();
    return "a-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
