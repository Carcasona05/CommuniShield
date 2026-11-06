import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { PRODUCTION_API_URL } from "../../clients/services/apiConfiguration.js";

const source = readFileSync(new URL("../../clients/app/(tabs)/User_Settings.jsx", import.meta.url), "utf8");
const cancellation = source.match(/const isApiCancellation = ([^\n]+);/)[1];
const isApiCancellation = vm.runInNewContext(cancellation, { axios: { isCancel: error => error?.__CANCEL__ === true } });

async function loadPreferences(error, switchAccount = false) {
  const notices = [], saved = [];
  let token = "signed-in";
  const context = vm.createContext({
    useCallback: fn => fn, preferenceLoadError: message => notices.push(message),
    savingPreferenceRef: { current: false }, preferenceVersion: { current: 0 },
    AsyncStorage: { getItem: async () => token }, PREFERENCES_PATH: "/profile/notification-preferences", PREFERENCES_CACHE_KEY: "preferences",
    apiClient: { get: async () => {
      if (error) throw error;
      if (switchAccount) token = "new-account";
      return { data: { notifications_enabled: true } };
    } },
    isApiCancellation, setCache: (_key, value) => saved.push(value), setPreferences() {},
  });
  const declaration = source.match(/const loadPreferences = useCallback\(async \(\) => \{[\s\S]*?\}, \[preferenceLoadError\]\);/)[0];
  vm.runInContext(declaration + "\nglobalThis.load = loadPreferences;", context);
  await context.load();
  return { notices, saved };
}

test("logout/session cancellations never display the false cannot-reach-server notification", async () => {
  for (const error of [{ code: "ERR_CANCELED" }, { __CANCEL__: true }]) {
    assert.equal((await loadPreferences(error)).notices.length, 0);
  }
});

test("real network and missing-deployment failures use appropriate deployed-app guidance", async () => {
  const network = await loadPreferences({ code: "ERR_NETWORK" });
  assert.match(network.notices[0], /internet connection/);
  assert.doesNotMatch(network.notices[0], /local API|local server/);
  const missing = await loadPreferences({ response: { status: 404 } });
  assert.match(missing.notices[0], /backend deployment/);
});

test("a late preferences response from a previous account cannot be saved", async () => {
  assert.equal((await loadPreferences(null, true)).saved.length, 0);
  assert.equal((await loadPreferences(null)).saved.length, 1);
});

test("preview and production mobile builds explicitly select the working deployed API", () => {
  const eas = JSON.parse(readFileSync(new URL("../../clients/eas.json", import.meta.url), "utf8"));
  for (const profile of ["preview", "production"]) assert.equal(eas.build[profile].env.EXPO_PUBLIC_API_URL, PRODUCTION_API_URL);
});
