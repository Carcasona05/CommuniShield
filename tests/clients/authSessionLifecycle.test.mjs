import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import { createSessionData } from "../../clients/services/sessionData.js";
import { resolveApiBaseUrl } from "../../clients/services/apiConfiguration.js";

const require = createRequire(new URL("../../clients/package.json", import.meta.url));
const axios = require("axios");
const text = name => readFileSync(new URL(`../../clients/services/${name}.js`, import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace(/export const /g, "const ");
function fixture(transport = async config => ({ config, status: 200, headers: {}, data: JSON.stringify({ authorization: config.headers.Authorization }) })) {
  const sessionData = createSessionData();
  const storage = new Map();
  let failSave = false;
  const context = vm.createContext({
    axios: Object.assign((...args) => axios(...args), axios, { getAdapter: () => transport }),
    sessionData, resolveApiBaseUrl, Platform: { OS: "web" }, process: { env: { EXPO_PUBLIC_API_URL: "https://example.test/api" } },
    setTimeout, console, clearPageFailure() {}, recordPageFailure() {},
    clearDataCache: () => sessionData.reset("logout"),
    hydrateCache: async () => {}, prefetchAllData: async () => {},
    AsyncStorage: {
      getItem: async key => storage.get(key), setItem: async (key, value) => storage.set(key, value),
      multiRemove: async keys => { for (const key of keys) storage.delete(key); },
      multiSet: async entries => { if (failSave) throw new Error("Storage unavailable"); for (const [key, value] of entries) storage.set(key, value); },
    },
  });
  vm.runInContext(text("apiClient").replace("export default apiClient;", "globalThis.client = apiClient;"), context);
  vm.runInContext(text("auth") + "\nglobalThis.auth = { saveAuth, clearAuth, restoreAuth };", context);
  return { sessionData, storage, auth: context.auth, client: context.client, failSave: () => { failSave = true; } };
}

test("logout then login adopts the new API session without a browser refresh", async () => {
  const f = fixture();
  await f.auth.saveAuth({ token: "oskar", role: "user" });
  assert.equal((await f.client.get("/profile")).data.authorization, "Bearer oskar");
  await f.auth.clearAuth();
  assert.equal(f.sessionData.session(), null);
  assert.equal(f.sessionData.get("api:/profile"), undefined);
  assert.equal(f.storage.get("access_token"), undefined);
  await f.auth.saveAuth({ token: "maria", role: "user" });
  assert.equal((await f.client.get("/profile")).data.authorization, "Bearer maria");
  await assert.rejects(f.client.get("/profile", { headers: { Authorization: "Bearer oskar" } }), axios.isCancel);
});

test("prefetch can start immediately after sign-in and private data cannot survive a role switch", async () => {
  const f = fixture();
  await f.auth.saveAuth({ token: "super", role: "super_admin" });
  assert.equal(f.sessionData.changing(), false);
  assert.equal(f.sessionData.session().token, "super");
  await f.client.get("/admin/accounts");
  await f.auth.saveAuth({ token: "admin", role: "admin" });
  assert.equal(f.sessionData.get("api:/admin/accounts"), undefined);
  assert.equal(f.sessionData.session().role, "admin");
  await assert.rejects(f.client.get("/admin/accounts"), error => error.response.status === 403);
});

test("late requests from the previous login cannot overwrite new-account snapshots", async () => {
  let release, started;
  const start = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const f = fixture(async config => {
    if (config.headers.Authorization === "Bearer old") { started(); await gate; }
    return { config, status: 200, headers: {}, data: JSON.stringify({ account: config.headers.Authorization }) };
  });
  await f.auth.saveAuth({ token: "old", role: "user" });
  const old = f.client.get("/profile");
  const rejected = assert.rejects(old, axios.isCancel);
  await start;
  await f.auth.clearAuth();
  await f.auth.saveAuth({ token: "new", role: "user" });
  await f.client.get("/profile");
  release();
  await rejected;
  assert.equal(f.sessionData.get("api:/profile").account, "Bearer new");
});

test("failed credential writes leave no active or half-written sign-in session", async () => {
  const f = fixture();
  await f.auth.saveAuth({ token: "old", role: "user" });
  f.failSave();
  await assert.rejects(f.auth.saveAuth({ token: "new", role: "admin" }), /Storage unavailable/);
  assert.equal(f.sessionData.session(), null);
  assert.equal(f.sessionData.changing(), false);
  assert.equal(f.storage.get("access_token"), undefined);
  assert.equal(f.storage.get("user_role"), undefined);
});

test("overlapping logout/sign-in operations are serialized and emit readiness only after credentials are stored", async () => {
  const f = fixture();
  let ready = 0;
  f.sessionData.subscribe(event => {
    if (event.type === "ready") {
      ready++;
      assert.equal(f.sessionData.changing(), false);
      assert.equal(f.storage.get("access_token"), f.sessionData.session().token);
    }
  });
  await Promise.all([f.auth.clearAuth(), f.auth.saveAuth({ token: "new", role: "admin" })]);
  assert.equal(f.sessionData.session().token, "new");
  assert.equal(ready, 1);
});

test("temporary startup network failures do not erase a valid login", async () => {
  const f = fixture(async config => { throw new axios.AxiosError("Network unavailable", "ERR_NETWORK", config); });
  await f.auth.saveAuth({ token: "valid", role: "user" });
  await assert.rejects(f.auth.restoreAuth(), /Network unavailable/);
  assert.equal(f.storage.get("access_token"), "valid");
  assert.equal(f.sessionData.session().token, "valid");
});

test("authoritative startup authentication rejection clears stored and in-memory sessions", async () => {
  const f = fixture(async config => { throw new axios.AxiosError("Expired", "ERR_BAD_REQUEST", config, null,
    { config, status: 401, data: { error: "Invalid token" }, headers: {} }); });
  await f.auth.saveAuth({ token: "expired", role: "user" });
  assert.equal(await f.auth.restoreAuth(), null);
  assert.equal(f.storage.get("access_token"), undefined);
  assert.equal(f.sessionData.session(), null);
});

test("ordinary page reads have a bounded loading timeout without shortening writes or custom timeouts", async () => {
  const timeouts = [];
  const f = fixture(async config => { timeouts.push(config.timeout); return { config, status: 200, headers: {}, data: "{}" }; });
  await f.auth.saveAuth({ token: "user", role: "user" });
  await f.client.get("/reports");
  await f.client.post("/reports", { details: "Report" });
  await f.client.get("/profile", { timeout: 7000 });
  assert.deepEqual(timeouts, [30000, 180000, 7000]);
});
