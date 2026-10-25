import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { createRequire } from "node:module";
import { createSessionData, prefetchPlan } from "../../clients/services/sessionData.js";
import { querySnapshotKey, usableQuerySnapshot } from "../../clients/services/querySnapshots.js";

const require = createRequire(new URL("../../clients/package.json", import.meta.url));
const axios = require("axios");
const text = name => readFileSync(new URL(`../../clients/${name}`, import.meta.url), "utf8");
const source = name => text(name).replace(/^import .*;\r?\n/gm, "").replace(/export const /g, "const ");
const wait = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function storeFixture() {
  const sessionData = createSessionData();
  const calls = [], intervals = new Map(), timeouts = [], storageRemoved = [];
  let transport = async () => ({ data: {} });
  let timer = 0;
  const context = vm.createContext({
    sessionData, prefetchPlan, querySnapshotKey, usableQuerySnapshot,
    AsyncStorage: { removeItem: async key => storageRemoved.push(key) },
    apiRequest: (...args) => { calls.push(args[0]); return transport(...args); },
    AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) },
    setInterval: fn => { intervals.set(++timer, fn); return timer; },
    clearInterval: id => intervals.delete(id),
    setTimeout: fn => { timeouts.push(fn); },
  });
  vm.runInContext(`${source("services/dataStore.js")}\n globalThis.store = { prefetchAllData, hydrateCache, clearDataCache, getCache, setCache };`, context);
  return { sessionData, calls, intervals, timeouts, storageRemoved, store: context.store,
    transport: fn => { transport = fn; } };
}

test("preload does nothing before verified auth, then schedules only allowed role endpoints", async () => {
  for (const role of ["admin", "super_admin", "user"]) {
    const f = storeFixture();
    await f.store.prefetchAllData();
    assert.equal(f.calls.length, 0);
    assert.equal(f.intervals.size, 0);
    f.sessionData.begin("approved-token", role);
    await f.store.prefetchAllData();
    assert.equal(f.calls[0].url, role === "user" ? "/reports" : "/admin/overview");
    assert.equal(f.calls.some(c => c.url === "/admin/accounts"), role === "super_admin");
    assert.ok(f.calls.every(c => c.headers.Authorization === "Bearer approved-token"));
    assert.equal(f.intervals.size, 1);
    await f.store.prefetchAllData();
    assert.equal(f.intervals.size, 1, "navigation must not create extra polling timers");
    f.store.clearDataCache();
    assert.equal(f.intervals.size, 0);
  }
});

test("preload has bounded parallelism, deduplicates startup and stops scheduling on logout", { timeout: 3000 }, async () => {
  const f = storeFixture();
  f.sessionData.begin("a", "admin");
  const gates = [];
  const nextStarted = wait();
  f.transport(() => { const gate = wait(); gates.push(gate); if (gates.length === 4) nextStarted.resolve(); return gate.promise; });
  const first = f.store.prefetchAllData();
  const second = f.store.prefetchAllData();
  assert.equal(first, second);
  assert.equal(f.calls.length, 3);
  gates[1].resolve({ data: {} });
  await nextStarted.promise;
  assert.equal(f.calls.length, 4, "one slow request must not block the entire next batch");
  f.store.clearDataCache();
  gates.forEach(gate => gate.resolve({ data: {} }));
  await first;
  assert.equal(f.calls.length, 4);
  assert.equal(f.intervals.size, 0);
});

test("background polling refreshes while active; cache hydration discards legacy unscoped storage", async () => {
  const f = storeFixture();
  f.sessionData.begin("a", "admin");
  await f.store.prefetchAllData();
  const count = f.calls.length;
  [...f.intervals.values()][0]();
  await f.store.prefetchAllData();
  assert.equal(f.calls.length, count * 2);
  await f.store.hydrateCache();
  assert.ok(f.storageRemoved.includes("communishield_data_cache"));
  assert.equal(f.store.getCache("api:/admin/accounts"), undefined);
});

