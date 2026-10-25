import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import { apiRequest } from "./apiClient";
import { prefetchPlan, sessionData } from "./sessionData";
import { querySnapshotKey, usableQuerySnapshot } from "./querySnapshots";

const CACHE_KEY = "communishield_data_cache";
// Keep the existing page-cache API, but never hydrate unscoped data left by a
// previous account. Private page data now lives only in session-scoped memory.
export const setCache = (key, value) => sessionData.set(key, value);
export const getCache = (key) => sessionData.get(key);
export const getCachedPage = (endpoint, params = {}) => {
  const snapshot = getCache(querySnapshotKey(endpoint, params));
  return usableQuerySnapshot(snapshot) ? snapshot.data : undefined;
};
export const hydrateCache = async () => {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(CACHE_KEY);
    await AsyncStorage.removeItem(CACHE_KEY);
  } catch {}
};
export const clearDataCache = () => {
  sessionData.reset();
  void hydrateCache();
};

const REPORT_CACHE_KEYS = ["api:/reports", "api:/reports/mine"];

export const patchCachedReports = (id, patch) => {
  REPORT_CACHE_KEYS.forEach((key) => {
    const cached = getCache(key);
    if (!cached || !Array.isArray(cached.reports)) return;
    setCache(key, {
      ...cached,
      reports: cached.reports.map((r) => (r.id === id ? patch(r) : r)),
    });
  });
};

export const removeCachedReport = (id) => {
  REPORT_CACHE_KEYS.forEach((key) => {
    const cached = getCache(key);
    if (!cached || !Array.isArray(cached.reports)) return;
    setCache(key, {
      ...cached,
      reports: cached.reports.filter((r) => r.id !== id),
    });
  });
};

export const clearProfileCache = () => {
  setCache("api:/profile", undefined);
};

export const toReportCode = (id) => {
  const raw = String(id || "").replace(/-/g, "");
  if (!raw) return "";

  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }

  return String(hash % 100000000).padStart(8, "0");
};

export const hashReportIdsInText = (text) => {
  if (!text) return "";
  return text.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    (uuid) => toReportCode(uuid)
  );
};

export const authHeaders = async () => {
  const token = await AsyncStorage.getItem("access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const DEFAULT_FACILITY_ANCHOR = { lat: 9.8816, lng: 123.5953 };

let prefetch = null;
let stopRefresh = null;

const startBackgroundRefresh = () => {
  if (stopRefresh) return;
  const active = () => AppState.currentState !== "background" && AppState.currentState !== "inactive" &&
    (typeof document === "undefined" || document.visibilityState !== "hidden");
  const refresh = () => { if (sessionData.session() && active()) void prefetchAllData(); };
  const timer = setInterval(refresh, 60000);
  const sub = AppState.addEventListener("change", state => { if (state === "active") refresh(); });
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", refresh);
  stopRefresh = () => {
    clearInterval(timer); sub.remove();
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", refresh);
    stopRefresh = null;
  };
};

sessionData.subscribe(event => {
  if (event.type === "session") stopRefresh?.();
  if (event.type === "invalidate") {
    const epoch = sessionData.epoch();
    // Let explicit page mutation reloads win; they share the same GET transport.
    setTimeout(() => {
      if (!sessionData.current(epoch) || !stopRefresh) return;
      const previous = prefetch?.promise || Promise.resolve();
      void previous.finally(() => { if (sessionData.current(epoch) && stopRefresh) void prefetchAllData(); });
    }, 300);
  }
});

export const prefetchAllData = () => {
  const session = sessionData.session();
  const epoch = sessionData.epoch();
  if (!session) return Promise.resolve();
  startBackgroundRefresh();
  if (prefetch?.epoch === epoch) return prefetch.promise;
  const promise = (async () => {
    const plan = prefetchPlan(session.role).map(url => ({ url }));
    // Match the default filter-specific snapshots consumed by these pages.
    for (const request of plan) {
      if (request.url === "/admin/clusters") request.params = { period: "30d" };
    }
    if (session.role !== "user") plan.push(
      { url: "/admin/dashboard", params: { source: "Admin" } },
      { url: "/admin/announcements", params: { source: "Admin" } },
    );
    if (session.role === "user") plan.push({ url: "/facilities/nearby", params: {
      lat: DEFAULT_FACILITY_ANCHOR.lat, lng: DEFAULT_FACILITY_ANCHOR.lng, radius: 8000,
    } });
    let cursor = 0;
    // Three independent consumers keep the landing page first without a slow
    // analytics request blocking every subsequent preload batch.
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (sessionData.current(epoch) && cursor < plan.length) {
        const request = plan[cursor++];
        try {
          await apiRequest({ ...request, method: "GET", timeout: request.url === "/admin/overview" ? 10000 : 20000,
            headers: { Authorization: `Bearer ${session.token}` } }, 0);
        } catch (error) {
          if (!sessionData.current(epoch) || [401, 403].includes(error.response?.status)) return;
          // One failed optional preload must not block navigation or other pages.
        }
      }
    }));
  })().finally(() => { if (prefetch?.epoch === epoch) prefetch = null; });
  prefetch = { epoch, promise };
  return promise;
};
