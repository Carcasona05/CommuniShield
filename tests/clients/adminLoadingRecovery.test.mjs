import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { createSessionData } from "../../clients/services/sessionData.js";
import { querySnapshotKey, retainUnchangedQueryData, usableQuerySnapshot } from "../../clients/services/querySnapshots.js";

const text = path => readFileSync(new URL(`../../clients/${path}`, import.meta.url), "utf8");
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const configFor = (store, extra = {}) => ({ url: "/admin/risk-outlook", params: { view: "current" },
  sessionToken: store.session().token, sessionEpoch: store.epoch(), ...extra });

test("a foreground risk page recovers when its shared optional preload times out", async () => {
  const store = createSessionData();
  store.begin("a", "admin");
  const gate = deferred(), calls = [];
  const transport = async config => {
    calls.push(config);
    return config.background ? gate.promise : { status: 200, data: { reports: [{ id: "loaded" }] } };
  };
  const preload = store.run(configFor(store, { background: true, timeout: 20000 }), transport);
  const preloadFailed = assert.rejects(preload, { code: "ECONNABORTED" });
  const visible = store.run(configFor(store, { timeout: 180000 }), transport);
  gate.reject(Object.assign(new Error("preload timed out"), { code: "ECONNABORTED" }));
  const result = await visible;
  await preloadFailed;
  assert.equal(result.data.reports[0].id, "loaded");
  assert.equal(calls.length, 2);
  assert.equal(calls[1].timeout, 180000);
  assert.equal(store.foregroundBusy(), false);
});

test("multiple visible callers share the single recovery request", async () => {
  const store = createSessionData();
  store.begin("a", "super_admin");
  const gate = deferred();
  let calls = 0;
  const transport = async config => {
    calls++;
    return config.background ? gate.promise : { status: 200, data: { reports: [] } };
  };
  const preload = store.run(configFor(store, { background: true }), transport);
  const failed = assert.rejects(preload);
  const pages = [store.run(configFor(store), transport), store.run(configFor(store), transport)];
  gate.reject(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }));
  await Promise.all([...pages, failed]);
  assert.equal(calls, 2);
});

for (const reason of ["denied", "logout", "invalidation"]) {
  test(`preload recovery never retries after ${reason}`, async () => {
    const store = createSessionData();
    store.begin("a", "admin");
    const gate = deferred();
    let calls = 0;
    const transport = () => { calls++; return gate.promise; };
    const preload = store.run(configFor(store, { background: true }), transport);
    const page = store.run(configFor(store), transport);
    const rejected = Promise.all([assert.rejects(preload), assert.rejects(page)]);
    await Promise.resolve();
    if (reason === "logout") store.reset();
    if (reason === "invalidation") store.invalidate({ paths: ["/admin/risk-outlook"] });
    gate.reject(reason === "denied" ? { response: { status: 403 } } : { code: "ECONNABORTED" });
    await rejected;
    assert.equal(calls, 1);
    assert.equal(store.get(querySnapshotKey("/admin/risk-outlook", { view: "current" })), undefined);
  });
}

function queryFixture(get) {
  const store = createSessionData();
  store.begin("a", "admin");
  const slots = [], effects = [], timers = new Map();
  let cursor, jobs, timer = 0, automatic;
  const context = vm.createContext({
    querySnapshotKey, retainUnchangedQueryData, usableQuerySnapshot, sessionData: store,
    getCache: key => store.get(key), setCache: (key, value) => store.set(key, value),
    AsyncStorage: { getItem: async () => store.session()?.token }, apiClient: { get },
    setTimeout: fn => { timers.set(++timer, fn); return timer; }, clearTimeout: id => timers.delete(id),
    useState(init) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof init === "function" ? init() : init;
      return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }];
    },
    useRef(current) { const i = cursor++; return slots[i] ||= { current }; },
    useCallback(fn, deps) {
      const i = cursor++;
      if (!slots[i] || deps.some((value, j) => value !== slots[i].deps[j])) slots[i] = { fn, deps };
      return slots[i].fn;
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!effects[i] || deps.some((value, j) => value !== effects[i].deps[j])) {
        jobs.push(() => { effects[i]?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; });
      }
    },
    useAutoRefresh: loader => { automatic = loader; },
  });
  vm.runInContext(text("hooks/useRetainedApiQuery.js").replace(/^import .*;\r?\n/gm, "")
    .replace("export default function useRetainedApiQuery", "function useRetainedApiQuery") + "\nglobalThis.hook = useRetainedApiQuery;", context);
  const render = (options = {}) => {
    cursor = 0; jobs = [];
    const view = context.hook({ endpoint: "/admin/dashboard", validate: data => Number.isFinite(data?.summary?.total), ...options });
    jobs.forEach(fn => fn());
    return view;
  };
  return { store, timers, render, load: () => automatic(), unmount: () => effects.forEach(effect => effect?.cleanup?.()) };
}

