import AsyncStorage from "@react-native-async-storage/async-storage";
import { clearDataCache } from "./dataStore";

export const TOKEN_KEY = "access_token";
export const ROLE_KEY = "user_role";
export const ADMIN_INFO_KEY = "admin_info";

export const saveAuth = async ({ token, role }) => {
  const ops = [];
  if (token) ops.push(AsyncStorage.setItem(TOKEN_KEY, token));
  if (role) ops.push(AsyncStorage.setItem(ROLE_KEY, role));
  if (ops.length) await Promise.all(ops);
};

export const saveAdminInfo = async (info) => {
  if (!info) return;
  globalThis.adminAccount = info;
  try {
    await AsyncStorage.setItem(ADMIN_INFO_KEY, JSON.stringify(info));
  } catch (error) {
    console.warn("Failed to store admin info:", error);
  }
};

export const getAuth = async () => {
  try {
    const [token, role, adminInfoRaw] = await Promise.all([
      AsyncStorage.getItem(TOKEN_KEY),
      AsyncStorage.getItem(ROLE_KEY),
      AsyncStorage.getItem(ADMIN_INFO_KEY),
    ]);

    let adminInfo = null;
    if (adminInfoRaw) {
      try {
        adminInfo = JSON.parse(adminInfoRaw);
      } catch {
        adminInfo = null;
      }
    }

    if (adminInfo) globalThis.adminAccount = adminInfo;

    return { token, role, adminInfo };
  } catch {
    return { token: null, role: null, adminInfo: null };
  }
};

export const clearAuth = async () => {
  try {
    await AsyncStorage.multiRemove([TOKEN_KEY, ROLE_KEY, ADMIN_INFO_KEY]);
  } catch (error) {
    console.warn("Failed to clear auth:", error);
  }
  globalThis.adminAccount = null;
  clearDataCache();
};
