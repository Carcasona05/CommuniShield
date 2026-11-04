import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import { createSessionData } from "../../clients/services/sessionData.js";

const require = createRequire(new URL("../../clients/package.json", import.meta.url));
const axios = require("axios");
const text = path => readFileSync(new URL(`../../clients/${path}`, import.meta.url), "utf8");
function fixture(transport) {
  const sessionData = createSessionData();
  const storage = new Map([["access_token", "a"], ["user_role", "admin"]]);
  const context = vm.createContext({
    axios: Object.assign((...args) => axios(...args), axios, { getAdapter: () => transport }),
    sessionData, Platform: { OS: "web" }, process: { env: {} }, setTimeout,
    AsyncStorage: {
      getItem: async key => storage.get(key),
      setItem: async (key, value) => storage.set(key, value),
    },
  });
  const code = text("services/apiClient.js").replace(/^import .*;\r?\n/gm, "")
    .replace(/export const /g, "const ").replace("export default apiClient;", "globalThis.client = apiClient; globalThis.request = apiRequest;");
  vm.runInContext(code, context);
  return { sessionData, storage, client: context.client, request: context.request };
}

test("a disabled session probe reaches the server despite a warm profile and clears private cache", async () => {
  let disabled = false, calls = 0;
  const { client, sessionData, storage } = fixture(async config => {
    calls++;
    if (disabled) throw new axios.AxiosError("Disabled", "ERR_BAD_REQUEST", config, null,
      { config, status: 403, data: { error: "Account disabled by administrator" }, headers: {} });
    return { config, status: 200, headers: {}, data: JSON.stringify({ name: "Private" }) };
  });
  await Promise.all([client.get("/profile"), client.get("/profile")]);
  assert.equal(calls, 1);
  assert.equal(sessionData.get("api:/profile").name, "Private");
  disabled = true;
  await assert.rejects(client.get("/session"), error => error.response.status === 403);
  assert.equal(calls, 2);
  assert.equal(sessionData.get("api:/profile"), undefined);
  assert.equal(sessionData.session(), null);
  assert.match(storage.get("disabled_reason"), /disabled/i);
});

test("old explicit tokens cannot read a new account's cached profile", async () => {
  let calls = 0;
  const { client, sessionData, storage } = fixture(async config => {
    calls++;
    return { config, status: 200, headers: {}, data: JSON.stringify({ name: config.headers.Authorization }) };
  });
  await client.get("/profile");
  sessionData.begin("b", "user");
  storage.set("access_token", "b");
  storage.set("user_role", "user");
  await client.get("/profile");
  await assert.rejects(client.get("/profile", { headers: { Authorization: "Bearer a" } }), axios.isCancel);
  assert.equal(calls, 2);
  assert.equal(sessionData.get("api:/profile").name, "Bearer b");
});

test("cancelled requests are not retried during auth transitions", async () => {
  const { request, sessionData } = fixture(() => { throw new Error("Must not reach network"); });
  const resume = sessionData.pause();
  try { await assert.rejects(request({ url: "/profile" }), axios.isCancel); }
  finally { resume(); }
});

for (const path of ["components/Admin_compo/Admin_Layout.jsx", "components/SAdmin_Compo/SAdmin_Layout.jsx"]) {
  test(`${path} uses focus-aware session checks, not full-profile notification/polling reads`, () => {
    const source = text(path);
    assert.doesNotMatch(source, /apiClient\.get\("\/profile"/);
    assert.match(source, /apiClient\.get\("\/session"/);
    assert.match(source, /useAutoRefresh\(checkDisabled, 60000\)/);
    assert.doesNotMatch(source, /setInterval\(checkDisabled/);
    assert.match(source, /status === 403 && \/disabled\/i\.test\(message\)/);
  });
}

test("profile settings clears cache only on explicit refresh and initializes loadProfile before its consumer", () => {
  const source = text("app/(tabs)/User_ProfileSettings.jsx");
  assert.equal((source.match(/clearProfileCache\(\)/g) || []).length, 1);
  assert.ok(source.indexOf("const loadProfile =") < source.indexOf("const onRefresh ="));
  assert.match(source, /const onRefresh =[\s\S]*await clearProfileCache\(\);\s*await loadProfile\(\)/);
});
