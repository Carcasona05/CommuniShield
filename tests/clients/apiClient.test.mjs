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
  vm.runInNewContext(source, {
    process: { env: { EXPO_PUBLIC_API_URL: url } },
    __DEV__: development,
    axios: { create(value) {
      options = value;
      return { defaults: { adapter: "test" }, interceptors: { request: { use() {} }, response: { use() {} } } };
    }, getAdapter() { return () => {}; } },
  });
  return options;
}

test("web and native use the configured API URL, normalized without trailing slashes", () => {
  assert.equal(clientOptions(" https://example.onrender.com/api/// ", false).baseURL,
    "https://example.onrender.com/api");
  assert.equal(clientOptions("http://localhost:3000/api", true).baseURL,
    "http://localhost:3000/api");
});

test("only development may fall back to the existing LAN backend", () => {
  assert.equal(clientOptions(undefined, true).baseURL, "http://192.168.1.37:3000/api");
  for (const value of [undefined, "", "   "]) {
    assert.throws(() => clientOptions(value, false), /Set EXPO_PUBLIC_API_URL/);
  }
});
