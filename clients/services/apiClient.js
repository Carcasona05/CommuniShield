import axios from "axios";
import { Platform } from "react-native";
import dotenv from "dotenv";

dotenv.config();

const BASE_URL =
  Platform.OS === "web"
    ? process.env.EXPO_PUBLIC_API_URL
    : "https://communishield-server.vercel.app/api";

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 180000,
  headers: {
    "Content-Type": "application/json",
  },
});
export default apiClient;