test("restored sessions validate lightweight session before preloading and use the server role rather than stale local role", async () => {
  const sessionData = createSessionData();
  const stored = new Map([["access_token", "a"], ["user_role", "super_admin"]]);
  const gate = wait();
  let prefetched = 0;
  let activated = 0;
  const context = vm.createContext({
    sessionData, console,
    AsyncStorage: { getItem: async key => stored.get(key), setItem: async (key, value) => stored.set(key, value) },
    hydrateCache: async () => {}, setCache: (key, value) => sessionData.set(key, value),
    clearDataCache: () => sessionData.reset(), prefetchAllData: () => { prefetched++; },
    apiClient: { defaults: { baseURL: "https://api.example/api" }, get: path => { assert.equal(path, "/session"); return gate.promise; } },
    persistentPageCache: { activate: async identity => { assert.equal(identity.userId, "verified-user"); activated++; } },
  });
  vm.runInContext(`${source("services/auth.js")}\n globalThis.auth = { restoreAuth, clearAuth };`, context);
  const restored = context.auth.restoreAuth();
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(prefetched, 0);
  gate.resolve({ data: { userId: "verified-user", role: "admin" } });
  assert.equal((await restored).role, "admin");
  assert.equal(stored.get("user_role"), "admin");
  assert.equal(prefetched, 1);
  assert.equal(activated, 1);
  assert.equal(sessionData.session().role, "admin");
});

test("real Axios transformation and adapter integration share GETs, preserve data shapes and invalidate after writes", async () => {
  const sessionData = createSessionData();
  const storage = new Map([["access_token", "a"], ["user_role", "admin"]]);
  let calls = 0;
  const fakeAxios = Object.assign((...args) => axios(...args), axios, {
    getAdapter: () => async config => {
      calls++;
      return { config, status: 200, statusText: "OK", headers: {}, data: JSON.stringify({ reports: [{ id: "one" }], method: config.method }) };
    },
  });
  const code = source("services/apiClient.js").replace("export default apiClient;", "globalThis.client = apiClient;");
  const context = vm.createContext({
    axios: fakeAxios, sessionData, process: { env: { EXPO_PUBLIC_API_URL: "https://backend.example/api" } },
    AsyncStorage: { getItem: async key => storage.get(key) }, setTimeout, console,
  });
  vm.runInContext(code, context);
  const [a, b] = await Promise.all([context.client.get("/admin/dashboard"), context.client.get("/admin/dashboard")]);
  assert.equal(calls, 1);
  assert.deepEqual(a.data, b.data);
  assert.equal(a.data.reports[0].id, "one");
  await context.client.get("/admin/dashboard");
  assert.equal(calls, 1);
  await context.client.post("/reports/one/status", { status: "Resolved" });
  await context.client.get("/admin/dashboard");
  assert.equal(calls, 3);
  await assert.rejects(context.client.get("/admin/accounts"), error => error.response.status === 403);
  assert.equal(calls, 3);
  const resume = sessionData.pause();
  await assert.rejects(context.client.get("/admin/dashboard"), error => axios.isCancel(error));
  assert.equal(calls, 3, "no protected request can observe partially written credentials");
  resume();
});

test("overlapping logout and sign-in serialize credential storage and keep the new session isolated", async () => {
  const sessionData = createSessionData();
  sessionData.begin("old-token", "super_admin");
  sessionData.set("api:/admin/accounts", { accounts: ["old private data"] });
  const stored = new Map([["access_token", "old-token"], ["user_role", "super_admin"]]);
  const removing = wait();
  const context = vm.createContext({
    sessionData, console,
    AsyncStorage: {
      setItem: async (key, value) => stored.set(key, value),
      multiRemove: async keys => { await removing.promise; keys.forEach(key => stored.delete(key)); },
    },
    clearDataCache: () => sessionData.reset(),
  });
  vm.runInContext(`${source("services/auth.js")}\n globalThis.auth = { saveAuth, clearAuth };`, context);
  const logout = context.auth.clearAuth();
  const login = context.auth.saveAuth({ token: "new-token", role: "admin" });
  assert.equal(sessionData.changing(), true);
  assert.equal(sessionData.get("api:/admin/accounts"), undefined);
  removing.resolve();
  await Promise.all([logout, login]);
  assert.equal(sessionData.changing(), false);
  assert.equal(stored.get("access_token"), "new-token");
  assert.equal(stored.get("user_role"), "admin");
  assert.equal(sessionData.session().token, "new-token");
});

test("regular admin dashboard has no super-admin request and login callbacks run after verification", () => {
  assert.doesNotMatch(text("app/(admin)/Admin_Dashboard.jsx"), /\/admin\/accounts/);
  const login = text("hooks/useDeviceLogin.js");
  assert.match(login, /if \(data\.verification_required\)\s*\{\s*setPending/);
  assert.match(login, /if \(!data\.access_token\) throw[\s\S]*await onAuthenticated\(data\)/);
  for (const path of ["app/(auth)/Admin_Login.jsx", "app/(auth)/User_Login.jsx"]) {
    assert.match(text(path), /useDeviceLogin\(async \(data\) => \{[\s\S]*await saveAuth[\s\S]*prefetchAllData\(\)/);
  }
});
