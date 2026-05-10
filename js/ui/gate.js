// Gate. Renders three full-viewport, typeset surfaces:
//   1. browser-not-supported (terminal),
//   2. open-workspace (initial OR after reset OR after permission lapse),
//   3. confirm modal for destructive actions.
// All three share the same paper-coloured frontispiece treatment; no card,
// no shadow, no dialog chrome.

import { Component } from "../lib/component.js";
import { Events } from "../lib/eventBus.js";

const SUPPORTED = ["Chrome", "Edge", "Brave", "Arc", "Opera"];

export class Gate extends Component {
    showUnsupported() {
        this.root.hidden = false;
        this.root.innerHTML = `
            <div class="gate__inner">
                <p class="gate__kicker">bookwright</p>
                <h1 class="gate__title">This browser cannot edit your manuscript.</h1>
                <p class="gate__body">
                    Bookwright reads and writes files on your disk through the
                    File System Access API. That capability ships in Chromium browsers;
                    your current browser does not expose it. Your manuscript never
                    leaves your machine, but the tool needs the API to read it.
                </p>
                <p class="gate__supported">
                    ${SUPPORTED.map((b) => `<span>${b}</span>`).join("")}
                </p>
            </div>
        `;
    }

    /**
     * @param {object} opts
     * @param {string|null} [opts.knownPath]  If set, render the "reconnect" message.
     * @param {boolean}     [opts.afterReset] If true, render the "reset complete" message.
     */
    showOpenWorkspace({ knownPath = null, afterReset = false } = {}) {
        let kicker = "bookwright";
        let title, body;

        if (afterReset) {
            kicker = "reset complete";
            title = "Pick a workspace to start fresh.";
            body = `
                Bookwright cleared every note, the saved theme and filter,
                and the <code>.bookwright</code> folder in your last workspace.
                Reviews you had already exported are still on disk.
            `;
        } else if (knownPath) {
            title = `Reconnect to <em>${escape(knownPath)}</em>.`;
            body = `
                You opened this workspace before. Grant access again to keep
                your notes anchored to the same files.
            `;
        } else {
            title = "Reviewing a draft shouldn&rsquo;t break your reading.";
            body = `
                Read a chapter end to end. Leave <em>anchored</em> notes in the margin.
                <em>Export</em> one Markdown review. Files stay <em>local</em>.
            `;
        }

        this.root.hidden = false;
        this.root.innerHTML = `
            <div class="gate__inner">
                <p class="gate__kicker">${kicker}</p>
                <h1 class="gate__title">${title}</h1>
                <p class="gate__body">${body}</p>
                <div class="gate__cta-row">
                    <button class="gate__cta" id="gate-open" type="button">
                        <span class="gate__cta-label">open workspace</span>
                        <span class="gate__cta-arrow" aria-hidden="true">→</span>
                    </button>
                </div>
            </div>
        `;
        const btn = this.root.querySelector("#gate-open");
        // Click handler delegates to deps.openWorkspace so the canonical
        // picker logic lives in exactly one place. No bus.emit before the
        // call: the user-activation gesture must reach showDirectoryPicker
        // without indirection.
        btn?.addEventListener("click", () => this.deps.openWorkspace());
        // Move keyboard focus to the primary action so Enter triggers it.
        queueMicrotask(() => btn?.focus({ preventScroll: true }));
    }

    /**
     * Custom in-app confirmation. Replaces native confirm(): typeset like
     * the rest of the gate, requires explicit click on the danger button,
     * Escape cancels. Returns a promise that resolves to a boolean.
     *
     * @returns {Promise<boolean>}
     */
    showConfirm({ kicker = "confirm", title, body, dangerLabel = "yes", cancelLabel = "cancel" }) {
        return new Promise((resolve) => {
            this.root.hidden = false;
            this.root.innerHTML = `
                <div class="gate__inner">
                    <p class="gate__kicker gate__kicker--danger">${escape(kicker)}</p>
                    <h1 class="gate__title">${escape(title)}</h1>
                    <p class="gate__body">${body}</p>
                    <div class="gate__cta-row">
                        <button class="gate__cta gate__cta--danger" id="gate-yes" type="button">
                            <span class="gate__cta-label">${escape(dangerLabel)}</span>
                            <span class="gate__cta-arrow" aria-hidden="true">↻</span>
                        </button>
                        <button class="gate__cta gate__cta--ghost" id="gate-no" type="button">
                            ${escape(cancelLabel)}
                        </button>
                    </div>
                </div>
            `;
            const yes = this.root.querySelector("#gate-yes");
            const no = this.root.querySelector("#gate-no");
            const onYes = () => settle(true);
            const onNo = () => settle(false);
            const onKey = (e) => {
                if (e.key === "Escape") { e.preventDefault(); settle(false); }
            };
            const settle = (value) => {
                yes?.removeEventListener("click", onYes);
                no?.removeEventListener("click", onNo);
                document.removeEventListener("keydown", onKey, true);
                this.hide();
                resolve(value);
            };
            yes?.addEventListener("click", onYes);
            no?.addEventListener("click", onNo);
            document.addEventListener("keydown", onKey, true);
            queueMicrotask(() => no?.focus({ preventScroll: true }));
        });
    }

    hide() {
        this.root.hidden = true;
        this.root.innerHTML = "";
    }
}

function escape(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
}
