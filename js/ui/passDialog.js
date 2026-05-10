// Pass dialog. A modal that consolidates every pass action: end the active
// pass, resume an inactive one, delete a forgotten one, or start a new pass
// by name. Replaces the prior prompt()/alert() flow.
//
// Pattern: stateful component over a <dialog>. Emits no business events;
// it dispatches directly into PassStore (which fires PASS_CHANGED).

import { Component } from "../lib/component.js";
import { Events } from "../lib/eventBus.js";

export class PassDialog extends Component {
    constructor(rootEl, deps) {
        super(rootEl, deps);
        this.dialog = rootEl;
        this.input = rootEl.querySelector("#pass-dialog-input");
        this.itemsEl = rootEl.querySelector("#pass-dialog-items");
        this.activeEl = rootEl.querySelector('[data-section="active"]');
        this.activeNameEl = rootEl.querySelector("#pass-dialog-active-name");
        this.listSectionEl = rootEl.querySelector('[data-section="list"]');
        this.listHeading = rootEl.querySelector("#pass-dialog-list-h3");
        this.createForm = rootEl.querySelector("#pass-dialog-create");
    }

    mount() {
        this.listen(Events.PASS_DIALOG_OPEN, this.open);
        this.listen(Events.PASS_DIALOG_CLOSE, this.close);
        this.listen(Events.PASS_CHANGED, this.onPassChanged);

        this.bind(this.dialog, "click", this.onDialogClick);
        this.bind(this.dialog, "close", this.onDialogClose);
        this.bind(this.dialog, "cancel", (ev) => { ev.preventDefault(); this.close(); });
        this.bind(this.itemsEl, "click", this.onItemsClick);
        this.bind(this.createForm, "submit", this.onCreateSubmit);
    }

    open() {
        this.render();
        if (!this.dialog.open) this.dialog.showModal();
        // Focus the input only when there is no active pass (the most likely
        // intent is "start a new pass"). When a pass is active, leave focus
        // on the dialog so the keyboard does not start typing into the
        // input by surprise.
        const active = this.deps.passStore?.getActive();
        if (!active) queueMicrotask(() => this.input.focus());
    }

    close() {
        if (this.dialog.open) this.dialog.close();
    }

    onDialogClose() {
        this.input.value = "";
    }

    onPassChanged() {
        if (this.dialog.open) this.render();
    }

    onDialogClick(ev) {
        const closer = ev.target.closest('[data-action="close"]');
        if (closer) { ev.preventDefault(); this.close(); return; }
        const ender = ev.target.closest('[data-action="end"]');
        if (ender) { this.endActive(); return; }
        // Click on the dialog backdrop closes (clicks outside .pass-dialog__inner).
        if (ev.target === this.dialog) this.close();
    }

    onItemsClick(ev) {
        const li = ev.target.closest("[data-id]");
        if (!li) return;
        const id = li.dataset.id;
        const act = ev.target.closest("[data-act]")?.dataset.act;
        if (!act) return;
        if (act === "activate") this.activatePass(id);
        else if (act === "delete") this.forgetPass(id, li);
    }

    onCreateSubmit(ev) {
        ev.preventDefault();
        const name = this.input.value.trim();
        if (!name) return;
        this.deps.passStore.start(name).then(() => {
            this.input.value = "";
            this.close();
        });
    }

    async activatePass(id) {
        await this.deps.passStore.activate(id);
        this.close();
    }

    async forgetPass(id, li) {
        const name = li.querySelector(".pass-dialog__item-name")?.textContent ?? "this pass";
        if (!window.confirm(`Forget pass "${name}"? Notes that referenced it will lose their group but otherwise persist.`)) return;
        await this.deps.passStore.forget(id);
    }

    async endActive() {
        await this.deps.passStore.end();
    }

    render() {
        const store = this.deps.passStore;
        if (!store) return;
        const active = store.getActive();
        const list = store.list();

        // Active section
        if (active) {
            this.activeEl.hidden = false;
            this.activeNameEl.textContent = active.name;
        } else {
            this.activeEl.hidden = true;
        }

        // Inactive list
        const inactive = list.filter((p) => p.id !== active?.id)
            .sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));

        if (inactive.length === 0) {
            this.listSectionEl.hidden = true;
        } else {
            this.listSectionEl.hidden = false;
            this.listHeading.textContent = active ? "switch to another pass" : "resume an earlier pass";
            this.itemsEl.innerHTML = inactive.map((p) => `
                <li class="pass-dialog__item" data-id="${escape(p.id)}">
                    <span class="pass-dialog__item-name">${escape(p.name)}</span>
                    <span class="pass-dialog__item-meta">last active ${escape(formatDate(p.lastActiveAt))}</span>
                    <button type="button" class="pass-dialog__action" data-act="activate">${active ? "switch" : "resume"}</button>
                    <button type="button" class="pass-dialog__action pass-dialog__action--danger" data-act="delete">remove</button>
                </li>
            `).join("");
        }
    }
}

function formatDate(iso) {
    if (typeof iso !== "string") return "";
    const m = iso.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : iso;
}

function escape(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
}
