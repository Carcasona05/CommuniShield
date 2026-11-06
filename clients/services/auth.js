import AsyncStorage from "@react-native-async-storage/async-storage";
import { clearDataCache, hydrateCache, prefetchAllData } from "./dataStore";
import { sessionData } from "./sessionData";
import apiClient from "./apiClient";

export const TOKEN_KEY = "access_token";
export const ROLE_KEY = "user_role";
export const ADMIN_INFO_KEY = "admin_info";

let authQueue = Promise.resolve();
const transition = (operation) => {
  const resume = sessionData.pause();
  clearDataCache();
  globalThis.adminAccount = null;
  const pending = authQueue.catch(() => {}).then(operation).finally(resume);
  authQueue = pending;
  return pending;
};

export const saveAuth = ({ token, role }) => transition(async () => {
  if (!token || !["user", "admin", "super_admin"].includes(role)) throw new Error("Invalid sign-in session.");
  await AsyncStorage.multiRemove([TOKEN_KEY, ROLE_KEY, ADMIN_INFO_KEY, "disabled_reason"]);
  try { await AsyncStorage.multiSet([[TOKEN_KEY, token], [ROLE_KEY, role]]); }
  catch (error) {
    await AsyncStorage.multiRemove([TOKEN_KEY, ROLE_KEY]).catch(() => {});
    throw error;
  }
  sessionData.begin(token, role);
});

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

let restoringAuth = null;
const restoreVerifiedAuth = async () => {
  await hydrateCache();
  const { token, role } = await getAuth();
  if (!token) {
    await hydrateCache({ clear: true });
    return null;
  }
  try {
    const { data } = await apiClient.get("/session", { headers: { Authorization: `Bearer ${token}` }, cacheMode: "network", timeout: 20000 });
    if (sessionData.changing() || token !== await AsyncStorage.getItem(TOKEN_KEY)) return null;
    if (!data?.userId || !["user", "admin", "super_admin"].includes(data.role)) throw new Error("Could not verify your signed-in account.");
    if (role !== data.role) await AsyncStorage.setItem(ROLE_KEY, data.role);
    sessionData.begin(token, data.role);
    const epoch = sessionData.epoch();
    await hydrateCache({ token, role: data.role, userId: data.userId });
    if (!sessionData.current(epoch) || token !== await AsyncStorage.getItem(TOKEN_KEY)) return null;
    void prefetchAllData();
    return { token, role: data.role, userId: data.userId };
  } catch (error) {
    if ([401, 403].includes(error.response?.status)) {
      if (token === await AsyncStorage.getItem(TOKEN_KEY)) await clearAuth();
      return null;
    }
    if (error.code === "ERR_CANCELED") return null;
    throw error;
  }
};

export const restoreAuth = () => {
  if (restoringAuth) return restoringAuth;
  const pending = restoreVerifiedAuth().finally(() => { if (restoringAuth === pending) restoringAuth = null; });
  restoringAuth = pending;
  return pending;
};

export const clearAuth = () => transition(async () => {
  await AsyncStorage.multiRemove([TOKEN_KEY, ROLE_KEY, ADMIN_INFO_KEY, "disabled_reason"]);
});
