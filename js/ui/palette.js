// Command palette. Centred dialog by default; flips to a 240 px left rail on
// cmd-\. Same component, two layouts. Lists files as an expandable folder
// tree (IDE-style) when the search box is empty; collapses to a flat,
// path-bearing fuzzy result list as soon as the reader types.
// Pattern: stateful component over a <dialog>.

import { Component } from "../lib/component.js";
import { Events } from "../lib/eventBus.js";

const RAIL_KEY = "mdgalley:rail";
const COLLAPSED_KEY = "mdgalley:palette-collapsed";

export class Palette extends Component {
    constructor(rootEl, deps) {
        super(rootEl, deps);
        this.input = rootEl.querySelector("#palette-search");
        this.list = rootEl.querySelector("#palette-list");
        this.entries = [];
        this.tree = null;
        this.visible = [];
        this.selectedIndex = 0;
        this.tally = new Map();
        this.collapsed = loadCollapsed();
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
        this.tree = buildTree(files);
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
            this.selectedIndex = Math.min(this.selectedIndex + 1, this.visible.length - 1);
            this.render({ scrollSelected: true });
        } else if (ev.key === "ArrowUp") {
            ev.preventDefault();
            this.selectedIndex = Math.max(0, this.selectedIndex - 1);
            this.render({ scrollSelected: true });
        } else if (ev.key === "ArrowRight") {
            const item = this.visible[this.selectedIndex];
            if (item?.kind === "dir" && !item.expanded) {
                ev.preventDefault();
                this.setCollapsed(item.path, false);
            }
        } else if (ev.key === "ArrowLeft") {
            const item = this.visible[this.selectedIndex];
            if (item?.kind === "dir" && item.expanded) {
                ev.preventDefault();
                this.setCollapsed(item.path, true);
            }
        } else if (ev.key === "Enter") {
            ev.preventDefault();
            this.openSelected();
        } else if (ev.key === "Escape") {
            ev.preventDefault();
            if (document.body.dataset.rail !== "true") this.close();
        }
    }

    onListClick(ev) {
        const dirBtn = ev.target.closest("button[data-dir]");
        if (dirBtn) {
            const path = dirBtn.dataset.dir;
            this.setCollapsed(path, !this.collapsed.has(path));
            return;
        }
        const fileBtn = ev.target.closest("button[data-path]");
        if (!fileBtn) return;
        this.deps.bus.emit(Events.FILE_SELECTED, { path: fileBtn.dataset.path });
        if (document.body.dataset.rail !== "true") this.close();
    }

    onDialogClose() {
        // Dialog closed by user (esc, click outside). No-op.
    }

    openSelected() {
        const item = this.visible[this.selectedIndex];
        if (!item) return;
        if (item.kind === "dir") {
            this.setCollapsed(item.path, item.expanded);
            return;
        }
        this.deps.bus.emit(Events.FILE_SELECTED, { path: item.entry.path });
        if (document.body.dataset.rail !== "true") this.close();
    }

    setCollapsed(path, collapsed) {
        if (collapsed) this.collapsed.add(path);
        else this.collapsed.delete(path);
        saveCollapsed(this.collapsed);
        this.render();
    }

    render({ scrollSelected = false } = {}) {
        const query = (this.input.value ?? "").trim().toLowerCase();

        if (query) {
            // Search mode: flat, path-bearing matches. Same behaviour as
            // before — typing collapses the tree to a fuzzy file picker.
            this.visible = this.entries
                .filter((e) =>
                    e.name.toLowerCase().includes(query)
                    || e.path.toLowerCase().includes(query)
                )
                .map((entry) => ({ kind: "file", entry, depth: 0, showPath: true }));
        } else {
            // Tree mode: flatten the folder tree into a single ordered list,
            // skipping subtrees the user collapsed.
            this.visible = [];
            if (this.tree) flattenTree(this.tree, 0, this.collapsed, this.visible);
        }

        if (this.selectedIndex >= this.visible.length) {
            this.selectedIndex = Math.max(0, this.visible.length - 1);
        }
        if (this.selectedIndex < 0) this.selectedIndex = 0;

        if (this.visible.length === 0) {
            const msg = query
                ? `No files match "${escape(query)}"`
                : "No markdown files in this workspace.";
            this.list.innerHTML = `<li><p class="palette__empty">${msg}</p></li>`;
            return;
        }

        this.list.innerHTML = this.visible
            .map((item, i) => this.renderItem(item, i))
            .join("");

        if (scrollSelected) {
            this.list.querySelector("[aria-selected='true']")
                ?.scrollIntoView({ block: "nearest" });
        }
    }

    renderItem(item, i) {
        const isSelected = i === this.selectedIndex;
        const sel = isSelected ? "true" : "false";
        const style = `--depth:${item.depth}`;

        if (item.kind === "dir") {
            const glyph = item.expanded ? "▾" : "▸";
            return `
                <li>
                    <button type="button"
                            class="palette__row palette__row--dir"
                            data-dir="${escape(item.path)}"
                            aria-selected="${sel}"
                            aria-expanded="${item.expanded ? "true" : "false"}"
                            style="${style}">
                        <span class="palette__chevron" aria-hidden="true">${glyph}</span>
                        <span class="palette__title palette__title--dir">${escape(item.name)}</span>
                    </button>
                </li>
            `;
        }

        const entry = item.entry;
        const t = this.tally.get(entry.path);
        const ratio = t ? `${t.open}/${t.resolved}` : `0/0`;
        const isActive = entry.path === this.activePath;
        const pathLine = item.showPath
            ? `<span class="palette__path">${escape(entry.path)}</span>`
            : "";
        return `
            <li>
                <button type="button"
                        class="palette__row palette__row--file"
                        data-path="${escape(entry.path)}"
                        aria-selected="${sel}"
                        ${isActive ? 'data-active="true"' : ""}
                        style="${style}">
                    <span class="palette__chevron" aria-hidden="true"></span>
                    <span class="palette__title">${escape(prettyTitle(entry))}</span>
                    ${pathLine}
                    <span class="palette__ratio">${ratio}</span>
                </button>
            </li>
        `;
    }
}

