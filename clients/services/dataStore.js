import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { Image } from "expo-image";
import { apiRequest } from "./apiClient";
import { ROLE_KEY } from "./auth";

const CACHE_KEY = "communishield_data_cache";
const cache = new Map();
let persistTimer = null;

const isWeb = Platform.OS === "web";

const readStorageSync = () => {
  if (isWeb && typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  return null;
};

const writeStorage = (obj) => {
  try {
    const json = JSON.stringify(obj);
    if (isWeb && typeof localStorage !== "undefined") {
      localStorage.setItem(CACHE_KEY, json);
    }
    AsyncStorage.setItem(CACHE_KEY, json).catch(() => {});
  } catch {}
};

const persistCache = () => {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    flushCache();
  }, 300);
};

const flushCache = () => {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  const obj = {};
  cache.forEach((v, k) => {
    obj[k] = v;
  });
  writeStorage(obj);
};

export const setCache = (key, value) => {
  cache.set(key, value);
  persistCache();
};

export const getCache = (key) => (cache.has(key) ? cache.get(key) : undefined);

const hydrateFromStorage = () => {
  const obj = readStorageSync();
  if (obj) {
    Object.entries(obj).forEach(([k, v]) => cache.set(k, v));
  }
};

if (isWeb) {
  hydrateFromStorage();
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", flushCache);
  }
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushCache();
    });
  }
}

export const hydrateCache = async () => {
  if (cache.size > 0) return;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      Object.entries(obj).forEach(([k, v]) => cache.set(k, v));
    }
  } catch {}
};

export const clearDataCache = () => {
  cache.clear();
  if (isWeb && typeof localStorage !== "undefined") {
    localStorage.removeItem(CACHE_KEY);
  }
  AsyncStorage.removeItem(CACHE_KEY).catch(() => {});
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

const ENDPOINTS = [
  ["api:/reports", "/reports"],
  ["api:/admin/posts", "/admin/posts"],
  ["api:/reports/mine", "/reports/mine"],
  ["api:/notifications", "/notifications"],
  ["api:/notifications/login-activity", "/notifications/login-activity"],
  ["api:/profile", "/profile"],
  ["api:/incidents/options", "/incidents/options"],
];

const ADMIN_ENDPOINTS = [
  ["api:/admin/dashboard", "/admin/dashboard"],
  ["api:/admin/analytics", "/admin/analytics"],
  ["api:/admin/logs", "/admin/logs"],
  ["api:/admin/notifications", "/admin/notifications"],
  ["api:/admin/accounts", "/admin/accounts"],
  ["api:/admin/settings", "/admin/settings"],
];

const fetchIntoCache = async (key, url) => {
  const res = await apiRequest({ method: "GET", url });
  setCache(key, res.data ?? {});
};

const BATCH_SIZE = 3;

const fetchBatch = async (batch) => {
  await Promise.allSettled(
    batch.map(async ([key, url]) => fetchIntoCache(key, url))
  );
};

let prefetchInflight = false;

export const prefetchAllData = async () => {
  if (prefetchInflight) return;
  prefetchInflight = true;

  try {
    const token = await AsyncStorage.getItem("access_token");
    if (!token) return;

    for (let i = 0; i < ENDPOINTS.length; i += BATCH_SIZE) {
      await fetchBatch(ENDPOINTS.slice(i, i + BATCH_SIZE));
    }

    try {
      const res = await apiRequest({
        method: "GET",
        url: "/facilities/nearby",
        params: {
          lat: DEFAULT_FACILITY_ANCHOR.lat,
          lng: DEFAULT_FACILITY_ANCHOR.lng,
          radius: 8000,
        },
        timeout: 20000,
      });
      setCache("api:/facilities/nearby", res.data ?? {});
    } catch {}

    const role = await AsyncStorage.getItem(ROLE_KEY);
    if (role === "admin" || role === "super_admin") {
      for (let i = 0; i < ADMIN_ENDPOINTS.length; i += BATCH_SIZE) {
        await fetchBatch(ADMIN_ENDPOINTS.slice(i, i + BATCH_SIZE));
      }
    }

    prefetchReportImages();
  } finally {
    prefetchInflight = false;
  }
};

const prefetchReportImages = () => {
  try {
    const reports = getCache("api:/reports");
    const items = reports?.data || reports || [];
    if (!Array.isArray(items)) return;

    const imageUrls = items
      .slice(0, 6)
      .flatMap((r) => r.images || [])
      .filter(Boolean)
      .slice(0, 10);

    imageUrls.forEach((url) => {
      if (typeof url === "string") {
        Image.prefetch(url).catch(() => {});
      }
    });
  } catch {}
};
