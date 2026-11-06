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

function storeFixture({ autoTimers = true } = {}) {
  let time = Date.parse("2026-11-03T12:00:00Z");
  const sessionData = createSessionData({ now: () => time });
  const calls = [], intervals = new Map(), timeouts = [], storageRemoved = [];
  let transport = async () => ({ data: {} });
  let timer = 0;
  const context = vm.createContext({
    sessionData, prefetchPlan, querySnapshotKey, usableQuerySnapshot,
    Platform: { OS: "android" },
    AsyncStorage: { removeItem: async key => storageRemoved.push(key) },
    apiRequest: config => sessionData.run({ ...config, sessionToken: sessionData.session()?.token, sessionEpoch: sessionData.epoch() },
      liveConfig => { calls.push(config); return transport(liveConfig); }),
    AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) },
    setInterval: fn => { intervals.set(++timer, fn); return timer; },
    clearInterval: id => intervals.delete(id),
    setTimeout: fn => { timeouts.push(fn); if (autoTimers) queueMicrotask(fn); return timeouts.length; },
  });
  vm.runInContext(`${source("services/dataStore.js")}\n globalThis.store = { prefetchAllData, hydrateCache, clearDataCache, getCache, setCache };`, context);
  return { sessionData, calls, intervals, timeouts, storageRemoved, store: context.store,
    advance: ms => { time += ms; },
    appState: context.AppState,
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
    assert.equal(f.calls[0].url, role === "user" ? "/reports" : "/admin/dashboard");
    assert.equal(f.calls.some(c => c.url === "/admin/accounts"), role === "super_admin");
    assert.ok(f.calls.every(c => c.headers.Authorization === "Bearer approved-token"));
    assert.equal(f.intervals.size, 1);
    await f.store.prefetchAllData();
    assert.equal(f.intervals.size, 1, "navigation must not create extra polling timers");
    f.store.clearDataCache();
    assert.equal(f.intervals.size, 0);
  }
});

test("preload staggers one optional request at a time, deduplicates startup and stops on logout", { timeout: 3000 }, async () => {
  const f = storeFixture();
  f.sessionData.begin("a", "admin");
  const gates = [];
  const firstStarted = wait();
  const nextStarted = wait();
  f.transport(() => { const gate = wait(); gates.push(gate); if (gates.length === 1) firstStarted.resolve(); if (gates.length === 2) nextStarted.resolve(); return gate.promise; });
  const first = f.store.prefetchAllData();
  const second = f.store.prefetchAllData();
  assert.equal(first, second);
  assert.equal(f.calls.length, 0, "give the landing page/rendering a head start");
  await firstStarted.promise;
  assert.equal(f.calls.length, 1);
  gates[0].resolve({ data: {} });
  await nextStarted.promise;
  assert.equal(f.calls.length, 2, "the next optional request waits for the first to finish");
  f.store.clearDataCache();
  gates.forEach(gate => gate.resolve({ data: {} }));
  await first;
  assert.equal(f.calls.length, 2);
  assert.equal(f.intervals.size, 0);
});

test("background sweeps skip fresh data and refresh expired data; hydration discards legacy storage", async () => {
  const f = storeFixture();
  f.sessionData.begin("a", "admin");
  await f.store.prefetchAllData();
  const count = f.calls.length;
  [...f.intervals.values()][0]();
  await f.store.prefetchAllData();
  assert.equal(f.calls.length, count, "do not download already-warm pages again");
  f.advance(5 * 60 * 1000);
  await f.store.prefetchAllData();
  assert.equal(f.calls.length, count * 2);
  await f.store.hydrateCache();
  assert.ok(f.storageRemoved.includes("communishield_data_cache"));
  assert.equal(f.store.getCache("api:/admin/accounts"), undefined);
});

