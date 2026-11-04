import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { createSessionData } from "../../clients/services/sessionData.js";

const text = path => readFileSync(new URL(`../../clients/${path}`, import.meta.url), "utf8");
const source = text("services/realtime.js").replace(/^import .*;\r?\n/gm, "").replace(/export const /g, "const ");
function fixture(env = { EXPO_PUBLIC_SUPABASE_URL: "https://test.example", EXPO_PUBLIC_SUPABASE_ANON_KEY: "anon" }) {
  const timers = new Map(), listeners = [], channels = [], removed = [];
  let status, id = 0, options;
  const sessionData = createSessionData();
  const channel = {
    on(type, filter, callback) { listeners.push({ type, filter, callback }); return this; },
    subscribe(callback) { status = callback; return this; },
  };
  const context = vm.createContext({
    process: { env },
    sessionData,
    createClient(url, key, config) {
      options = config;
      return { channel(name) { channels.push(name); return channel; }, removeChannel: async value => removed.push(value) };
    },
    setTimeout(callback, delay) { assert.equal(delay, 150); const key = ++id; timers.set(key, callback); return key; },
    clearTimeout(key) { timers.delete(key); },
  });
  vm.runInContext(`${source}\nglobalThis.subscribe = subscribeToAccountStatusChanges; globalThis.subscribeNotifications = subscribeToAdminNotifications;`, context);
  return {
    subscribe: context.subscribe, listeners, channels, removed, timers,
    subscribeNotifications: context.subscribeNotifications, sessionData,
    status: value => status(value),
    options: () => options,
    async flush() {
      for (const [key, callback] of timers) { timers.delete(key); callback(); }
      await Promise.resolve(); await Promise.resolve();
    },
  };
}

test("account status broadcasts and reconnects trigger coalesced verification, never trust event payloads", async () => {
  const f = fixture();
  let checks = 0;
  const stop = f.subscribe((...args) => { assert.deepEqual(args, []); checks++; });
  assert.deepEqual(f.channels, ["cs-account-status"]);
  assert.equal(f.options().auth.persistSession, false);
  assert.equal(f.listeners[0].type, "broadcast");
  assert.equal(f.listeners[0].filter.event, "account-status-changed");
  f.status("SUBSCRIBED");
  f.listeners[0].callback({ payload: { status: "Disabled", id: "someone-else" } });
  f.listeners[0].callback({ payload: {} });
  await f.flush();
  assert.equal(checks, 1);
  f.status("CHANNEL_ERROR");
  await f.flush();
  assert.equal(checks, 1);
  f.status("SUBSCRIBED");
  await f.flush();
  assert.equal(checks, 2, "reconnect checks changes missed while offline");
  stop();
  await f.flush();
  assert.equal(f.removed.length, 1);
});

test("unmount removes the channel and cancels queued checks", async () => {
  const f = fixture();
  let checks = 0;
  const stop = f.subscribe(() => checks++);
  f.status("SUBSCRIBED");
  stop();
  f.listeners[0].callback({});
  await f.flush();
  assert.equal(checks, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.removed.length, 1);
});

test("missing realtime configuration leaves polling available without opening a channel", () => {
  const f = fixture({});
  assert.equal(f.subscribe(() => {}), null);
  assert.equal(f.channels.length, 0);
});

test("notification broadcasts leave report pages warm instead of invalidating the whole system", () => {
  const f = fixture();
  f.sessionData.begin("a", "admin");
  f.sessionData.set("api:/admin/dashboard", { reports: ["ready"] });
  f.sessionData.set("api:/admin/notifications", { notifications: ["old"] });
  let refreshes = 0;
  f.subscribeNotifications(() => { refreshes++; });
  f.listeners[0].callback({});
  assert.equal(refreshes, 1);
  assert.equal(f.sessionData.get("api:/admin/notifications"), undefined);
  assert.deepEqual(f.sessionData.get("api:/admin/dashboard").reports, ["ready"]);
});

for (const path of ["components/Admin_compo/Admin_Layout.jsx", "components/SAdmin_Compo/SAdmin_Layout.jsx"]) {
  test(`${path} verifies signals through /session and retains polling and disabled-account modal`, async () => {
    const source = text(path);
    assert.match(source, /subscribeToAccountStatusChanges\(checkDisabled\)/);
    assert.match(source, /useAutoRefresh\(checkDisabled, 60000\)/);
    assert.match(source, /event\.reason === "disabled"\) setShowDisabledModal\(true\)/);
    assert.match(source, /unsubscribeSession\(\)/);
    assert.doesNotMatch(source, /apiClient\.get\("\/profile"/);
    const match = /const checkDisabled = useCallback\(async \(\) => \{([\s\S]*?)\n  \}, \[\]\);/.exec(source);
    assert.ok(match);
    let disabled = false, calls = 0, show = false, finish;
    const first = new Promise(resolve => { finish = resolve; });
    const context = vm.createContext({
      disabledCheckRef: { current: false }, disabledRecheckRef: { current: false },
      AsyncStorage: { getItem: async () => "token" },
      sessionData: { session: () => ({ token: "token" }) },
      setShowDisabledModal: value => { show = value; },
      apiClient: { get: async path => {
        assert.equal(path, "/session");
        calls++;
        if (calls === 1) { await first; return {}; }
        if (disabled) throw { response: { status: 403, data: { error: "Account disabled" } } };
        return {};
      } },
    });
    vm.runInContext(`const checkDisabled = async () => {${match[1]}}; globalThis.check = checkDisabled;`, context);
    const running = context.check();
    await Promise.resolve();
    disabled = true;
    await context.check(); // Signal arrives while a successful old probe is pending.
    finish();
    await running;
    for (let i = 0; i < 5; i++) await Promise.resolve();
    assert.equal(calls, 2, "a signal arriving during a check queues a follow-up check");
    assert.equal(show, true);
  });
}
