// Command palette. Centred dialog by default; flips to a 240 px left rail on
// cmd-\. Same component, two layouts. Lists files with their open/resolved
// ratio; type to fuzzy-filter; arrow keys navigate; enter opens.
// Pattern: stateful component over a <dialog>.

import { Component } from "../lib/component.js";
import { Events } from "../lib/eventBus.js";

const RAIL_KEY = "mdgalley:rail";

export class Palette extends Component {
    constructor(rootEl, deps) {
        super(rootEl, deps);
        this.input = rootEl.querySelector("#palette-search");
        this.list = rootEl.querySelector("#palette-list");
        this.entries = [];
        this.filtered = [];
        this.selectedIndex = 0;
        this.tally = new Map();
    }

    mount() {
        this.applyStoredRail();

        this.listen(Events.PALETTE_OPEN, this.open);
        this.listen(Events.PALETTE_CLOSE, this.close);
        this.listen(Events.RAIL_TOGGLED, this.toggleRail);
        this.listen(Events.FILES_LISTED, this.onFilesListed);
        this.listen(Events.ANNOTATION_CREATED, this.refreshTally);
        this.listen(Events.ANNOTATION_UPDATED, this.refreshTally);
        this.listen(Events.ANNOTATION_DELETED, this.refreshTally);
        this.listen(Events.FILE_SELECTED, this.onFileSelected);

        this.bind(this.input, "input", this.onInput);
        this.bind(this.input, "keydown", this.onInputKeydown);
        this.bind(this.list, "click", this.onListClick);
        this.bind(this.root, "close", this.onDialogClose);
    }

    onFilesListed({ files }) {
        this.entries = files;
        this.refreshTally();
    }

    async refreshTally() {
        const t = await this.deps.annotationStore.tallies();
        this.tally = t.perFile;
        if (this.root.open || document.body.dataset.rail === "true") this.render();
    }

    onFileSelected({ path }) {
        this.activePath = path;
        this.render();
    }

    open() {
        if (document.body.dataset.rail === "true") {
            this.input.focus();
            return;
        }
        if (!this.root.open) this.root.showModal();
        this.input.value = "";
        this.input.focus();
        this.render();
    }

    close() {
        if (this.root.open) this.root.close();
    }

    toggleRail() {
        const isRail = document.body.dataset.rail === "true";
        if (isRail) {
            document.body.removeAttribute("data-rail");
            try { localStorage.setItem(RAIL_KEY, "false"); } catch {}
            this.close();
        } else {
            document.body.dataset.rail = "true";
            try { localStorage.setItem(RAIL_KEY, "true"); } catch {}
            if (this.root.open) this.root.close();
            this.root.show();
            this.render();
        }
    }

    applyStoredRail() {
        try {
            if (localStorage.getItem(RAIL_KEY) === "true") {
                document.body.dataset.rail = "true";
                queueMicrotask(() => {
                    this.root.show();
                    this.render();
                });
            }
        } catch {}
    }

    onInput() {
        this.selectedIndex = 0;
        this.render();
    }

    onInputKeydown(ev) {
        if (ev.key === "ArrowDown") {
            ev.preventDefault();
            this.selectedIndex = Math.min(this.selectedIndex + 1, this.filtered.length - 1);
            this.render({ scrollSelected: true });
        } else if (ev.key === "ArrowUp") {
            ev.preventDefault();
            this.selectedIndex = Math.max(0, this.selectedIndex - 1);
            this.render({ scrollSelected: true });
        } else if (ev.key === "Enter") {
            ev.preventDefault();
            this.openSelected();
        } else if (ev.key === "Escape") {
            ev.preventDefault();
            if (document.body.dataset.rail !== "true") this.close();
        }
    }

    onListClick(ev) {
        const btn = ev.target.closest("button[data-path]");
        if (!btn) return;
        this.deps.bus.emit(Events.FILE_SELECTED, { path: btn.dataset.path });
        if (document.body.dataset.rail !== "true") this.close();
    }

    onDialogClose() {
        // Dialog closed by user (esc, click outside). No-op.
    }

    openSelected() {
        const item = this.filtered[this.selectedIndex];
        if (!item) return;
        this.deps.bus.emit(Events.FILE_SELECTED, { path: item.path });
        if (document.body.dataset.rail !== "true") this.close();
    }

    render({ scrollSelected = false } = {}) {
        const query = (this.input.value ?? "").trim().toLowerCase();
        this.filtered = this.entries.filter((e) =>
            !query
            || e.name.toLowerCase().includes(query)
            || e.path.toLowerCase().includes(query)
        );

        if (this.filtered.length === 0) {
            const msg = query
                ? `No files match "${escape(query)}"`
                : "No markdown files in this workspace.";
            this.list.innerHTML = `<li><p class="palette__empty">${msg}</p></li>`;
            return;
        }

        const fileItems = this.filtered.map((entry, i) => {
            const t = this.tally.get(entry.path);
            const ratio = t ? `${t.open}/${t.resolved}` : `0/0`;
            const isActive = entry.path === this.activePath;
            const isSelected = i === this.selectedIndex;
            return `
                <li>
                    <button data-path="${escape(entry.path)}"
                            aria-selected="${isSelected ? "true" : "false"}"
                            ${isActive ? 'data-active="true"' : ""}>
                        <span class="palette__title">${escape(prettyTitle(entry))}</span>
                        <span class="palette__path">${escape(entry.path)}</span>
                        <span class="palette__ratio">${ratio}</span>
                    </button>
                </li>
            `;
        });
        this.list.innerHTML = fileItems.join("");

        if (scrollSelected) {
            this.list.querySelector("[aria-selected='true']")
                ?.scrollIntoView({ block: "nearest" });
        }
    }
}

function prettyTitle(entry) {
    // "01-introduction.md" -> "01: introduction"
    const base = entry.name.replace(/\.md$|\.markdown$/i, "");
    const m = base.match(/^(\d+)[-_](.+)/);
    if (m) return `${m[1]}: ${m[2].replace(/[-_]/g, " ")}`;
    return base.replace(/[-_]/g, " ");
}

function escape(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
}
