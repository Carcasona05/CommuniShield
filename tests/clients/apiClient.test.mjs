import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../../clients/services/apiClient.js", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "")
  .replace(/export default apiClient;/, "")
  .replace(/export const /g, "const ");

function clientOptions(url, development) {
  let options;
  let requestInterceptor;
  const context = {
    process: { env: { EXPO_PUBLIC_API_URL: url } },
    __DEV__: development,
    axios: { create(value) {
      options = value;
      return { defaults: { adapter: "test" }, interceptors: { request: { use(fn) { requestInterceptor = fn; } }, response: { use() {} } } };
    }, getAdapter() { return () => {}; } },
  };
  vm.runInNewContext(`${source}\n globalThis.configurationError = API_CONFIGURATION_ERROR;`, context);
  return { ...options, requestInterceptor, configurationError: context.configurationError };
}

test("web and native use the configured API URL, normalized without trailing slashes", () => {
  assert.equal(clientOptions(" https://example.onrender.com/api/// ", false).baseURL,
    "https://example.onrender.com/api");
  assert.equal(clientOptions("http://localhost:3000/api", true).baseURL,
    "http://localhost:3000/api");
});

test("only development may fall back to LAN; missing release configuration no longer crashes at import", async () => {
  assert.equal(clientOptions(undefined, true).baseURL, "http://192.168.1.37:3000/api");
  for (const value of [undefined, "", "   "]) {
    const release = clientOptions(value, false);
    assert.equal(release.baseURL, "");
    assert.match(release.configurationError, /EXPO_PUBLIC_API_URL/);
    await assert.rejects(release.requestInterceptor({ method: "post", url: "/login" }),
      error => error.code === "API_CONFIGURATION_ERROR" && /EAS/.test(error.response.data.error));
  }
});

test("malformed API addresses fail gracefully without making a request", async () => {
  for (const value of ["undefined", "not-a-url", "https://", "https://example.com/api?key=secret"]) {
    const release = clientOptions(value, false);
    assert.match(release.configurationError, /invalid backend address/);
    await assert.rejects(release.requestInterceptor({ url: "/profile" }), error => error.code === "API_CONFIGURATION_ERROR");
  }
});
