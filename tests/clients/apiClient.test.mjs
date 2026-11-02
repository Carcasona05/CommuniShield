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
    Platform: { OS: "web" },
    __DEV__: development,
    axios: { create(value) {
      options = value;
      return { defaults: { adapter: "test" }, interceptors: { request: { use() {} }, response: { use() {} } } };
    }, getAdapter() { return () => {}; } },
  });
  return options;
}

// This workspace intentionally uses a local override. Cache/transport changes
// must not silently replace the developer's backend configuration.
test("session transport preserves the workspace's explicit backend override", () => {
  assert.equal(clientOptions("https://example.onrender.com/api", false).baseURL,
    "http://192.168.1.37:3000/api");
  assert.equal(clientOptions("http://localhost:3000/api", true).timeout, 180000);
});

test("the explicit local backend override does not depend on the environment URL", () => {
  for (const value of [undefined, "", "   "]) {
    assert.equal(clientOptions(value, false).baseURL, "http://192.168.1.37:3000/api");
  }
});