test("background warming yields to foreground requests and pauses while the app is hidden", async () => {
  const f = storeFixture({ autoTimers: false });
  f.sessionData.begin("a", "admin");
  const gate = wait();
  const foreground = f.sessionData.run({ url: "/admin/dashboard", sessionToken: "a", sessionEpoch: f.sessionData.epoch() }, () => gate.promise);
  const warm = f.store.prefetchAllData();
  f.timeouts.shift()();
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.equal(f.calls.length, 0, "an optional preload must not start while a page request is active");
  gate.resolve({ data: {} });
  await foreground;
  f.appState.currentState = "background";
  f.timeouts.shift()();
  await warm;
  assert.equal(f.calls.length, 0);
});

test("notification writes keep unrelated pages warm and do not trigger an immediate preload storm", async () => {
  const f = storeFixture();
  f.sessionData.begin("a", "admin");
  await f.store.prefetchAllData();
  const before = f.calls.length;
  await f.sessionData.run({ method: "put", url: "/admin/notifications/one/read", sessionToken: "a", sessionEpoch: f.sessionData.epoch() }, async () => ({ data: {} }));
  assert.ok(f.store.getCache("api:/admin/dashboard"));
  await Promise.resolve();
  assert.equal(f.calls.length, before);
  await f.store.prefetchAllData();
  assert.equal(f.calls.length, before + 1, "only the invalidated endpoint needs another warm request");
});

test("foreground completion during the worker's idle delay prevents a duplicate optional download", async () => {
  const f = storeFixture({ autoTimers: false });
  f.sessionData.begin("a", "admin");
  const warm = f.store.prefetchAllData();
  await f.sessionData.run({ url: "/admin/dashboard", sessionToken: "a", sessionEpoch: f.sessionData.epoch() }, async () => ({ data: { summary: {} } }));
  f.timeouts.shift()();
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.equal(f.calls.length, 0, "the worker rechecks freshness after yielding");
  f.store.clearDataCache();
  f.timeouts.shift()();
  await warm;
});

test("restored sessions validate lightweight session before preloading and use the server role rather than stale local role", async () => {
  const sessionData = createSessionData();
  const stored = new Map([["access_token", "a"], ["user_role", "super_admin"]]);
  const gate = wait();
  let prefetched = 0, verifiedHydrations = 0, probes = 0;
  const context = vm.createContext({
    sessionData, console,
    AsyncStorage: { getItem: async key => stored.get(key), setItem: async (key, value) => stored.set(key, value) },
    hydrateCache: async verified => {
      if (!verified) return;
      assert.equal(verified.userId, "verified-user");
      assert.equal(verified.role, "admin");
      assert.equal(sessionData.session().role, "admin");
      verifiedHydrations++;
      sessionData.set("api:/admin/dashboard", { reports: [{ id: "restored" }] });
    }, setCache: (key, value) => sessionData.set(key, value),
    clearDataCache: () => sessionData.reset(), prefetchAllData: () => {
      assert.equal(verifiedHydrations, 1, "hydrate saved display data before background warming");
      prefetched++;
    },
    apiClient: { defaults: { baseURL: "https://api.example/api" }, get: path => { probes++; assert.equal(path, "/session"); return gate.promise; } },
  });
  vm.runInContext(`${source("services/auth.js")}\n globalThis.auth = { restoreAuth, clearAuth };`, context);
  const restored = context.auth.restoreAuth();
  assert.equal(context.auth.restoreAuth(), restored, "startup guards share one authoritative verification");
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(prefetched, 0);
  assert.equal(verifiedHydrations, 0);
  gate.resolve({ data: { userId: "verified-user", role: "admin" } });
  assert.equal((await restored).role, "admin");
  assert.equal(stored.get("user_role"), "admin");
  assert.equal(prefetched, 1);
  assert.equal(sessionData.session().role, "admin");
  assert.equal(probes, 1);
  assert.equal(sessionData.get("api:/admin/dashboard").reports[0].id, "restored");
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
    Platform: { OS: "web" },
    clearPageFailure() {}, recordPageFailure() {},
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
      multiSet: async entries => { for (const [key, value] of entries) stored.set(key, value); },
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
