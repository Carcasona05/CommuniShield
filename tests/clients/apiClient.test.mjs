import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { PRODUCTION_API_URL, resolveApiBaseUrl } from "../../clients/services/apiConfiguration.js";

const source = readFileSync(new URL("../../clients/services/apiClient.js", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "")
  .replace(/export default apiClient;/, "")
  .replace(/export const /g, "const ");

function clientOptions(url, development, platform = "web") {
  let options;
  vm.runInNewContext(source, {
    process: { env: { EXPO_PUBLIC_API_URL: url } },
    Platform: { OS: platform }, resolveApiBaseUrl,
    __DEV__: development,
    axios: { create(value) {
      options = value;
      return { defaults: { adapter: "test" }, interceptors: { request: { use() {} }, response: { use() {} } } };
    }, getAdapter() { return () => {}; } },
  });
  return options;
}

test("mobile keeps the previous hardcoded deployed API while web honors its environment", () => {
  for (const platform of ["android", "ios"]) {
    assert.equal(clientOptions("http://10.235.100.14:3000/api", true, platform).baseURL, PRODUCTION_API_URL);
  }
  assert.equal(clientOptions("https://example.onrender.com/api/", false).baseURL, "https://example.onrender.com/api/");
  assert.equal(clientOptions("http://localhost:3000/api", true).timeout, 180000);
});

test("web preserves the previous environment value without a fallback", () => {
  for (const value of [undefined, "", "   "]) {
    assert.equal(clientOptions(value, false).baseURL, value);
  }
});

test("release builds cannot accidentally ship emulator, private-LAN or insecure HTTP APIs", () => {
  for (const value of ["http://10.0.2.2:3000/api", "https://10.235.100.14/api", "https://192.168.1.37/api", "https://172.16.1.2/api",
    "https://127.0.0.1/api", "https://localhost/api", "https://[::1]/api", "https://dev.local/api", "http://public.example/api"]) {
    assert.equal(clientOptions(value, false, "android").baseURL, PRODUCTION_API_URL, value);
  }
});

test("local overrides apply only to web as in the previous client", () => {
  assert.equal(clientOptions("http://10.0.2.2:3000/api", true, "android").baseURL, PRODUCTION_API_URL);
  assert.equal(clientOptions("http://localhost:3000/api", true).baseURL, "http://localhost:3000/api");
});

test("API URLs normalize the route prefix and reject malformed URLs or embedded credentials", () => {
  assert.equal(resolveApiBaseUrl(" https://backend.example/ "), "https://backend.example/api");
  assert.equal(resolveApiBaseUrl("https://backend.example/v2/api///"), "https://backend.example/v2/api");
  for (const value of ["not-a-url", "/api", "ftp://backend.example/api", "https://user:password@backend.example/api", "https://backend.example/api?token=secret"]) {
    assert.equal(resolveApiBaseUrl(value), PRODUCTION_API_URL);
  }
});
