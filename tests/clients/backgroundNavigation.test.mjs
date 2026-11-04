import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { createSessionData } from "../../clients/services/sessionData.js";
import { querySnapshotKey, usableQuerySnapshot, retainUnchangedQueryData } from "../../clients/services/querySnapshots.js";

const text = path => readFileSync(new URL(`../../clients/${path}`, import.meta.url), "utf8");
const source = path => text(path).replace(/^import .*;\r?\n/gm, "");

test("warmed JSON is decoded once and shared by navigation and page snapshots", async () => {
  const data = createSessionData();
  data.begin("a", "admin");
  let calls = 0;
  const config = { url: "/admin/dashboard", sessionToken: "a", sessionEpoch: data.epoch() };
  const transport = async () => { calls++; return { status: 200, data: JSON.stringify({ reports: [{ id: "one" }] }) }; };
  const warm = await data.run({ ...config, background: true }, transport);
  const page = await data.run(config, transport);
  assert.equal(calls, 1);
  assert.equal(typeof warm.data, "object");
  assert.equal(page.data, warm.data);
  assert.equal(page.data, data.get("api:/admin/dashboard"));
  assert.equal(page.cacheCheckedAt, warm.cacheCheckedAt, "a cache hit must not claim a newer server check");
});

test("retained queries reuse warm data on focus, while explicit reload forces the network", async () => {
  const data = createSessionData();
  data.begin("a", "admin");
  const snapshot = { data: { reports: [] }, checkedAt: Date.now() };
  data.set(querySnapshotKey("/admin/clusters", { period: "30d" }), snapshot);
  let automatic;
  const calls = [];
  const context = vm.createContext({
    useCallback: fn => fn, useRef: current => ({ current }),
    useState: init => [typeof init === "function" ? init() : init, () => {}],
    useEffect: effect => { effect(); },
    useAutoRefresh: loader => { automatic = loader; },
    sessionData: data, querySnapshotKey, usableQuerySnapshot, retainUnchangedQueryData,
    getCache: key => data.get(key), setCache: (key, value) => data.set(key, value),
    AsyncStorage: { getItem: async () => "a" },
    apiClient: { get: async (path, config) => { calls.push({ path, config }); return { data: snapshot.data }; } },
  });
  vm.runInContext(source("hooks/useRetainedApiQuery.js").replace("export default function useRetainedApiQuery", "function useRetainedApiQuery") + "\nglobalThis.hook = useRetainedApiQuery;", context);
  const page = context.hook({ endpoint: "/admin/clusters", params: { period: "30d" }, validate: () => true });
  assert.equal(page.loading, false);
  assert.equal(page.data, snapshot.data);
  await automatic();
  assert.equal(calls[0].config.cacheMode, undefined);
  await page.reload();
  assert.equal(calls[1].config.cacheMode, "network");
});

test("focus-aware polling stops in background and supports faster active-training checks only when requested", async () => {
  let focus, appListener, visibility;
  let loads = 0, removed = 0;
  const timers = new Map();
  const document = {
    visibilityState: "visible",
    addEventListener: (event, callback) => { visibility = callback; },
    removeEventListener: () => { removed++; },
  };
  const context = vm.createContext({
    useCallback: fn => fn, useRef: current => ({ current }),
    useFocusEffect: callback => { focus = callback; },
    AppState: { currentState: "active", addEventListener: (event, callback) => { appListener = callback; return { remove: () => { removed++; } }; } },
    document,
    setInterval: (fn, ms) => { timers.set(1, { fn, ms }); return 1; },
    clearInterval: id => timers.delete(id),
  });
  vm.runInContext(source("hooks/useAutoRefresh.js").replace("export const useAutoRefresh", "const useAutoRefresh").replace("export default useAutoRefresh;", "globalThis.hook = useAutoRefresh;"), context);
  context.hook(async () => { loads++; }, 10000, { minimumInterval: 10000 });
  const cleanup = focus();
  await Promise.resolve();
  assert.equal(loads, 1);
  assert.equal(timers.get(1).ms, 10000);
  appListener("background");
  assert.equal(timers.size, 0);
  document.visibilityState = "hidden";
  appListener("active");
  assert.equal(timers.size, 0);
  document.visibilityState = "visible";
  visibility();
  assert.equal(timers.size, 1);
  cleanup();
  assert.equal(timers.size, 0);
  assert.equal(removed, 2);
});

for (const [path, loader] of [
  ["app/(tabs)/User_Home.jsx", "loadReports"],
  ["app/(tabs)/User_MyReports.jsx", "loadMyReports"],
  ["app/(tabs)/User_Notification.jsx", "loadNotifications"],
]) {
  test(`${path} manual refresh forces only its own loader`, () => {
    const code = text(path);
    assert.match(code, new RegExp(`const ${loader} = useCallback\\(async \\(\\{ force = false \\} = \\{\\}\\)`));
    assert.match(code, new RegExp(`const handleRefresh =[\\s\\S]*?${loader}\\(\\{ force: true \\}\\)`));
    assert.match(code, /force \? \{ cacheMode: "network" \} : \{\}/);
    assert.doesNotMatch(code, /prefetchAllData\(/);
  });
}

test("model pages hydrate matching paginated caches and no longer use unfocused ten-second timers", () => {
  const supporting = text("components/Admin_compo/SupportingModelsPanel.jsx");
  assert.match(supporting, /getCachedPage\("\/sentiment\/supporting-models", \{ page: 1 \}\)/);
  assert.doesNotMatch(supporting, /supporting-models\?page=|setInterval\(/);
  assert.match(supporting, /useAutoRefresh\(refresh, 60000\)/);
  const training = text("components/Admin_compo/SentimentTrainingPanel.jsx");
  assert.doesNotMatch(training, /setInterval\(/);
  assert.match(training, /trainingActive \? 10000 : 60000/);
  assert.match(training, /refreshRef\.current\?\.\(\{ force: true \}\)/);
  assert.match(text("components/Admin_compo/SentimentDatasetManager.jsx"), /getCachedPage\("\/sentiment\/datasets", \{ status, page \}\)/);
  const dashboard = text("app/(sadmin)/SAdmin_Dashboard.jsx");
  assert.doesNotMatch(dashboard, /apiClient\.get\("\/admin\/analytics"/);
});
