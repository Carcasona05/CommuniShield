import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, Platform } from "react-native";
import apiClient, { apiRequest } from "./apiClient";
import { prefetchPlan, sessionData } from "./sessionData";
import { querySnapshotKey, usableQuerySnapshot } from "./querySnapshots";
import { createBrowserPageCache } from "./browserPageCache";

const CACHE_KEY = "communishield_data_cache";
const isWeb = Platform.OS === "web";
// The transport, preloader and pages must use the same account-scoped cache.
// Browser reloads may restore a tab-scoped snapshot, only after server auth.
const tabPageCache = isWeb ? createBrowserPageCache({
  sessionData, storage: () => globalThis.sessionStorage, backend: () => apiClient.defaults.baseURL,
}) : null;
export const isBrowserCacheVerified = () => !isWeb || Boolean(tabPageCache?.verified());
if (isWeb && typeof window !== "undefined") {
  window.addEventListener("pagehide", () => tabPageCache.flush());
  window.addEventListener("storage", event => {
    if (event.key === null || ["access_token", "user_role"].includes(event.key)) {
      tabPageCache.clear();
      sessionData.reset("credentials-changed");
    }
  });
}
export const setCache = (key, value) => sessionData.set(key, value);
export const getCache = (key) => sessionData.get(key);

export const getCachedPage = (endpoint, params = {}) => {
  const snapshot = sessionData.get(querySnapshotKey(endpoint, params));
  return usableQuerySnapshot(snapshot) ? snapshot.data : undefined;
};

export const hydrateCache = async (verifiedSession) => {
  if (isWeb && typeof localStorage !== "undefined") {
    try { localStorage.removeItem(CACHE_KEY); } catch {}
  }
  await AsyncStorage.removeItem(CACHE_KEY).catch(() => {});
  if (verifiedSession?.clear) tabPageCache?.clear();
  else if (verifiedSession) await tabPageCache?.restore(verifiedSession);
};

export const clearDataCache = () => {
  tabPageCache?.clear();
  sessionData.reset("logout");
  void hydrateCache();
};

const REPORT_CACHE_KEYS = ["api:/reports", "api:/reports/mine"];

export const patchCachedReports = (id, patch) => {
  sessionData.patchReports(id, patch);
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
const active = () => AppState.currentState !== "background" && AppState.currentState !== "inactive" &&
  (typeof document === "undefined" || document.visibilityState !== "hidden");
const yieldToPage = () => new Promise(resolve => setTimeout(resolve, 750));

const startBackgroundRefresh = () => {
  if (stopRefresh) return;
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
  // Do not launch another full wave after each write/realtime notification.
  // The active page reloads affected data; the next idle sweep warms the rest.
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
      if (request.url === "/admin/overview" && session.role === "super_admin") {
        const day = new Date();
        request.params = { dayStart: new Date(day.getFullYear(), day.getMonth(), day.getDate()).toISOString(),
          dayEnd: new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).toISOString() };
      }
      if (request.url === "/reports") request.params = { period: "24h" };
      if (request.url === "/admin/risk-outlook") request.params = { view: "current" };
      if (request.url === "/admin/clusters") request.params = { period: "30d" };
      if (request.url === "/sentiment/datasets") request.params = { status: "all", page: 1 };
      if (request.url === "/sentiment/supporting-models") request.params = { page: 1 };
    }
    if (session.role === "user") plan.push({ url: "/facilities/nearby", params: {
      lat: DEFAULT_FACILITY_ANCHOR.lat, lng: DEFAULT_FACILITY_ANCHOR.lng, radius: 8000,
    } });
    let cursor = 0;
    // One optional request at a time, with breathing room for rendering and
    // visible-page loads. Navigation can join an identical in-flight request.
    while (sessionData.current(epoch) && cursor < plan.length) {
      const request = plan[cursor];
      if (sessionData.fresh(request)) { cursor++; continue; }
      await yieldToPage();
      if (!sessionData.current(epoch) || !active()) return;
      if (sessionData.foregroundBusy() || sessionData.changing()) continue;
      cursor++;
      // A page may have loaded this request while the worker was yielding.
      if (sessionData.fresh(request)) continue;
      try {
        await apiRequest({ ...request, method: "GET", timeout: request.url === "/admin/overview" ? 10000 : 20000,
          background: true,
          headers: { Authorization: `Bearer ${session.token}` } }, 0);
      } catch (error) {
        if (!sessionData.current(epoch) || [401, 403].includes(error.response?.status)) return;
        // One failed optional preload must not block navigation or other pages.
      }
    }
  })().finally(() => { if (prefetch?.epoch === epoch) prefetch = null; });
  prefetch = { epoch, promise };
  return promise;
};
