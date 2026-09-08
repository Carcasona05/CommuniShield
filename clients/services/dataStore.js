import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import apiClient from "./apiClient";
import { ROLE_KEY } from "./auth";

const CACHE_KEY = "communishield_data_cache";
const cache = new Map();
let persistTimer = null;
let hydrated = false;

const persistCache = () => {
  if (persistTimer) return;
  persistTimer = setTimeout(async () => {
    persistTimer = null;
    try {
      const obj = {};
      cache.forEach((v, k) => { obj[k] = v; });
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(obj));
    } catch {}
  }, 500);
};

export const setCache = (key, value) => {
  cache.set(key, value);
  persistCache();
};

export const getCache = (key) => {
  if (!hydrated) return undefined;
  return cache.has(key) ? cache.get(key) : undefined;
};

export const hydrateCache = async () => {
  if (hydrated) return;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      Object.entries(obj).forEach(([k, v]) => cache.set(k, v));
    }
  } catch {}
  hydrated = true;
};

export const clearDataCache = () => {
  cache.clear();
  hydrated = false;
  AsyncStorage.removeItem(CACHE_KEY).catch(() => {});
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
];

const fetchIntoCache = async (key, url, headers) => {
  const res = await apiClient.get(url, { headers });
  setCache(key, res.data ?? {});
};

export const prefetchAllData = async () => {
  const token = await AsyncStorage.getItem("access_token");
  if (!token) return;
  const headers = { Authorization: `Bearer ${token}` };

  await Promise.allSettled(
    ENDPOINTS.map(async ([key, url]) => fetchIntoCache(key, url, headers))
  );

  try {
    const res = await apiClient.get("/facilities/nearby", {
      params: {
        lat: DEFAULT_FACILITY_ANCHOR.lat,
        lng: DEFAULT_FACILITY_ANCHOR.lng,
        radius: 8000,
      },
      headers,
      timeout: 20000,
    });
    setCache("api:/facilities/nearby", res.data ?? {});
  } catch {}

  const role = await AsyncStorage.getItem(ROLE_KEY);
  if (role === "admin" || role === "super_admin") {
    await Promise.allSettled(
      ADMIN_ENDPOINTS.map(async ([key, url]) => fetchIntoCache(key, url, headers))
    );
  }

  prefetchReportImages();
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