test("first-load timeout is not displayed as a zero dashboard and retries automatically once", async () => {
  let calls = 0;
  const f = queryFixture(async () => {
    calls++;
    if (calls === 1) throw { code: "ECONNABORTED", message: "timeout" };
    return { data: { summary: { total: 42 } } };
  });
  assert.equal(f.render().loading, true);
  await f.load();
  let view = f.render();
  assert.equal(view.data, null);
  assert.match(view.errorMessage, /timeout/);
  assert.equal(f.timers.size, 1);
  const retry = [...f.timers.values()][0];
  f.timers.clear();
  retry();
  await f.load();
  view = f.render();
  assert.equal(view.data.summary.total, 42);
  assert.equal(view.errorMessage, "");
  assert.equal(calls, 2);
  f.unmount();
});

test("automatic network retry is bounded and manual retry does not require a browser refresh", async () => {
  let calls = 0, healthy = false;
  const f = queryFixture(async () => {
    calls++;
    if (!healthy) throw { response: { status: 504 }, message: "gateway timeout" };
    return { data: { summary: { total: 5 } } };
  });
  f.render();
  await f.load();
  [...f.timers.values()][0]();
  f.timers.clear();
  await f.load();
  assert.equal(calls, 2);
  assert.equal(f.timers.size, 0);
  healthy = true;
  await f.render().reload();
  assert.equal(f.render().data.summary.total, 5);
  f.unmount();
});

test("a successful idle prefetch updates the dashboard without a browser refresh", async () => {
  const f = queryFixture(() => assert.fail("No foreground fetch needed"));
  f.render();
  const config = { url: "/admin/dashboard", sessionToken: "a", sessionEpoch: f.store.epoch(), background: true };
  await f.store.run(config, async () => ({ status: 200, data: { summary: { total: 17 } } }));
  assert.equal(f.render().data.summary.total, 17);
  f.unmount();
});

test("a cancelled first dashboard load recovers rather than exposing empty defaults", async () => {
  let calls = 0;
  const f = queryFixture(async () => {
    if (++calls === 1) throw { code: "ERR_CANCELED" };
    return { data: { summary: { total: 9 } } };
  });
  f.render();
  await f.load();
  assert.equal(f.render().loading, true);
  assert.equal(f.render().data, null);
  [...f.timers.values()][0]();
  f.timers.clear();
  await f.load();
  assert.equal(f.render().data.summary.total, 9);
  f.unmount();
});

test("a genuine successful empty dataset remains zero, not an error", async () => {
  const f = queryFixture(async () => ({ data: { summary: { total: 0 } } }));
  f.render();
  await f.load();
  assert.equal(f.render().data.summary.total, 0);
  assert.equal(f.render().errorMessage, "");
  f.unmount();
});

test("unmount cancels scheduled retries and auth denial never schedules one", async () => {
  const f = queryFixture(async () => { throw { code: "ERR_NETWORK" }; });
  f.render();
  await f.load();
  assert.equal(f.timers.size, 1);
  f.unmount();
  assert.equal(f.timers.size, 0);
  const denied = queryFixture(async () => { throw { response: { status: 403 } }; });
  denied.render();
  await denied.load();
  assert.equal(denied.timers.size, 0);
  assert.match(denied.render().errorMessage, /Access denied/);
  denied.unmount();
});

test("both dashboards use validated retained queries instead of silent failure and zero defaults", () => {
  for (const path of ["app/(admin)/Admin_Dashboard.jsx", "app/(sadmin)/SAdmin_Dashboard.jsx"]) {
    const code = text(path);
    assert.match(code, /useRetainedApiQuery/);
    assert.match(code, /if \(!data\)/);
    assert.match(code, /QueryErrorNotice/);
    assert.doesNotMatch(code, /keep last loaded data on failure|summary \|\| \{ total: 0/);
  }
});

test("on-demand queries stay idle until selected and ignore a closed selection's late response", async () => {
  let calls = 0;
  const gate = deferred();
  const f = queryFixture(async () => { calls++; return calls === 1 ? gate.promise : { data: { summary: { total: 2 } } }; });
  assert.equal(f.render({ enabled: false }).loading, false);
  await f.load();
  assert.equal(calls, 0);
  f.render({ enabled: true });
  const pending = f.load();
  await Promise.resolve();
  f.render({ enabled: false });
  gate.resolve({ data: { summary: { total: 1 } } });
  await pending;
  assert.equal(f.render({ enabled: false }).data, null);
  f.render({ enabled: true });
  await f.load();
  assert.equal(f.render({ enabled: true }).data.summary.total, 2);
  f.unmount();
});
