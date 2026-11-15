import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { createSessionData } from "../../clients/services/sessionData.js";
import { querySnapshotKey, usableQuerySnapshot } from "../../clients/services/querySnapshots.js";
import { mergeUniqueItems } from "../../clients/services/pagination.js";
import { compareRecords, localBlotterRecord, matchesRecordFilters, recordFilters, validBrowsePage } from "../../clients/services/adminBrowsing.js";

const source = readFileSync(new URL("../../clients/hooks/useViewMoreQuery.js", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace("export default function", "function");
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const rows = Array.from({ length: 25 }, (_, i) => ({ id: `row-${i}`, label: `Record ${i}` }));
const pageOf = (page, items = rows) => ({ items: items.slice((page - 1) * 10, page * 10), total: items.length, page, pageSize: 10,
  hasMore: page * 10 < items.length, stats: { reports: items.length } });
function fixture(get, store = createSessionData()) {
  if (!store.session()) store.begin("a", "admin");
  const slots = [], effects = [], calls = [];
  let cursor, jobs, automatic, transport = get;
  const context = vm.createContext({
    sessionData: store, querySnapshotKey, usableQuerySnapshot, mergeUniqueItems,
    getCache: key => store.get(key), setCache: (key, value) => store.set(key, value),
    AsyncStorage: { getItem: async () => store.session()?.token },
    apiClient: { get: async (url, config) => store.run({ ...config, url, sessionToken: store.session()?.token, sessionEpoch: store.epoch() }, live => {
      calls.push({ url, ...config }); return transport(live);
    }) },
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
      if (!effects[i] || deps.some((value, j) => value !== effects[i].deps[j])) jobs.push(() => { effects[i]?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; });
    },
    useAutoRefresh: fn => { automatic = fn; },
  });
  vm.runInContext(source + "\nglobalThis.hook = useViewMoreQuery;", context);
  const render = (options = {}) => {
    cursor = 0; jobs = [];
    const view = context.hook({ endpoint: "/admin/browse", params: { view: "records" }, validate: validBrowsePage, ...options });
    jobs.forEach(fn => fn());
    return view;
  };
  return { store, calls, render, load: (...args) => automatic(...args), setTransport: fn => { transport = fn; }, unmount: () => effects.forEach(effect => effect?.cleanup?.()) };
}

test("View more fetches only the next ten rows, appends them, and keeps global totals", async () => {
  const f = fixture(async config => ({ data: pageOf(config.params.page) }));
  assert.equal(f.render().loading, true);
  await f.load();
  const first = f.render();
  assert.equal(first.items.length, 10); assert.equal(first.data.total, 25);
  const a = first.loadMore(), b = first.loadMore();
  assert.equal(a, b, "double clicks share a single request");
  assert.equal(f.render().items.length, 10, "existing rows stay visible while appending");
  await a;
  let view = f.render();
  assert.equal(view.items.length, 20); assert.equal(view.items[0], first.items[0]);
  assert.deepEqual(f.calls.map(call => call.params.page), [1, 2]);
  assert.ok(f.calls.every(call => call.params.pageSize === 10));
  assert.equal(view.data.stats.reports, 25);
  await view.loadMore(); view = f.render();
  assert.equal(view.items.length, 25); assert.equal(view.hasMore, false);
  await view.loadMore(); assert.equal(f.calls.length, 3);
  f.unmount();
});

test("append failures preserve the prefix and stop after one automatic retry", async () => {
  const f = fixture(async config => {
    if (config.params.page === 2) throw { response: { status: 503, data: { error: "Temporary database failure" } } };
    return { data: pageOf(config.params.page) };
  });
  f.render(); await f.load();
  await f.render().loadMore();
  assert.equal(f.render().items.length, 10); assert.match(f.render().errorMessage, /Temporary/);
  assert.equal(f.render().loadingMore, false);
  assert.deepEqual(f.calls.map(call => call.params.page), [1, 2, 2]);
  f.setTransport(async config => ({ data: pageOf(config.params.page) }));
  await f.render().loadMore();
  assert.equal(f.render().items.length, 20); assert.equal(f.render().errorMessage, "");
  f.unmount();
});

test("refresh atomically revalidates the loaded depth, removes deletions and does not collapse the list", async () => {
  const f = fixture(async config => ({ data: pageOf(config.params.page) }));
  f.render(); await f.load(); await f.render().loadMore(); await f.render().loadMore();
  const updated = rows.filter(row => row.id !== "row-3").map(row => ({ ...row, label: "Updated" }));
  const gate = deferred();
  f.setTransport(async config => { if (config.params.page === 1) await gate.promise; return { data: pageOf(config.params.page, updated) }; });
  const refreshing = f.render().reload();
  assert.equal(f.render().items.length, 25); assert.equal(f.render().refreshing, true);
  gate.resolve(); await refreshing;
  const view = f.render();
  assert.equal(view.items.length, 24); assert.equal(view.items.some(row => row.id === "row-3"), false);
  assert.ok(view.items.every(row => row.label === "Updated"));
  assert.deepEqual(f.calls.slice(-3).map(call => call.params.page), [1, 2, 3]);
  f.unmount();
});

test("changing filters hides the old prefix and rejects a late append for the previous filter", async () => {
  const gate = deferred();
  const f = fixture(async config => {
    if (config.params.status === "Rejected") return { data: pageOf(1, [{ id: "rejected" }]) };
    if (config.params.page === 2) return gate.promise;
    return { data: pageOf(1) };
  });
  f.render(); await f.load();
  const pending = f.render().loadMore(); await Promise.resolve();
  const options = { params: { view: "records", status: "Rejected" } };
  assert.equal(f.render(options).data, null);
  await f.load();
  gate.resolve({ data: pageOf(2) }); await pending;
  assert.equal(f.render(options).items.length, 1); assert.equal(f.render(options).items[0].id, "rejected");
  f.unmount();
});

test("logout fences late responses and a new account cannot inherit loaded pages", async () => {
  const gate = deferred();
  const f = fixture(async config => config.params.page === 2 ? gate.promise : { data: pageOf(1) });
  f.render(); await f.load(); const pending = f.render().loadMore(); await Promise.resolve();
  f.store.begin("b", "super_admin");
  f.render({ enabled: false }); gate.resolve({ data: pageOf(2) }); await pending;
  assert.equal(f.render({ enabled: false }).data, null);
  assert.equal(f.store.pageEntries().length, 0);
  f.unmount();
});

test("revisiting retains the loaded prefix, while disabled archive tabs make no requests", async () => {
  const f = fixture(async config => ({ data: pageOf(config.params.page) }));
  f.render(); await f.load(); await f.render().loadMore(); f.unmount();
  const next = fixture(() => assert.fail("A fresh prefix should not refetch"), f.store);
  assert.equal(next.render().items.length, 20); await next.load(); assert.equal(next.calls.length, 0);
  next.render({ enabled: false }); await next.load(); assert.equal(next.calls.length, 0);
  next.unmount();
});

test("cursor APIs continue from the last row, and prefix refresh uses new cursors", async () => {
  const f = fixture(async config => ({ data: { ...pageOf(config.params.page), nextCursor: `after-${config.params.page}` } }));
  f.render(); await f.load(); await f.render().loadMore();
  assert.equal(f.calls[1].params.cursor, "after-1");
  await f.render().reload();
  assert.equal(f.calls.at(-2).params.cursor, undefined); assert.equal(f.calls.at(-1).params.cursor, "after-1");
  f.unmount();
});

test("unauthorized requests clear the whole loaded prefix without retries", async () => {
  const f = fixture(async config => ({ data: pageOf(config.params.page) }));
  f.render(); await f.load(); await f.render().loadMore();
  f.setTransport(async () => { throw { response: { status: 403 } }; });
  await f.render().reload();
  assert.equal(f.render().data, null); assert.match(f.render().errorMessage, /Access denied/);
  assert.equal(f.calls.length, 3);
  f.unmount();
});

test("local blotters keep complete fields, respect filters and merge in the global record order", () => {
  const local = localBlotterRecord({ id: "local-blotter-1", incident_type: "Theft", incident_description: "Local narrative", created_at: "2026-11-12T10:00:00.123456Z",
    complainant_name: "Local complainant", blotter_no: "BLT-1", page_number: "1" });
  assert.equal(local.kind, "Blotter"); assert.equal(local.complainantName, "Local complainant"); assert.equal(local.blotter_no, "BLT-1");
  assert.equal(matchesRecordFilters(local, recordFilters({ reportType: "Blotter", postBy: "Admin", status: "All" })), true);
  assert.equal(matchesRecordFilters(local, recordFilters({ reportType: "Incident" })), false);
  assert.equal(matchesRecordFilters(local, recordFilters({ status: "Pending Review" })), false);
  const remote = Array.from({ length: 35 }, (_, i) => ({ id: String(i), kind: "Incident", created_at: new Date(Date.parse(local.created_at) - i * 1000).toISOString() })).sort(compareRecords);
  const complete = [...remote, local].sort(compareRecords);
  const loaded = [...remote.slice(0, 20), local].sort(compareRecords).slice(0, 20);
  assert.deepEqual(loaded, complete.slice(0, 20));
});
