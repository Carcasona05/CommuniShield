import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { sessionData } from "./sessionData";

const BASE_URL =  
  Platform.OS === "web"
    ? process.env.EXPO_PUBLIC_API_URL
    : "https://communishield-server.vercel.app/api";

const DISABLED_KEY = "disabled_reason";
const MAX_RETRIES = 3;
const BASE_DELAY = 1000;

export const getDisabledReason = async () => {
  try {
    return await AsyncStorage.getItem(DISABLED_KEY);
  } catch {
    return null;
  }
};

export const clearDisabledReason = async () => {
  try {
    await AsyncStorage.removeItem(DISABLED_KEY);
  } catch {}
};

const apiClient = axios.create({
  // baseURL: BASE_URL,
  baseURL: "http://192.168.1.37:3000/api",
  timeout: 180000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Reuse the session-scoped transport for deduplication, freshness and logout
// fencing. Keep the configured adapter and backend URL unchanged.
const transport = axios.getAdapter(apiClient.defaults.adapter);
apiClient.defaults.adapter = (config) => sessionData.run(config, transport);

apiClient.interceptors.request.use(async (config) => {
  const initialSession = sessionData.session();
  const initialEpoch = sessionData.epoch();
  const cancelled = () => new axios.CanceledError("The signed-in session changed.");
  if (sessionData.changing()) throw cancelled();
  if (!config.headers.Authorization) {
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {}
  }
  const authorization = config.headers.Authorization;
  if (typeof authorization === "string" && authorization.startsWith("Bearer ")) {
    const token = authorization.slice(7);
    const role = initialSession?.token === token ? initialSession.role : await AsyncStorage.getItem("user_role");
    if (sessionData.changing()) throw cancelled();
    const current = sessionData.session();
    // Concurrent initial reads may adopt the same newly restored session, but
    // requests from an old account/role may never attach to a replacement session.
    if (initialEpoch !== sessionData.epoch() && (initialSession || current?.token !== token || current?.role !== role)) throw cancelled();
    if (!current && ["user", "admin", "super_admin"].includes(role)) sessionData.begin(token, role);
    const session = sessionData.session();
    if (session && session.token !== token) throw cancelled();
    if (session?.token === token) {
      config.sessionToken = token;
      config.sessionEpoch = sessionData.epoch();
    }
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const message = error.response?.data?.error || "";

    if (status === 403 && /disabled/i.test(message)) {
      if (error.config?.sessionToken && error.config.sessionToken === sessionData.session()?.token && sessionData.current(error.config.sessionEpoch)) {
        sessionData.reset("disabled");
      }
      try {
        await AsyncStorage.setItem(DISABLED_KEY, message);
      } catch {}
    }

    if (status === 401 && error.response?.data?.code === "DEVICE_VERIFICATION_REQUIRED") {
      // Old/password-only sessions must return to sign-in, never bypass the code.
      // Ignore stale requests from a previous session after a new login completes.
      const token = await AsyncStorage.getItem("access_token");
      if (token && error.config?.headers?.Authorization === `Bearer ${token}`) {
        const { clearAuth } = await import("./auth");
        await clearAuth();
        const { router } = await import("expo-router");
        router.replace(Platform.OS === "web" ? "/(auth)/Admin_Login" : "/(auth)/User_Login");
      }
    if (status === 401 && error.response?.data?.code === "DEVICE_VERIFICATION_REQUIRED") {
      // Old/password-only sessions must return to sign-in, never bypass the code.
      // Ignore stale requests from a previous session after a new login completes.
      const token = await AsyncStorage.getItem("access_token");
      if (token && error.config?.headers?.Authorization === `Bearer ${token}`) {
        const { clearAuth } = await import("./auth");
        await clearAuth();
        const { router } = await import("expo-router");
        router.replace(Platform.OS === "web" ? "/(auth)/Admin_Login" : "/(auth)/User_Login");
      }
    }

    return Promise.reject(error);
  }
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const apiRequest = async (config, retries = MAX_RETRIES) => {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await apiClient(config);
    } catch (error) {
      lastError = error;
      if (axios.isCancel(error)) break;
      const status = error.response?.status;
      const isRetryable =
        !status ||
        !status ||
        status === 429 ||
        status === 502 ||
        status === 503 ||
        status === 504 ||
        error.code === "ECONNABORTED" ||
        error.code === "ERR_NETWORK";
        error.code === "ERR_NETWORK";

      if (!isRetryable || attempt === retries) break;

      if (status === 429) {
        const retryAfter = error.response?.headers?.["retry-after"];
        const waitMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : BASE_DELAY * Math.pow(2, attempt);
        await sleep(waitMs);
      } else {
        await sleep(BASE_DELAY * Math.pow(2, attempt));
      }
    }
  }
  throw lastError;
};

export default apiClient;
