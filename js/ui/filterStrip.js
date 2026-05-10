// Filter strip. Sticky bar below the chrome, right-aligned to the gutter
// column, holding the open / resolved / all toggle. Owns persistence to
// localStorage and emits FILTER_CHANGED on every flip.

import { Component } from "../lib/component.js";
import { Events } from "../lib/eventBus.js";

const FILTER_KEY = "bookwright:filter";
const VALID = new Set(["open", "resolved", "all"]);

export class FilterStrip extends Component {
    constructor(rootEl, deps) {
        super(rootEl, deps);
        this.buttons = [...rootEl.querySelectorAll("button[data-filter]")];
        this.current = "open";
    }

    mount() {
        this.applyStored();
        this.buttons.forEach((btn) => {
            this.bind(btn, "click", () => this.setFilter(btn.dataset.filter));
        });
        this.listen(Events.FILTER_CHANGED, this.onFilterChanged);
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
