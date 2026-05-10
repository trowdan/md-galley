// Toast renderer. Listens for TOAST events and shows a transient mono message.

import { Component } from "../lib/component.js";
import { Events } from "../lib/eventBus.js";

const VISIBLE_MS = 2400;

export class Toast extends Component {
    constructor(rootEl, deps) {
        super(rootEl, deps);
        this.hideTimer = null;
    }

    mount() {
        this.listen(Events.TOAST, this.show);
    }

    show({ message }) {
        clearTimeout(this.hideTimer);
        this.root.textContent = message;
        this.root.hidden = false;
        this.hideTimer = setTimeout(() => {
            this.root.hidden = true;
        }, VISIBLE_MS);
    }
}
