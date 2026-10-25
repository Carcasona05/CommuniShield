import { querySnapshotKey } from "./querySnapshots.js";

// Only page data is cached. Auth challenges, exports and arbitrary GETs are not.
const PAGE_PATHS = new Set([
  "/profile", "/profile/notification-preferences", "/terms/status",
  "/reports", "/reports/mine", "/admin/posts", "/incidents/options",
  "/notifications", "/notifications/login-activity", "/facilities/nearby",
  "/admin/overview", "/admin/dashboard", "/admin/analytics", "/admin/logs", "/admin/notifications",
  "/admin/accounts", "/admin/settings", "/admin/announcements", "/admin/blotters",
  "/admin/clusters", "/admin/risk-outlook", "/sentiment/datasets",
  "/sentiment/training", "/sentiment/supporting-models",
]);
export const PAGE_FRESH_MS = 8000;
export const PAGE_RETAIN_MS = 5 * 60 * 1000;

export function requestPath(url = "") {
  return url.split("?")[0].replace(/\/$/, "") || "/";
}

export function pageRequestKey(config) {
  // Keep URL queries distinct too; params order must not create duplicate reads.
  return `${config.url}:${JSON.stringify(Object.entries(config.params || {})
    .filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b)))}`;
}

export function prefetchPlan(role) {
  if (!["user", "admin", "super_admin"].includes(role)) return [];
  const common = ["/profile", "/incidents/options"];
  if (role === "user") return ["/reports", ...common,
    "/reports/mine", "/notifications", "/notifications/login-activity", "/profile/notification-preferences"];
  return ["/admin/overview", "/admin/dashboard", ...common, "/admin/notifications",
    ...(role === "super_admin" ? ["/admin/accounts"] : []),
    "/admin/analytics", "/admin/logs", "/admin/settings", "/admin/announcements",
    "/admin/blotters", "/admin/clusters", "/admin/risk-outlook",
    ...(role === "super_admin" ? ["/sentiment/datasets", "/sentiment/training", "/sentiment/supporting-models"] : [])];
}

// Sensitive page data/tokens stay in memory. A separate allowlisted preview cache
// may persist non-personal counts after authoritative session verification.
// Production uses the singleton; the factory permits deterministic transport tests.
export function createSessionData({ now = () => Date.now() } = {}) {
  let session = null;
  let epoch = 0;
  let revision = 0;
  let transitions = 0;
  const values = new Map();
  const responses = new Map();
  const pending = new Map();
  const listeners = new Set();
  const notify = (event) => { for (const listener of listeners) listener(event); };
  const cancel = () => { for (const item of pending.values()) item.controller.abort(); pending.clear(); };
  const current = (ticket) => ticket === epoch;
  const expired = (entry) => !entry || now() < entry.at || now() - entry.at >= PAGE_RETAIN_MS;
  const set = (key, data, at = now()) => {
    if (!session) return;
    if (data === undefined) values.delete(key);
    else {
      if (!values.has(key) && values.size >= 160) values.delete(values.keys().next().value);
      values.set(key, { data, at });
    }
  };
  const get = (key) => {
    if (!session) return undefined;
    const entry = values.get(key);
    if (expired(entry)) { values.delete(key); return undefined; }
    return entry.data;
  };
  const reset = (reason = "logout") => {
    const hadSession = Boolean(session);
    epoch++; revision++; session = null;
    cancel(); values.clear(); responses.clear();
    notify({ type: "session", reason, hadSession });
  };
  const begin = (token, role) => {
    if (session?.token === token && session.role === role) return epoch;
    reset("begin");
    if (token && ["user", "admin", "super_admin"].includes(role)) session = { token, role };
    return epoch;
  };
  const invalidate = () => {
    revision++; cancel(); responses.clear(); values.clear();
    notify({ type: "invalidate" });
  };
  const denied = (path) => {
    for (const key of responses.keys()) if (key.startsWith(`${path}:`)) responses.delete(key);
    values.delete(`api:${path}`);
    for (const key of values.keys()) if (key.startsWith(`query-snapshot:${path}:`)) values.delete(key);
    values.delete(`preview:${path}`);
    notify({ type: "denied", path });
  };
  const publish = (config, response) => {
    let data = response.data;
    if (typeof data === "string") {
      try { data = JSON.parse(data); } catch { return; }
    }
    if (!data || typeof data !== "object") return;
    const path = requestPath(config.url);
    if (!config.url.includes("?") && !Object.values(config.params || {}).some(value => value !== undefined)) set(`api:${path}`, data);
    set(querySnapshotKey(path, config.params), { data, checkedAt: now() });
    if (!Object.values(config.params || {}).some(value => value !== undefined)) {
      values.delete(`preview:${path}`);
      notify({ type: "page", path, data, checkedAt: now() });
    }
  };
  const sessionError = () => Object.assign(new Error("The signed-in session changed."), { code: "ERR_CANCELED", __CANCEL__: true });
  const run = async (config, transport) => {
    const ticket = config.sessionEpoch;
    const authenticated = Boolean(config.sessionToken);
    if (authenticated && (!current(ticket) || session?.token !== config.sessionToken)) throw sessionError();
    const path = requestPath(config.url);
    if (authenticated && /^\/admin\/accounts(?:\/|$)/.test(path) && session.role !== "super_admin") {
      throw Object.assign(new Error("Only super admin can view admin accounts"), {
        response: { status: 403, data: { error: "Only super admin can view admin accounts" } }, config,
      });
    }
    const method = (config.method || "get").toLowerCase();
    const cacheable = authenticated && method === "get" && PAGE_PATHS.has(path) && !config.url.includes("?") &&
      !config.responseType && !config.signal && !config.cancelToken;
    const version = revision;
    const key = pageRequestKey(config);
    if (cacheable) {
      const cached = responses.get(key);
      if (config.cacheMode !== "network" && cached && now() >= cached.at && now() - cached.at < PAGE_FRESH_MS &&
        new Date(cached.at).toISOString().slice(0, 10) === new Date(now()).toISOString().slice(0, 10)) {
        return { ...cached.response, config };
      }
      if (pending.has(key)) return pending.get(key).promise.then(response => ({ ...response, config }));
    }
    const controller = new AbortController();
    const liveConfig = cacheable ? { ...config, signal: controller.signal } : config;
    const promise = Promise.resolve().then(async () => {
      try {
        const response = await transport(liveConfig);
        if (authenticated && (!current(ticket) || session?.token !== config.sessionToken || (method === "get" && version !== revision))) throw sessionError();
        if (authenticated && method !== "get" && method !== "head" && method !== "options") invalidate();
        if (cacheable) {
          // Bound memory when filters change frequently. Sensitive data stays in RAM.
          if (responses.size >= 64) responses.delete(responses.keys().next().value);
          responses.set(key, { response, at: now() });
          publish(config, response);
        }
        return { ...response, config };
      } catch (error) {
        if (authenticated && (!current(ticket) || (method === "get" && version !== revision))) throw sessionError();
        if ([401, 403].includes(error.response?.status)) denied(path);
        throw error;
      } finally {
        if (pending.get(key)?.promise === promise) pending.delete(key);
      }
    });
    if (cacheable) pending.set(key, { promise, controller });
    return promise;
  };
  return { begin, reset, invalidate, current, get, set, run,
    changing: () => transitions > 0,
    pause() { transitions++; return () => { transitions--; }; },
    epoch: () => epoch, session: () => session,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } };
}

export const sessionData = createSessionData();
