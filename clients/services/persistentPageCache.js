import { sessionData } from "./sessionData.js";

export const PERSISTED_TTL_MS = 5 * 60 * 1000;
export const SNAPSHOT_DB = "communishield_page_previews_v1";
const STORE = "previews";
const MAX_BYTES = 100000;
const roles = ["user", "admin", "super_admin"];

// Deliberately do not persist reports, narratives, coordinates, people, photos,
// account records, settings/secrets, notifications, audit logs or training data.
export function safePagePreview(path, data, role) {
  if (path === "/admin/overview" && ["admin", "super_admin"].includes(role)) {
    const summary = {};
    for (const name of ["total", "pending", "verified", "rejected", "hotspots"]) {
      const value = data?.summary?.[name];
      if (Number.isSafeInteger(value) && value >= 0) summary[name] = value;
    }
    return ["total", "pending", "verified", "rejected"].every(key => key in summary) ? { summary } : null;
  }
  if (path === "/incidents/options" && Array.isArray(data?.categories)) {
    return { categories: data.categories.slice(0, 100).map(category => {
      if (typeof category?.category !== "string" || !Array.isArray(category.types)) return null;
      return { category: category.category.slice(0, 200), types: category.types.filter(type => typeof type === "string")
        .slice(0, 200).map(type => type.slice(0, 200)) };
    }).filter(Boolean) };
  }
  return null;
}

// IndexedDB is optional (including on native). Blocked/private-mode/quota failures
// fail open to the normal network/memory path, never to unvalidated cached data.
export function createPreviewStorage({ indexedDB = globalThis.indexedDB, timeout = 250 } = {}) {
  let opening = null;
  const open = () => {
    if (!indexedDB) return Promise.resolve(null);
    if (opening) return opening;
    opening = new Promise(resolve => {
      let settled = false;
      const finish = db => { if (!settled) { settled = true; clearTimeout(timer); resolve(db); } else db?.close(); };
      const timer = setTimeout(() => finish(null), timeout);
      try {
        const request = indexedDB.open(SNAPSHOT_DB, 1);
        request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "scope" }); };
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => { db.close(); opening = null; };
          finish(db);
        };
        request.onerror = request.onblocked = () => finish(null);
      } catch { finish(null); }
    });
    return opening;
  };
  const transaction = async (mode, action) => {
    const db = await open();
    if (!db) return null;
    return new Promise(resolve => {
      let tx, result = null, settled = false;
      const finish = value => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
      const timer = setTimeout(() => { try { tx?.abort(); } catch {} finish(null); }, timeout);
      try {
        tx = db.transaction(STORE, mode);
        const request = action(tx.objectStore(STORE));
        if (request) request.onsuccess = () => { result = request.result; };
        tx.oncomplete = () => finish(result);
        tx.onerror = tx.onabort = () => finish(null);
      } catch { finish(null); }
    });
  };
  return {
    read: scope => transaction("readonly", store => store.get(scope)),
    replace: record => transaction("readwrite", store => { store.clear(); return store.put(record); }),
    clear: () => transaction("readwrite", store => store.clear()),
  };
}

export function createPersistentPageCache({ memory, storage, now = () => Date.now() }) {
  let identity = null, generation = 0, pages = new Map(), queue = Promise.resolve();
  const enqueue = action => {
    queue = queue.then(action).catch(() => {});
    return queue;
  };
  const clear = () => {
    generation++; identity = null; pages.clear();
    return enqueue(() => storage.clear());
  };
  const validTime = at => Number.isFinite(at) && now() >= at && now() - at < PERSISTED_TTL_MS &&
    new Date(at).toISOString().slice(0, 10) === new Date(now()).toISOString().slice(0, 10);
  const save = () => {
    if (!identity) return;
    const ticket = generation, scope = identity.scope;
    const record = { version: 1, scope, pages: [...pages.values()].filter(page => validTime(page.checkedAt)) };
    if (JSON.stringify(record).length > MAX_BYTES) return;
    void enqueue(() => ticket === generation && identity?.scope === scope ? storage.replace(record) : undefined);
  };
  const unsubscribe = memory.subscribe(event => {
    if (event.type === "session") {
      if (event.reason !== "begin" || event.hadSession) void clear();
      else { generation++; identity = null; pages.clear(); }
    }
    if (event.type === "invalidate" || event.type === "denied") {
      pages.clear();
      // Keep the already validated identity for subsequent fresh responses, but
      // fence writes already waiting in the queue and erase their saved copies.
      generation++;
      memory.set("preview:/admin/overview", undefined);
      void enqueue(() => storage.clear());
    }
    if (event.type === "page" && identity && memory.current(identity.epoch)) {
      const data = safePagePreview(event.path, event.data, identity.role);
      if (data) { pages.set(event.path, { path: event.path, data, checkedAt: event.checkedAt }); save(); }
    }
  });
  const activate = async ({ userId, role, apiUrl }) => {
    if (typeof userId !== "string" || !userId || !roles.includes(role) || !apiUrl || memory.session()?.role !== role) return;
    const epoch = memory.epoch();
    const scope = JSON.stringify([String(apiUrl).replace(/\/+$/, ""), userId, role]);
    if (identity?.scope === scope && identity.epoch === epoch) return;
    identity = { scope, role, epoch }; pages = new Map();
    const ticket = ++generation;
    // A slow/unavailable storage engine must not hold the startup screen.
    let timer;
    const record = await Promise.race([
      Promise.resolve(queue).then(() => storage.read(scope)).catch(() => null),
      new Promise(resolve => { timer = setTimeout(() => resolve(null), 300); }),
    ]).finally(() => clearTimeout(timer));
    if (ticket !== generation || !memory.current(epoch)) return;
    let bounded = false;
    try { bounded = JSON.stringify(record)?.length <= MAX_BYTES; } catch { /* Corrupt cache must not block sign-in. */ }
    if (record?.version === 1 && record.scope === scope && Array.isArray(record.pages) && bounded) {
      for (const page of record.pages.slice(0, 2)) {
        if (!validTime(page.checkedAt)) continue;
        if (pages.has(page.path)) continue; // A newer live response wins over disk.
        const data = safePagePreview(page.path, page.data, role);
        if (!data) continue;
        pages.set(page.path, { path: page.path, data, checkedAt: page.checkedAt });
        if (page.path === "/admin/overview" && !memory.get("api:/admin/overview")) {
          memory.set("preview:/admin/overview", { ...data, checkedAt: page.checkedAt }, page.checkedAt);
        }
        if (page.path === "/incidents/options" && !memory.get("api:/incidents/options")) memory.set("api:/incidents/options", data, page.checkedAt);
      }
    }
    // Purge other identities/stale versions, without refreshing original timestamps.
    save();
  };
  return { activate, clear, flush: () => queue, dispose: unsubscribe };
}

export const persistentPageCache = createPersistentPageCache({ memory: sessionData, storage: createPreviewStorage() });