function buildTree(entries) {
    const root = { kind: "dir", path: "", name: "", children: [] };
    for (const entry of entries) {
        const parts = entry.path.split("/");
        parts.pop(); // drop file name; only directory segments are walked
        let cur = root;
        let acc = "";
        for (const part of parts) {
            acc = acc ? `${acc}/${part}` : part;
            let next = cur.children.find((c) => c.kind === "dir" && c.name === part);
            if (!next) {
                next = { kind: "dir", path: acc, name: part, children: [] };
                cur.children.push(next);
            }
            cur = next;
        }
        cur.children.push({ kind: "file", entry });
    }
    sortTree(root);
    return root;
}

// Folders before files; within each kind, alpha-numeric so "01-foo" comes
// before "02-bar" the same way the chapter directory reads on disk.
function sortTree(node) {
    node.children.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
        const aKey = a.kind === "dir" ? a.name : a.entry.name;
        const bKey = b.kind === "dir" ? b.name : b.entry.name;
        return aKey.localeCompare(bKey, undefined, { numeric: true });
    });
    for (const c of node.children) {
        if (c.kind === "dir") sortTree(c);
    }
}

function flattenTree(node, depth, collapsed, out) {
    for (const child of node.children) {
        if (child.kind === "dir") {
            const expanded = !collapsed.has(child.path);
            out.push({ kind: "dir", path: child.path, name: child.name, expanded, depth });
            if (expanded) flattenTree(child, depth + 1, collapsed, out);
        } else {
            out.push({ kind: "file", entry: child.entry, depth });
        }
    }
}

function loadCollapsed() {
    try {
        const raw = localStorage.getItem(COLLAPSED_KEY);
        if (!raw) return new Set();
        const arr = JSON.parse(raw);
        return new Set(Array.isArray(arr) ? arr : []);
    } catch { return new Set(); }
}
function saveCollapsed(set) {
    try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...set])); } catch {}
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
