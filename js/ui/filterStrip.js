// Filter strip. Sticky bar below the chrome, right-aligned to the gutter
// column, holding the open / resolved / all toggle and the active-pass
// chip. Owns persistence of the status filter to localStorage and emits
// FILTER_CHANGED on every flip. Pass control is delegated to PassStore.

import { Component } from "../lib/component.js";
import { Events } from "../lib/eventBus.js";

const FILTER_KEY = "mdgalley:filter";
const VALID = new Set(["open", "resolved", "all"]);

export class FilterStrip extends Component {
    constructor(rootEl, deps) {
        super(rootEl, deps);
        this.buttons = [...rootEl.querySelectorAll("button[data-filter]")];
        this.passEl = rootEl.querySelector("#filter-strip-pass");
        this.current = "open";
        this.activePass = null;
    }

    mount() {
        this.applyStored();
        this.buttons.forEach((btn) => {
            this.bind(btn, "click", () => this.setFilter(btn.dataset.filter));
        });
        this.listen(Events.FILTER_CHANGED, this.onFilterChanged);
        this.listen(Events.PASS_CHANGED, this.onPassChanged);
        if (this.passEl) {
            this.bind(this.passEl, "click", this.onPassClick);
        }
        this.renderPass();
    }

    setFilter(filter) {
        if (this.current === filter) return;
        this.current = filter;
        try { localStorage.setItem(FILTER_KEY, filter); } catch {}
        this.deps.bus.emit(Events.FILTER_CHANGED, { filter });
    }

    onFilterChanged({ filter }) {
        this.current = filter;
        this.buttons.forEach((btn) => {
            btn.setAttribute("aria-pressed", String(btn.dataset.filter === filter));
        });
    }

    onPassChanged(snapshot) {
        this.activePass = snapshot?.active ?? null;
        this.renderPass();
    }

    /** The chip is a single button. Active = shows the pass name, click
     *  opens the dialog (which includes "end" + switch + create + delete
     *  actions). Inactive = `+ pass`, click opens the same dialog focused
     *  on the create input (or showing inactive passes for resume). All
     *  flows go through PassDialog; no prompt()/alert() in this component. */
    renderPass() {
        if (!this.passEl) return;
        const label = this.passEl.querySelector(".filter-strip__pass-chip-label");
        if (this.activePass) {
            this.passEl.dataset.state = "active";
            this.passEl.title = `Active pass: ${this.activePass.name}. Click to switch, end, or start another.`;
            // Cap the visible name so the chip stays inside the margin column.
            // Full name remains in the title above for hover.
            const name = this.activePass.name;
            const shown = name.length > 24 ? `${name.slice(0, 23)}…` : name;
            if (label) label.textContent = `pass: ${shown}`;
        } else {
            this.passEl.dataset.state = "none";
            this.passEl.title = "Start or resume a named pass.";
            if (label) label.textContent = "+ pass";
        }
    }

    onPassClick(ev) {
        ev.preventDefault();
        this.deps.bus.emit(Events.PASS_DIALOG_OPEN);
    }

    applyStored() {
        let filter = "open";
        try {
            const saved = localStorage.getItem(FILTER_KEY);
            if (VALID.has(saved)) filter = saved;
        } catch {}
        this.current = filter;
        this.buttons.forEach((btn) => {
            btn.setAttribute("aria-pressed", String(btn.dataset.filter === filter));
        });
        // Defer one tick so listeners that mount after this component still receive the initial value.
        queueMicrotask(() => this.deps.bus.emit(Events.FILTER_CHANGED, { filter }));
    }
}

function escape(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
}
