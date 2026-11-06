import { querySnapshotKey, retainUnchangedQueryData } from "./querySnapshots.js";

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
export const PAGE_FRESH_MS = 2 * 60 * 1000;
// Account-state checks use /session, so profile display data need not poll every
// minute. Logout, account switches, explicit refresh and profile edits invalidate it.
export const PROFILE_FRESH_MS = 5 * 60 * 1000;
export const PAGE_RETAIN_MS = 5 * 60 * 1000;

// Invalidate data dependencies, not every page, after a known write. Unknown
// mutations deliberately retain the conservative full-invalidation fallback.
export function mutationInvalidationPaths(path) {
  if (path === "/sentiment/datasets/preview") return [];
  if (/^\/sentiment(?:\/|$)/.test(path)) return ["/sentiment/datasets", "/sentiment/training", "/sentiment/supporting-models"];
  if (/^\/profile(?:\/|$)/.test(path)) return ["/profile", "/profile/notification-preferences"];
  if (/^\/terms(?:\/|$)/.test(path)) return ["/terms/status"];
  if (/^\/notifications(?:\/|$)/.test(path)) return ["/notifications", "/notifications/login-activity"];
  if (/^\/admin\/notifications(?:\/|$)/.test(path)) return ["/admin/notifications"];
  if (/^\/admin\/accounts(?:\/|$)/.test(path)) return ["/admin/accounts", "/admin/overview", "/admin/logs"];
  if (/^\/(?:reports|admin\/(?:reports|posts|announcements)|ai)(?:\/|$)/.test(path)) return [
    "/reports", "/reports/mine", "/admin/posts", "/admin/dashboard", "/admin/overview", "/admin/logs",
    "/admin/analytics", "/admin/announcements", "/admin/clusters", "/admin/risk-outlook",
    "/notifications", "/admin/notifications",
  ];
  return null;
}

export function requestPath(url = "") {
  return url.split("?")[0].replace(/\/$/, "") || "/";
}

export const isPageRequest = config => (config?.method || "get").toLowerCase() === "get" && PAGE_PATHS.has(requestPath(config?.url));

export function cachedPagePath(key) {
  if (typeof key !== "string") return null;
  const path = key.startsWith("api:") ? key.slice(4) : key.match(/^query-snapshot:([^:]+):/)?.[1];
  return PAGE_PATHS.has(path) ? path : null;
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
  return ["/admin/dashboard", ...common, "/admin/notifications",
    ...(role === "super_admin" ? ["/admin/accounts"] : []),
    "/admin/analytics", "/admin/logs", "/admin/settings", "/admin/announcements",
    "/admin/blotters", "/admin/clusters", "/admin/risk-outlook",
    ...(role === "super_admin" ? ["/sentiment/datasets", "/sentiment/training", "/sentiment/supporting-models"] : [])];
}

