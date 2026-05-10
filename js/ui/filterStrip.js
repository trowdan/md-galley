// Filter strip. Sticky bar below the chrome, right-aligned to the gutter
// column, holding the open / resolved / all toggle and the active-pass
// chip. Owns persistence of the status filter to localStorage and emits
// FILTER_CHANGED on every flip. Pass control is delegated to PassStore.

import { Component } from "../lib/component.js";
import { Events } from "../lib/eventBus.js";

const FILTER_KEY = "bookwright:filter";
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

    renderPass() {
        if (!this.passEl) return;
        if (this.activePass) {
            this.passEl.dataset.state = "active";
            this.passEl.innerHTML = `
                <span class="filter-strip__pass-label">pass: ${escape(this.activePass.name)}</span>
                <button type="button" class="filter-strip__pass-action" data-pass-action="end" title="End the active pass (notes are kept)">×</button>
                <button type="button" class="filter-strip__pass-action" data-pass-action="switch" title="Switch to a different pass">switch</button>
            `;
        } else {
            this.passEl.dataset.state = "none";
            this.passEl.innerHTML = `
                <button type="button" class="filter-strip__pass-action" data-pass-action="start">+ pass</button>
                <button type="button" class="filter-strip__pass-action" data-pass-action="resume" title="Resume an earlier pass">resume</button>
            `;
        }
    }

    async onPassClick(ev) {
        const btn = ev.target.closest("[data-pass-action]");
        if (!btn) return;
        const action = btn.dataset.passAction;
        const passStore = this.deps.passStore;
        if (!passStore) return;
        if (action === "start" || action === "switch") {
            const name = window.prompt(action === "start" ? "Pass name:" : "Switch to pass (name):", "");
            if (!name || !name.trim()) return;
            await passStore.start(name.trim());
        } else if (action === "end") {
            await passStore.end();
        } else if (action === "resume") {
            const list = passStore.list();
            if (list.length === 0) {
                window.alert("No earlier passes to resume.");
                return;
            }
            const lines = list.map((p, i) => `${i + 1}. ${p.name}`).join("\n");
            const choice = window.prompt(`Resume which pass?\n${lines}`, "1");
            const idx = Number.parseInt(choice ?? "", 10);
            const pick = list[idx - 1];
            if (pick) await passStore.activate(pick.id);
        }
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
