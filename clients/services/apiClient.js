import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";


const BASE_URL =
  Platform.OS === "web"
    ? process.env.EXPO_PUBLIC_API_URL
    : "https://communishield-server.vercel.app/api";

const DISABLED_KEY = "disabled_reason";

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

export default apiClient;
