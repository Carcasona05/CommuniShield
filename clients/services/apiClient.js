import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

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
  baseURL: BASE_URL,
  timeout: 180000,
  headers: {
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.request.use(async (config) => {
  if (!config.headers.Authorization) {
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {}
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const message = error.response?.data?.error || "";

    if (status === 403 && /disabled/i.test(message)) {
      try {
        await AsyncStorage.setItem(DISABLED_KEY, message);
      } catch {}
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
        !status ||
        status === 429 ||
        status === 502 ||
        status === 503 ||
        status === 504 ||
        error.code === "ECONNABORTED" ||
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
