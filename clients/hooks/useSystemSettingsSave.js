import { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import apiClient from "../services/apiClient";
import { getCache, setCache } from "../services/dataStore";
import { sessionData } from "../services/sessionData";
import { createSystemSettingsSave } from "../services/systemSettingsSave";

export default function useSystemSettingsSave(toast) {
  const mounted = useRef(true), epoch = useRef(sessionData.epoch()), toastRef = useRef(toast);
  toastRef.current = toast;
  const controller = useRef(null);
  if (!controller.current) controller.current = createSystemSettingsSave({
    initialSettings: getCache("api:/admin/settings")?.settings,
    active: () => mounted.current && sessionData.current(epoch.current),
    async persist(key, value) {
      const token = await AsyncStorage.getItem("access_token");
      if (!token || !sessionData.current(epoch.current)) throw new Error("Please sign in again to save settings.");
      await apiClient.put("/admin/settings", { settings: { [key]: value } }, { headers: { Authorization: `Bearer ${token}` } });
    },
    onCommit(_key, _value, confirmed) {
      const cached = getCache("api:/admin/settings") || {};
      setCache("api:/admin/settings", { ...cached, settings: { ...cached.settings, ...confirmed } });
      toastRef.current.success("Setting saved.");
    },
    onError(error) { toastRef.current.error(error?.response?.data?.error || error.message || "Could not save setting."); },
  });
  const [state, setState] = useState(() => controller.current.snapshot());
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = controller.current.subscribe(setState);
    return () => { mounted.current = false; unsubscribe(); };
  }, []);
  return { ...state, saveSetting: controller.current.save, hydrateSettings: controller.current.hydrate, settingsRevision: controller.current.revision };
}