// Tokens and transport responses stay in memory. On web, browserPageCache may
// restore allowlisted page values from this tab after authoritative verification.
// Production uses the singleton; the factory permits deterministic transport tests.
export function createSessionData({ now = () => Date.now() } = {}) {
  let session = null;
  let epoch = 0;
  let revision = 0;
  let transitions = 0;
  let foregroundRequests = 0;
  const pathRevisions = new Map();
  const values = new Map();
  const responses = new Map();
  const pending = new Map();
  const listeners = new Set();
  const notify = (event) => { for (const listener of listeners) listener(event); };
  const cancel = () => { for (const item of pending.values()) item.controller.abort(); pending.clear(); };
  const current = (ticket) => ticket === epoch;
  // Network freshness may expire without discarding an already loaded page.
  // Private page data stays in bounded RAM, never across accounts or restarts.
  const expired = (entry, key) => !entry || now() < entry.at ||
    (key.startsWith("preview:") && now() - entry.at >= PAGE_RETAIN_MS);
  const set = (key, data, at = now()) => {
    if (!session) return;
    if (data === undefined) {
      values.delete(key);
      if (key === "api:/profile") {
        values.delete(querySnapshotKey("/profile"));
        for (const requestKey of responses.keys()) if (requestKey.startsWith("/profile:")) responses.delete(requestKey);
        for (const [requestKey, item] of pending) if (requestKey.startsWith("/profile:")) {
          item.controller.abort();
          pending.delete(requestKey);
        }
      }
    }
    else {
      if (!values.has(key) && values.size >= 160) values.delete(values.keys().next().value);
      values.set(key, { data, at });
    }
    notify({ type: "cache", key });
  };
  const get = (key) => {
    if (!session) return undefined;
    const entry = values.get(key);
    if (expired(entry, key)) { values.delete(key); return undefined; }
    return entry.data;
  };
  const reset = (reason = "logout") => {
    const hadSession = Boolean(session);
    epoch++; revision++; session = null;
    foregroundRequests = 0;
    cancel(); values.clear(); responses.clear(); pathRevisions.clear();
    notify({ type: "session", reason, hadSession });
  };
  const begin = (token, role) => {
    if (session?.token === token && session.role === role) return epoch;
    reset("begin");
    if (token && ["user", "admin", "super_admin"].includes(role)) session = { token, role };
    if (session && transitions === 0) notify({ type: "ready" });
    return epoch;
  };
  const invalidate = ({ preserveProfile = false, paths = null } = {}) => {
    if (paths) {
      if (paths.length === 0) return;
      const affected = new Set(paths);
      for (const path of affected) pathRevisions.set(path, (pathRevisions.get(path) || 0) + 1);
      for (const [key, item] of pending) if (affected.has(item.path)) {
        item.controller.abort(); pending.delete(key);
      }
      for (const key of responses.keys()) if (paths.some(path => key.startsWith(`${path}:`))) responses.delete(key);
      for (const key of values.keys()) if (paths.some(path => key === `api:${path}` || key === `preview:${path}` || key.startsWith(`query-snapshot:${path}:`))) values.delete(key);
      notify({ type: "invalidate", paths: [...affected] });
      return;
    }
    const profileKeys = ["api:/profile", querySnapshotKey("/profile")];
    const profileValues = preserveProfile ? profileKeys.map(key => [key, values.get(key)]) : [];
    const profileResponses = preserveProfile ? [...responses].filter(([key]) => key.startsWith("/profile:")) : [];
    revision++; cancel(); responses.clear(); values.clear();
    for (const [key, entry] of profileValues) if (entry) values.set(key, entry);
    for (const [key, entry] of profileResponses) responses.set(key, entry);
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
    const snapshotKey = querySnapshotKey(path, config.params);
    data = retainUnchangedQueryData(get(snapshotKey)?.data, data);
    if (!config.url.includes("?") && !Object.values(config.params || {}).some(value => value !== undefined)) set(`api:${path}`, data);
    const snapshot = { data, checkedAt: now() };
    set(snapshotKey, snapshot);
    notify({ type: "snapshot", key: snapshotKey, snapshot });
    if (!Object.values(config.params || {}).some(value => value !== undefined)) {
      values.delete(`preview:${path}`);
      notify({ type: "page", path, data, checkedAt: now() });
    }
    return data;
  };
  const sessionError = () => Object.assign(new Error("The signed-in session changed."), { code: "ERR_CANCELED", __CANCEL__: true });
  const fresh = (config, maxAge = requestPath(config.url) === "/profile" ? PROFILE_FRESH_MS : PAGE_FRESH_MS) => {
    if (!session) return false;
    const cached = responses.get(pageRequestKey(config));
    return Boolean(cached && now() >= cached.at && now() - cached.at < maxAge &&
      new Date(cached.at).toISOString().slice(0, 10) === new Date(now()).toISOString().slice(0, 10));
  };
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
    // Share simultaneous security probes, but never return a cached /session
    // response: disabled-account detection must always reach the backend.
    const shareable = cacheable || (authenticated && method === "get" && path === "/session" &&
      !config.url.includes("?") && !config.responseType && !config.signal && !config.cancelToken);
    const version = revision;
    const pathVersion = pathRevisions.get(path) || 0;
    const stale = () => !current(ticket) || session?.token !== config.sessionToken ||
      (method === "get" && (version !== revision || pathVersion !== (pathRevisions.get(path) || 0)));
    const key = pageRequestKey(config);
    if (shareable) {
      const cached = responses.get(key);
      if (cacheable && config.cacheMode !== "network" && fresh(config)) {
        return { ...cached.response, config };
      }
      if (pending.has(key)) return pending.get(key).promise.then(response => ({ ...response, config }));
    }
    const controller = new AbortController();
    const liveConfig = shareable ? { ...config, signal: controller.signal } : config;
    const foreground = authenticated && !config.background;
    if (foreground) foregroundRequests++;
    const promise = Promise.resolve().then(async () => {
      try {
        if (authenticated && stale()) throw sessionError();
        const response = await transport(liveConfig);
        if (authenticated && (stale() || controller.signal.aborted)) throw sessionError();
        if (authenticated && method !== "get" && method !== "head" && method !== "options") {
          invalidate({ paths: mutationInvalidationPaths(path), preserveProfile: !/^\/profile(?:\/|$)/.test(path) });
        }
        let result = response;
        if (cacheable) {
          // Bound memory when filters change frequently. Sensitive data stays in RAM.
          if (responses.size >= 64) responses.delete(responses.keys().next().value);
          // Decode JSON once. Reusing the raw response string made every cached
          // navigation parse the same large payload again inside Axios.
          const payload = publish(config, response);
          if (payload) result = { ...response, data: payload };
          result = { ...result, cacheCheckedAt: now() };
          responses.set(key, { response: result, at: now() });
        }
        return { ...result, config };
      } catch (error) {
        if (authenticated && stale()) throw sessionError();
        if ([401, 403].includes(error.response?.status)) denied(path);
        throw error;
      } finally {
        if (foreground && current(ticket)) foregroundRequests--;
        if (pending.get(key)?.promise === promise) pending.delete(key);
      }
    });
    if (shareable) pending.set(key, { promise, controller, path });
    return promise;
  };
  return { begin, reset, invalidate, current, get, set, run, fresh,
    pageEntries: () => [...values].filter(([key]) => cachedPagePath(key)),
    restorePageEntries(entries) {
      if (!session || !Array.isArray(entries)) return;
      for (const [key, entry] of entries.slice(-160)) {
        const path = cachedPagePath(key);
        if (!path || !entry?.data || typeof entry.data !== "object" || !Number.isFinite(entry.at) || entry.at > now()) continue;
        if (path === "/admin/accounts" && session.role !== "super_admin") continue;
        if (path.startsWith("/admin/") && session.role === "user") continue;
        if (path.startsWith("/sentiment/") && session.role !== "super_admin") continue;
        set(key, entry.data, entry.at);
      }
    },
    foregroundBusy: () => foregroundRequests > 0,
    changing: () => transitions > 0,
    pause() {
      transitions++;
      let resumed = false;
      return () => {
        if (resumed) return;
        resumed = true;
        transitions--;
        if (transitions === 0 && session) notify({ type: "ready" });
      };
    },
    epoch: () => epoch, session: () => session,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } };
}

export const sessionData = createSessionData();
