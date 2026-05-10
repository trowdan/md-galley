// Minimal lifecycle-bearing component base. Inspired by the "view-model" pattern:
// each subclass owns one DOM root, declares its dependencies, and cleans up after itself.

export class Component {
    constructor(rootEl, deps = {}) {
        if (!rootEl) throw new Error(`${this.constructor.name}: rootEl is required`);
        this.root = rootEl;
        this.deps = deps;
        this.subscriptions = [];
        this.eventListeners = [];
    }

    /** Listen on the bus and auto-cleanup on destroy. */
    listen(event, handler) {
        const unsub = this.deps.bus.on(event, handler.bind(this));
        this.subscriptions.push(unsub);
    }

    /** Bind a DOM listener and auto-cleanup on destroy. */
    bind(el, type, handler, options) {
        const bound = handler.bind(this);
        el.addEventListener(type, bound, options);
        this.eventListeners.push(() => el.removeEventListener(type, bound, options));
    }

    /** Subclasses override. Called by the bootstrap once. */
    mount() {}

    /** Called when the component is removed. Releases everything. */
    destroy() {
        this.subscriptions.forEach((u) => u());
        this.eventListeners.forEach((u) => u());
        this.subscriptions = [];
        this.eventListeners = [];
    }
}
