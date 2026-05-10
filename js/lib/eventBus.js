// Pub/sub bus. Decouples components: emitters never know who listens.

export class EventBus {
    constructor() {
        this.channels = new Map();
    }

    on(event, handler) {
        if (!this.channels.has(event)) this.channels.set(event, new Set());
        this.channels.get(event).add(handler);
        return () => this.off(event, handler);
    }

    off(event, handler) {
        this.channels.get(event)?.delete(handler);
    }

    emit(event, payload) {
        this.channels.get(event)?.forEach((h) => h(payload));
    }
}

export const bus = new EventBus();

export const Events = Object.freeze({
    WORKSPACE_OPENED: "workspace:opened",
    WORKSPACE_CLEARED: "workspace:cleared",
    FILES_LISTED: "files:listed",
    FILE_SELECTED: "file:selected",
    FILE_LOADED: "file:loaded",

    SELECTION_MADE: "selection:made",
    SELECTION_CLEARED: "selection:cleared",

    COMPOSER_OPEN: "composer:open",
    COMPOSER_CLOSE: "composer:close",
    COMPOSER_SAVED: "composer:saved",

    ANNOTATION_CREATED: "annotation:created",
    ANNOTATION_UPDATED: "annotation:updated",
    ANNOTATION_DELETED: "annotation:deleted",
    ANNOTATION_FOCUSED: "annotation:focused",

    LAYOUT_REFLOW: "layout:reflow",
    ANCHOR_STATES_RESOLVED: "anchor:states-resolved",

    PASS_CHANGED: "pass:changed",
    PASS_DIALOG_OPEN: "pass:dialog-open",
    PASS_DIALOG_CLOSE: "pass:dialog-close",

    WORKSPACE_RENDERED: "workspace:rendered",
    FILE_FOCUSED: "file:focused",
    MODE_CHANGED: "mode:changed",

    FILTER_CHANGED: "filter:changed",
    THEME_CHANGED: "theme:changed",

    PALETTE_OPEN: "palette:open",
    PALETTE_CLOSE: "palette:close",
    RAIL_TOGGLED: "rail:toggled",

    REVIEW_EXPORTED: "review:exported",
    TOAST: "toast",
});
