// Tiny IndexedDB wrapper. One database, key-value semantics on top of object stores.
// Why not localStorage: directory handles must be cloned via structuredClone, which
// IndexedDB supports natively and localStorage does not.

const DB_NAME = "mdgalley";
const DB_VERSION = 1;
const STORES = ["workspace", "annotations"];

let dbPromise = null;

function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            STORES.forEach((name) => {
                if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
            });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    return dbPromise;
}

async function tx(store, mode) {
    const db = await openDb();
    return db.transaction(store, mode).objectStore(store);
}

export const idb = {
    async get(store, key) {
        const os = await tx(store, "readonly");
        return new Promise((resolve, reject) => {
            const r = os.get(key);
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => reject(r.error);
        });
    },
    async set(store, key, value) {
        const os = await tx(store, "readwrite");
        return new Promise((resolve, reject) => {
            const r = os.put(value, key);
            r.onsuccess = () => resolve();
            r.onerror = () => reject(r.error);
        });
    },
    async delete(store, key) {
        const os = await tx(store, "readwrite");
        return new Promise((resolve, reject) => {
            const r = os.delete(key);
            r.onsuccess = () => resolve();
            r.onerror = () => reject(r.error);
        });
    },
    async keys(store) {
        const os = await tx(store, "readonly");
        return new Promise((resolve, reject) => {
            const r = os.getAllKeys();
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => reject(r.error);
        });
    },
    async values(store) {
        const os = await tx(store, "readonly");
        return new Promise((resolve, reject) => {
            const r = os.getAll();
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => reject(r.error);
        });
    },
    async clear(store) {
        const os = await tx(store, "readwrite");
        return new Promise((resolve, reject) => {
            const r = os.clear();
            r.onsuccess = () => resolve();
            r.onerror = () => reject(r.error);
        });
    },
};
