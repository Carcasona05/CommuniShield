import AsyncStorage from "@react-native-async-storage/async-storage";
import { clearDataCache, hydrateCache, prefetchAllData } from "./dataStore";
import { sessionData } from "./sessionData";
import apiClient from "./apiClient";
import { persistentPageCache } from "./persistentPageCache";

export const TOKEN_KEY = "access_token";
export const ROLE_KEY = "user_role";
export const ADMIN_INFO_KEY = "admin_info";
let authWrites = Promise.resolve();
let validatedSession = null;
const writeAuth = (action) => {
  const next = authWrites.then(action);
  authWrites = next.catch(() => {});
  return next;
};

export const saveAuth = async ({ token, role, userId }) => {
  const resume = sessionData.pause();
  // Called only by the completed device-verification/trusted-device flow.
  // Fence old requests before waiting on asynchronous credential writes.
  if (token && role) sessionData.begin(token, role);
  try {
    await writeAuth(async () => {
      const ops = [];
      if (token) ops.push(AsyncStorage.setItem(TOKEN_KEY, token));
      if (role) ops.push(AsyncStorage.setItem(ROLE_KEY, role));
      if (ops.length) await Promise.all(ops);
    });
  } finally { resume(); }
  if (userId && sessionData.session()?.token === token && sessionData.session()?.role === role) {
    const epoch = sessionData.epoch();
    await persistentPageCache.activate({ userId, role, apiUrl: apiClient.defaults.baseURL });
    if (sessionData.current(epoch)) validatedSession = { token, role, epoch, at: Date.now() };
  }
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

let restoring = null;
// Reloads/deep links must validate the saved API session before role preloading.
export const restoreAuth = () => {
  if (restoring?.epoch === sessionData.epoch()) return restoring.promise;
  const epoch = sessionData.epoch();
  const promise = (async () => {
    await hydrateCache();
    const auth = await getAuth();
    if (!sessionData.current(epoch) || !auth.token || !auth.role) return null;
    if (validatedSession?.token === auth.token && validatedSession.role === auth.role &&
      sessionData.current(validatedSession.epoch) && Date.now() - validatedSession.at < 8000) return auth;
    sessionData.begin(auth.token, auth.role);
    const ticket = sessionData.epoch();
    if (restoring?.promise === promise) restoring.epoch = ticket;
    const { data } = await apiClient.get("/session", {
      headers: { Authorization: `Bearer ${auth.token}` }, cacheMode: "network", timeout: 10000,
    });
    if (!sessionData.current(ticket)) return null;
    if (!["user", "admin", "super_admin"].includes(data.role)) throw new Error("Invalid account role.");
    const saving = saveAuth({ token: auth.token, role: data.role, userId: data.userId });
    const savedEpoch = sessionData.epoch();
    await saving;
    if (!sessionData.current(savedEpoch)) return null;
    void prefetchAllData();
    return { ...auth, role: data.role };
  })().finally(() => { if (restoring?.promise === promise) restoring = null; });
  restoring = { epoch, promise };
  return promise;
};

export const clearAuth = async () => {
  const resume = sessionData.pause();
  validatedSession = null;
  clearDataCache();
  globalThis.adminAccount = null;
  try {
    await writeAuth(() => AsyncStorage.multiRemove([TOKEN_KEY, ROLE_KEY, ADMIN_INFO_KEY]));
  } catch (error) {
    console.warn("Failed to clear auth:", error);
  } finally { resume(); }
};
