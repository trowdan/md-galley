// Taste log. Append-only chronological record of every annotation lifecycle
// event in the workspace. Lives at <workspace>/.bookwright/taste.md.
//
// Purpose: future agents (a drafter that proposes notes, a manuscript-memory
// agent that learns the reviewer's recurring concerns) read this file as
// ground truth. The reviewer's taste is a first-class artefact, not a vibe
// inside a vendor's model.
//
// Format (sibling contract `bookwright-taste/1.0`):
//
//   ---
//   schema: bookwright-taste/1.0
//   generator: bookwright
//   ---
//
//   # Taste log
//
//   <intro paragraphs>
//
//   - 2026-05-10T14:22:08.451Z  CREATE   a-9k1f3p2x  prose  L42-47  in "Recognising the obligations"
//   - 2026-05-10T14:25:03.122Z  RESOLVE  a-9k1f3p2x  manual
//   - 2026-05-10T14:30:00.000Z  RESOLVE  a-7r4s8m1d  applied
//   - 2026-05-10T14:35:11.901Z  EXPORT   reviews/2026-05-10-review.md  3 notes
//   - 2026-05-10T14:40:18.273Z  DELETE   a-2n5t9q6w  rejected
//
// Pattern: bus observer. Subscribes to ANNOTATION_CREATED / ANNOTATION_UPDATED
// (only when status changes), ANNOTATION_DELETED, and REVIEW_EXPORTED. Writes
// are serialised with a promise queue so concurrent events cannot interleave.

import { TOOL_DIR } from "./toolDir.js";
import { Events } from "./eventBus.js";

const TASTE_FILE = "taste.md";
const TASTE_SCHEMA_VERSION = "bookwright-taste/1.0";

const HEADER = `---
schema: ${TASTE_SCHEMA_VERSION}
generator: bookwright
---

# Taste log

Chronological record of every annotation lifecycle event in this workspace. Each line is one event, encoded as:

\`- <ISO timestamp>  <VERB>  <annotation id>  <verb-specific payload>\`

Verbs: \`CREATE\` (new note), \`RESOLVE\` (note closed; payload is \`manual\` or \`applied\`), \`REOPEN\` (resolved note re-opened), \`DELETE\` (note removed), \`EXPORT\` (review file written; payload is the relative path and note count).

This file is append-only. Bookwright never rewrites or compacts it. Downstream agents reading the log SHOULD treat it as the reviewer's taste artefact: which kinds of issues they flag, which they accept versus reject, which sections accumulate notes, how often they revert. Older entries remain authoritative even if the underlying notes have since been resolved or deleted.

`;

export class TasteLogger {
    constructor({ workspace, bus, annotationStore }) {
        this.workspace = workspace;
        this.bus = bus;
        this.annotationStore = annotationStore;
        this.tail = Promise.resolve();
        // Track per-id last known status so UPDATE events that flip status
        // can be classified as RESOLVE / REOPEN without payload diffing.
        this.lastStatus = new Map();
    }

    mount() {
        this.bus.on(Events.ANNOTATION_CREATED, (a) => this.#onCreated(a));
        this.bus.on(Events.ANNOTATION_UPDATED, (a) => this.#onUpdated(a));
        this.bus.on(Events.ANNOTATION_DELETED, (e) => this.#onDeleted(e));
        this.bus.on(Events.REVIEW_EXPORTED, (e) => this.#onExported(e));
        this.bus.on(Events.PASS_CHANGED, (s) => this.#onPassChanged(s));
        this.lastPassId = null;
    }

    async hydrate() {
        // Seed the last-known-status cache from the current store so the
        // first UPDATE we see can be classified correctly.
        if (!this.annotationStore) return;
        try {
            const all = await this.annotationStore.listAll();
            for (const list of all.values()) {
                for (const ann of list) this.lastStatus.set(ann.id, ann.status);
            }
        } catch (err) {
            console.warn("tasteLog: could not hydrate status cache", err);
        }
    }

    #onCreated(ann) {
        this.lastStatus.set(ann.id, ann.status);
        const anchor = describeAnchor(ann);
        const heading = ann.heading ? ` in "${sanitiseInline(ann.heading)}"` : "";
        this.#append(`CREATE   ${ann.id}  ${ann.category}  ${anchor}${heading}`);
    }

    #onUpdated(ann) {
        const prev = this.lastStatus.get(ann.id);
        this.lastStatus.set(ann.id, ann.status);
        if (prev === ann.status) return; // body/category-only edits are not taste signals
        if (ann.status === "resolved") {
            const source = ann.acceptedSource === "applied" ? "applied" : "manual";
            this.#append(`RESOLVE  ${ann.id}  ${source}`);
        } else if (ann.status === "open") {
            this.#append(`REOPEN   ${ann.id}`);
        }
    }

    #onDeleted({ id }) {
        if (!id) return;
        const prevStatus = this.lastStatus.get(id);
        const reason = prevStatus === "resolved" ? "after-resolve" : "rejected";
        this.lastStatus.delete(id);
        this.#append(`DELETE   ${id}  ${reason}`);
    }

    #onExported({ filename, count }) {
        if (!filename) return;
        this.#append(`EXPORT   ${filename}  ${count} note(s)`);
    }

    #onPassChanged({ active }) {
        const id = active?.id ?? null;
        if (id === this.lastPassId) return; // hydrate emits the current state; do not double-log
        const prevId = this.lastPassId;
        this.lastPassId = id;
        if (id && !prevId) {
            this.#append(`PASS_START   ${id}  "${sanitiseInline(active.name)}"`);
        } else if (id && prevId) {
            this.#append(`PASS_SWITCH  ${id}  "${sanitiseInline(active.name)}"`);
        } else if (!id && prevId) {
            this.#append(`PASS_END     ${prevId}`);
        }
    }

    /** Serialise appends so two rapid events cannot interleave file writes. */
    #append(payload) {
        const line = `- ${new Date().toISOString()}  ${payload}\n`;
        this.tail = this.tail
            .catch(() => {})
            .then(() => this.#writeLine(line));
    }

    async #writeLine(line) {
        if (!this.workspace.handle) return;
        try {
            const dir = await this.workspace.handle.getDirectoryHandle(TOOL_DIR, { create: true });
            const fileHandle = await dir.getFileHandle(TASTE_FILE, { create: true });
            const existing = await readFileText(fileHandle);
            const next = existing.length === 0 ? HEADER + line : existing + line;
            const writable = await fileHandle.createWritable();
            await writable.write(next);
            await writable.close();
        } catch (err) {
            console.warn("tasteLog: append failed", err);
        }
    }
}

async function readFileText(fileHandle) {
    try {
        const f = await fileHandle.getFile();
        return await f.text();
    } catch {
        return "";
    }
}

function describeAnchor(ann) {
    if (ann.scope === "chapter") return "whole-chapter";
    if (ann.scope === "section") return ann.sectionAnchor ? `section "${sanitiseInline(ann.sectionAnchor)}"` : "section";
    if (ann.lineStart && ann.lineEnd) {
        return ann.lineStart === ann.lineEnd ? `L${ann.lineStart}` : `L${ann.lineStart}-${ann.lineEnd}`;
    }
    return "(no-anchor)";
}

function sanitiseInline(s) {
    // The log is plain markdown bullets with no fences; collapse newlines and
    // strip backticks to avoid breaking out of quoted strings.
    return String(s ?? "").replace(/[\r\n]+/g, " ").replace(/`/g, "'").trim();
}
