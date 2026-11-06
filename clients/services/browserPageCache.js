import { cachedPagePath } from "./sessionData.js";
import { querySnapshotKey, usableQuerySnapshot } from "./querySnapshots.js";
import { sha256 } from "@noble/hashes/sha2.js";
import LZString from "lz-string";

export const TAB_PAGE_CACHE_KEY = "communishield_tab_pages_v1";
export const TAB_PAGE_CACHE_MAX_AGE_MS = 30 * 60 * 1000;
const MAX_CHARS = 1000000; // Roughly 2 MB of browser storage, including UTF-16.
const MAX_DECODED_PAGE_CHARS = 16000000;

const digest = async value => {
  // Pure JS SHA-256 works on HTTP LAN addresses as well as localhost/HTTPS.
  // Web Crypto's secure-context restriction must not disable page restoration.
  const bytes = sha256(new TextEncoder().encode(value));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
};

// Only restore after /session has authoritatively verified the user and role.
// The digest binds the cache to the exact login and backend without storing a token.
export function createBrowserPageCache({ sessionData, storage, backend, now = () => Date.now(), fingerprint = digest }) {
  let scope = null, epoch = null, timer = null, restoring = false;
  let encodedPayloads = new WeakMap();
  const store = () => { try { return storage(); } catch { return null; } };
  const verified = () => scope !== null && sessionData.current(epoch) && Boolean(sessionData.session());
  const remove = () => { try { store()?.removeItem(TAB_PAGE_CACHE_KEY); } catch {} };
  const clear = () => {
    clearTimeout(timer); timer = null; scope = null; epoch = null; encodedPayloads = new WeakMap();
    remove();
  };
  const flush = () => {
    clearTimeout(timer); timer = null;
    if (!verified() || restoring || scope === "memory-only") return;
    try {
      const loaded = sessionData.pageEntries();
      const byKey = new Map(loaded);
      const entries = loaded
        .filter(([, entry]) => now() - entry.at < TAB_PAGE_CACHE_MAX_AGE_MS)
        // api:/path and the unfiltered query snapshot normally share a payload.
        // Store it once and reconstruct the raw-page alias during hydration.
        .filter(([key, entry]) => !key.startsWith("api:") ||
          byKey.get(querySnapshotKey(cachedPagePath(key)))?.data?.data !== entry.data)
        .sort(([, a], [, b]) => a.at - b.at)
        .map(([key, entry]) => {
          const snapshot = key.startsWith("query-snapshot:");
          const payload = snapshot ? entry.data.data : entry.data;
          if (!payload || typeof payload !== "object") return null;
          let encoded = encodedPayloads.get(payload);
          if (encoded === undefined) {
            const json = JSON.stringify(payload);
            if (json.length > MAX_DECODED_PAGE_CHARS) return null;
            encoded = LZString.compressToUTF16(json);
            encodedPayloads.set(payload, encoded);
          }
          return [key, { at: entry.at, ...(snapshot ? { checkedAt: entry.data.checkedAt } : {}), data: encoded }];
        }).filter(Boolean);
      // Keep recent pages when the tab quota cannot hold every filter snapshot.
      let serialized;
      do {
        serialized = JSON.stringify({ version: 2, scope, savedAt: now(), entries });
        if (serialized.length <= MAX_CHARS) {
          try { store()?.setItem(TAB_PAGE_CACHE_KEY, serialized); return; } catch {}
        }
        entries.shift();
      } while (entries.length);
      remove();
    } catch { remove(); }
  };
  const unsubscribe = sessionData.subscribe(event => {
    if (event.type === "session") {
      clearTimeout(timer); timer = null; scope = null; epoch = null; encodedPayloads = new WeakMap();
      // First adoption during startup must not erase the tab's saved snapshot.
      if (event.reason !== "begin" || event.hadSession) remove();
    } else if (verified() && !restoring) {
      if (event.type === "invalidate" || event.type === "denied") flush();
      else if (event.type === "cache") {
        clearTimeout(timer);
        timer = setTimeout(flush, 150);
      }
    }
  });

  const restore = async ({ token, role, userId }) => {
    const ticket = sessionData.epoch();
    if (!userId || sessionData.session()?.token !== token || sessionData.session()?.role !== role) return false;
    let identity = null;
    try { identity = await fingerprint(JSON.stringify([userId, role, backend(), token])); } catch {}
    if (!sessionData.current(ticket) || sessionData.session()?.token !== token) return false;
    // Storage/crypto restrictions degrade to the existing memory cache.
    scope = identity || "memory-only"; epoch = ticket;
    if (!identity) { remove(); return true; }
    restoring = true;
    try {
      const raw = store()?.getItem(TAB_PAGE_CACHE_KEY);
      if (raw && raw.length <= MAX_CHARS) {
        const saved = JSON.parse(raw);
        const age = now() - saved.savedAt;
        if ([1, 2].includes(saved.version) && saved.scope === scope && age >= 0 && age < TAB_PAGE_CACHE_MAX_AGE_MS && Array.isArray(saved.entries)) {
          const decoded = saved.entries.slice(-160).map(item => {
            if (saved.version === 1) return item;
            if (!Array.isArray(item) || item.length !== 2) return null;
            const [key, record] = item;
            if (!cachedPagePath(key) || typeof record?.data !== "string") return null;
            try {
              const json = LZString.decompressFromUTF16(record.data);
              if (!json || json.length > MAX_DECODED_PAGE_CHARS) return null;
              const payload = JSON.parse(json);
              if (!payload || typeof payload !== "object") return null;
              encodedPayloads.set(payload, record.data);
              return [key, { at: record.at, data: key.startsWith("query-snapshot:") ? { data: payload, checkedAt: record.checkedAt } : payload }];
            } catch { return null; }
          });
          const entries = decoded.filter(item => {
            if (!Array.isArray(item) || item.length !== 2) return false;
            const [key, entry] = item;
            if (!cachedPagePath(key) || !entry?.data || !Number.isFinite(entry.at)) return false;
            const age = now() - entry.at;
            if (age < 0 || age >= TAB_PAGE_CACHE_MAX_AGE_MS) return false;
            if (key.startsWith("query-snapshot:")) return usableQuerySnapshot(entry.data, now());
            return !entry.data.forecast || usableQuerySnapshot({ data: entry.data, checkedAt: entry.at }, now());
          });
          const keys = new Set(entries.map(([key]) => key));
          for (const [key, entry] of [...entries]) {
            const path = cachedPagePath(key);
            if (key === querySnapshotKey(path) && !keys.has(`api:${path}`)) {
              entries.push([`api:${path}`, { data: entry.data.data, at: entry.at }]);
            }
          }
          sessionData.restorePageEntries(entries);
        }
      }
    } catch { /* Corrupt or unavailable tab storage must not block sign-in. */ }
    finally { restoring = false; }
    flush();
    return true;
  };
  return { restore, verified, flush, clear, dispose: () => { clearTimeout(timer); unsubscribe(); } };
}
