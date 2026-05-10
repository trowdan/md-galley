// Chrome (top app bar). v3 layout:
//   left:  brand · filename
//   right: palette icon (⌘K), rail icon (⌘\), theme icon, export N
// Filter and count are owned elsewhere now.

import { Component } from "../lib/component.js";
import { Events } from "../lib/eventBus.js";

const THEME_KEY = "mdgalley:theme";

export class Chrome extends Component {
    constructor(rootEl, deps) {
        super(rootEl, deps);
        this.brandBtn = rootEl.querySelector("#brand");
        this.fileEl = rootEl.querySelector("#chrome-file");
        this.exportBtn = rootEl.querySelector("#export-review");
        this.themeBtn = rootEl.querySelector("#toggle-theme");
        this.paletteBtn = rootEl.querySelector("#open-palette");
        this.workspaceBtn = rootEl.querySelector("#open-workspace");
        this.settingsBtn = rootEl.querySelector("#open-settings");
        this.settingsMenu = rootEl.querySelector("#settings-menu");
    }

    mount() {
        this.applyStoredTheme();

        this.bind(this.brandBtn, "click", () => this.deps.bus.emit(Events.PALETTE_OPEN));
        this.bind(this.paletteBtn, "click", () => this.deps.bus.emit(Events.PALETTE_OPEN));
        this.bind(this.workspaceBtn, "click", () => this.deps.openWorkspace());
        this.bind(this.themeBtn, "click", () => this.toggleTheme());
        this.bind(this.settingsBtn, "click", (ev) => this.toggleSettings(ev));
        this.bind(this.settingsMenu, "click", (ev) => this.onSettingsItemClick(ev));
        this.bind(document, "click", (ev) => this.onDocClick(ev));
        this.bind(document, "keydown", (ev) => { if (ev.key === "Escape") this.closeSettings(); });
        this.bind(this.exportBtn, "click", () => this.export());

        this.listen(Events.WORKSPACE_OPENED, this.refresh);
        this.listen(Events.FILE_LOADED, this.onFileLoaded);
        this.listen(Events.ANNOTATION_CREATED, this.refresh);
        this.listen(Events.ANNOTATION_UPDATED, this.refresh);
        this.listen(Events.ANNOTATION_DELETED, this.refresh);
        this.listen(Events.WORKSPACE_CLEARED, this.onWorkspaceCleared);
    }

    onFileLoaded({ chapterTitle, filePath }) {
        const filename = filePath?.split("/").pop() ?? "";
        this.fileEl.textContent = filename || "no file open";
        document.title = chapterTitle ? `${chapterTitle} · MDGalley` : "MDGalley";
    }

    onWorkspaceCleared() {
        this.fileEl.textContent = "no file open";
        this.exportBtn.textContent = "export 0";
        this.exportBtn.disabled = true;
    }

    toggleSettings(ev) {
        ev.stopPropagation();
        const open = !this.settingsMenu.hidden;
        if (open) this.closeSettings(); else this.openSettings();
    }

    openSettings() {
        this.settingsMenu.hidden = false;
        this.settingsBtn.setAttribute("aria-expanded", "true");
    }

    closeSettings() {
        if (this.settingsMenu.hidden) return;
        this.settingsMenu.hidden = true;
        this.settingsBtn.setAttribute("aria-expanded", "false");
    }

    onDocClick(ev) {
        if (this.settingsMenu.hidden) return;
        if (this.settingsMenu.contains(ev.target)) return;
        if (this.settingsBtn.contains(ev.target)) return;
        this.closeSettings();
    }

    onSettingsItemClick(ev) {
        const btn = ev.target.closest('button[data-action]');
        if (!btn) return;
        ev.stopPropagation();
        this.closeSettings();
        if (btn.dataset.action === "reset") this.deps.runReset();
        else if (btn.dataset.action === "continuous") this.toggleContinuous();
    }

    /** Flip continuous mode (manuscript-across-files) and reload. The flag
     *  is read at workspace-open time, so a reload is the cheapest way to
     *  rebuild the rendered DOM without a runtime mode-switch path. */
    toggleContinuous() {
        let next = true;
        try {
            const cur = localStorage.getItem("mdgalley:continuous") === "true";
            next = !cur;
            localStorage.setItem("mdgalley:continuous", String(next));
        } catch {}
        this.deps.bus.emit(Events.TOAST, {
            message: next ? "manuscript-across-files: ON (reloading)" : "single-file mode: ON (reloading)",
        });
        setTimeout(() => window.location.reload(), 250);
    }

    toggleTheme() {
        const html = document.documentElement;
        const next = html.dataset.theme === "dark" ? "light" : "dark";
        html.dataset.theme = next;
        try { localStorage.setItem(THEME_KEY, next); } catch {}
        this.deps.bus.emit(Events.THEME_CHANGED, { theme: next });
    }

    applyStoredTheme() {
        try {
            const saved = localStorage.getItem(THEME_KEY);
            if (saved === "dark" || saved === "light") document.documentElement.dataset.theme = saved;
        } catch {}
    }

    async refresh() {
        const t = await this.deps.annotationStore.tallies();
        this.exportBtn.textContent = `export ${t.open}`;
        this.exportBtn.disabled = t.total === 0;
    }

    async export() {
        const handle = this.deps.workspace.handle;
        if (!handle) return;
        const byFile = await this.deps.annotationStore.listAll();
        const total = [...byFile.values()].reduce((n, arr) => n + arr.length, 0);
        if (total === 0) {
            this.deps.bus.emit(Events.TOAST, { message: "no notes to export" });
            return;
        }
        const { filename, content } = this.deps.exporter(byFile);
        await this.deps.files.write(handle, filename, content);
        this.deps.bus.emit(Events.REVIEW_EXPORTED, { filename, count: total });
        this.deps.bus.emit(Events.TOAST, { message: `wrote ${filename.split("/").pop()} (${total} notes)` });
    }
}
