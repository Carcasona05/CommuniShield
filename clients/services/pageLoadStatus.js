import { isPageRequest, pageRequestKey, sessionData } from "./sessionData";

const failures = new Map();
const listeners = new Set();
const emit = () => { const value = [...failures.values()]; for (const listener of listeners) listener(value); };
export const getPageFailures = () => [...failures.values()];
export const subscribePageFailures = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export function recordPageFailure(config, error) {
  if (!isPageRequest(config) || config.background || error.code === "ERR_CANCELED" || error.__CANCEL__ ||
    error.response?.status === 401 || !config.sessionToken || config.sessionToken !== sessionData.session()?.token || !sessionData.current(config.sessionEpoch)) return;
  failures.set(pageRequestKey(config), { url: config.url, params: config.params,
    message: error.response?.status === 403 ? "You do not have access to some requested page data." : "Some page data could not be loaded. Please check your connection and retry." });
  if (failures.size > 8) failures.delete(failures.keys().next().value);
  emit();
}
export function clearPageFailure(config) {
  if (config && failures.delete(pageRequestKey(config))) emit();
}
sessionData.subscribe(event => { if (event.type === "session") { failures.clear(); emit(); } });
