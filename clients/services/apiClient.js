/* global __DEV__ */
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { sessionData } from "./sessionData";

const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, "");
const BASE_URL = configuredUrl || (typeof __DEV__ !== "undefined" && __DEV__ ? "http://192.168.1.37:3000/api" : "");
if (!BASE_URL) throw new Error("Set EXPO_PUBLIC_API_URL before building the app.");

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
  baseURL: BASE_URL,
  timeout: 180000,
  headers: {
    "Content-Type": "application/json",
  },
});

// One transport/cache boundary covers existing pages and login prefetch alike.
const transport = axios.getAdapter(apiClient.defaults.adapter);
apiClient.defaults.adapter = (config) => sessionData.run(config, transport);

apiClient.interceptors.request.use(async (config) => {
  if (["/login", "/admin/login", "/login/verify", "/register", "/forgot-password", "/verify-otp", "/reset-password"].includes(config.url)) return config;
  if (sessionData.changing()) throw new axios.CanceledError("Credentials are changing.");
  const epoch = sessionData.epoch();
  const initializing = !sessionData.session();
  const [token, role] = await Promise.all([
    AsyncStorage.getItem("access_token"), AsyncStorage.getItem("user_role"),
  ]);
  const initializedTogether = initializing && sessionData.epoch() === epoch + 1 &&
    sessionData.session()?.token === token && sessionData.session()?.role === role;
  if (sessionData.changing() || (!sessionData.current(epoch) && !initializedTogether)) throw new axios.CanceledError("The signed-in session changed.");
  if ((!token || !role) && config.headers.Authorization) throw new axios.CanceledError("Please sign in again.");
  if (token && role) {
    // Also handles deep links/reloads, which do not visit the login screen.
    const active = sessionData.session();
    if (active && (active.token !== token || active.role !== role)) throw new axios.CanceledError("Credentials are changing.");
    sessionData.begin(token, role);
    const authorization = config.headers.Authorization || `Bearer ${token}`;
    if (authorization !== `Bearer ${token}`) throw new axios.CanceledError("An old session cannot make requests.");
    config.headers.Authorization = authorization;
    config.sessionToken = token;
    config.sessionEpoch = sessionData.epoch();
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    if (response.config.sessionToken && !sessionData.current(response.config.sessionEpoch)) {
      throw new axios.CanceledError("The signed-in session changed.");
    }
    return response;
  },
  async (error) => {
    const status = error.response?.status;
    const message = error.response?.data?.error || "";

    if (status === 403 && /disabled/i.test(message)) {
      try {
        await AsyncStorage.setItem(DISABLED_KEY, message);
      } catch {}
    }

    if (error.config?.sessionToken && (status === 401 || (status === 403 && /disabled/i.test(message)))) {
      const { clearAuth } = await import("./auth");
      if (sessionData.current(error.config.sessionEpoch)) await clearAuth();
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
      const status = error.response?.status;
      const isRetryable =
        !axios.isCancel(error) && (!status ||
        status === 429 ||
        status === 502 ||
        status === 503 ||
        status === 504 ||
        error.code === "ECONNABORTED" ||
        error.code === "ERR_NETWORK");

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
