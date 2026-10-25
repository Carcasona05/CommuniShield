import assert from "node:assert/strict";
import { test } from "node:test";
import { createSessionData, PAGE_FRESH_MS, PAGE_RETAIN_MS, prefetchPlan } from "../../clients/services/sessionData.js";
import { querySnapshotKey } from "../../clients/services/querySnapshots.js";

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const setup = (role = "admin") => {
  let time = Date.parse("2026-10-26T12:00:00Z");
  const data = createSessionData({ now: () => time });
  data.begin("token-a", role);
  const config = (url = "/admin/dashboard", extra = {}) => ({ method: "get", url,
    sessionToken: "token-a", sessionEpoch: data.epoch(), ...extra });
  return { data, config, advance: value => { time += value; } };
};
const response = (data = { reports: [] }) => ({ data, status: 200, headers: {} });

test("preload permissions and priority are role-specific, never super-admin data for an admin", () => {
  assert.deepEqual(prefetchPlan(null), []);
  assert.deepEqual(prefetchPlan("unknown"), []);
  assert.equal(prefetchPlan("admin")[0], "/admin/overview");
  assert.equal(prefetchPlan("user")[0], "/reports");
  assert.equal(prefetchPlan("admin").includes("/admin/accounts"), false);
  assert.equal(prefetchPlan("super_admin").includes("/admin/accounts"), true);
  assert.equal(prefetchPlan("user").some(path => path.startsWith("/admin/")), false);
});

test("account guard prevents regular admin network calls, while super-admins can fetch accounts", async () => {
  for (const role of ["user", "admin", "super_admin"]) {
    const { data, config } = setup(role);
    let count = 0;
    const transport = async () => { count++; return response({ accounts: [] }); };
    if (role === "super_admin") await data.run(config("/admin/accounts"), transport);
    else await assert.rejects(data.run(config("/admin/accounts"), transport), error => error.response.status === 403);
    assert.equal(count, role === "super_admin" ? 1 : 0);
  }
});

test("concurrent preloading and page reads share a single request and prime both page cache formats", async () => {
  const { data, config } = setup();
  const wait = deferred();
  let count = 0;
  const transport = () => { count++; return wait.promise; };
  const a = data.run(config(), transport);
  const b = data.run(config(), transport);
  wait.resolve(response(JSON.stringify({ reports: [{ id: "one" }] })));
  assert.deepEqual((await a).data, (await b).data);
  assert.equal(count, 1);
  assert.deepEqual(data.get("api:/admin/dashboard"), { reports: [{ id: "one" }] });
  assert.deepEqual(data.get(querySnapshotKey("/admin/dashboard")).data, { reports: [{ id: "one" }] });
});

test("filter order deduplicates but filter values never share data or poison the unfiltered dashboard", async () => {
  const { data, config } = setup();
  let count = 0;
  const transport = async c => { count++; return response({ source: c.params.source }); };
  await data.run(config(undefined, { params: { source: "Admin", status: undefined } }), transport);
  await data.run(config(undefined, { params: { status: undefined, source: "Admin" } }), transport);
  await data.run(config(undefined, { params: { source: "User" } }), transport);
  assert.equal(count, 2);
  assert.equal(data.get("api:/admin/dashboard"), undefined);
  assert.equal(data.get(querySnapshotKey("/admin/dashboard", { source: "Admin" })).data.source, "Admin");
});

test("warm navigation uses recent data; elapsed TTL and explicit refresh actually contact the server", async () => {
  const { data, config, advance } = setup();
  let count = 0;
  const transport = async () => response({ count: ++count });
  await data.run(config(), transport);
  assert.equal((await data.run(config(), transport)).data.count, 1);
  await data.run(config(undefined, { cacheMode: "network" }), transport);
  assert.equal(count, 2);
  advance(PAGE_FRESH_MS);
  await data.run(config(), transport);
  assert.equal(count, 3);
  advance(PAGE_RETAIN_MS);
  assert.equal(data.get("api:/admin/dashboard"), undefined);
});

test("background failures preserve usable page data; authorization denial removes it", async () => {
  const { data, config, advance } = setup();
  await data.run(config(), async () => response({ reports: [1] }));
  advance(PAGE_FRESH_MS);
  await assert.rejects(data.run(config(), async () => { throw new Error("offline"); }), /offline/);
  assert.deepEqual(data.get("api:/admin/dashboard"), { reports: [1] });
  await assert.rejects(data.run(config(), async () => { throw { response: { status: 403 } }; }));
  assert.equal(data.get("api:/admin/dashboard"), undefined);
  assert.equal(data.get(querySnapshotKey("/admin/dashboard")), undefined);
});

test("logout cancels transport and rejects late data even if the adapter ignores cancellation", async () => {
  const { data, config } = setup();
  const wait = deferred();
  let signal;
  const request = data.run(config(), c => { signal = c.signal; return wait.promise; });
  await Promise.resolve();
  data.reset();
  assert.equal(signal.aborted, true);
  wait.resolve(response({ secret: true }));
  await assert.rejects(request, error => error.code === "ERR_CANCELED");
  data.begin("token-b", "user");
  assert.equal(data.get("api:/admin/dashboard"), undefined);
  assert.equal(data.get(querySnapshotKey("/admin/dashboard")), undefined);
});

test("switching user or role clears all data; stale-token callers cannot send requests", async () => {
  const { data, config } = setup("super_admin");
  const stale = config("/admin/accounts");
  data.set("api:/admin/accounts", { accounts: ["private"] });
  data.begin("token-b", "admin");
  assert.equal(data.get("api:/admin/accounts"), undefined);
  await assert.rejects(data.run(stale, () => { throw new Error("Must not run"); }), error => error.code === "ERR_CANCELED");
  data.set("some-page", { private: true });
  data.begin("token-b", "user");
  assert.equal(data.get("some-page"), undefined);
});

test("successful mutations invalidate cached reads and fence out in-flight pre-mutation snapshots", async () => {
  const { data, config } = setup();
  await data.run(config(), async () => response({ reports: ["old"] }));
  const wait = deferred();
  const oldRead = data.run(config("/admin/analytics"), () => wait.promise);
  await data.run(config("/reports/one/status", { method: "post" }), async () => response({ updated: true }));
  assert.equal(data.get("api:/admin/dashboard"), undefined);
  wait.resolve(response({ reports: ["old"] }));
  await assert.rejects(oldRead, error => error.code === "ERR_CANCELED");
  const fresh = await data.run(config(), async () => response({ reports: ["new"] }));
  assert.deepEqual(fresh.data.reports, ["new"]);
});

test("failed mutations do not erase usable data, and concurrent successful mutations do not cancel each other", async () => {
  const { data, config } = setup();
  await data.run(config(), async () => response({ reports: [1] }));
  await assert.rejects(data.run(config("/reports/one", { method: "put" }), async () => { throw new Error("failed write"); }));
  assert.deepEqual(data.get("api:/admin/dashboard"), { reports: [1] });
  await Promise.all(["one", "two"].map(id => data.run(config(`/reports/${id}`, { method: "put" }), async () => response({ id }))));
});

test("exports, public requests and auth challenges are never cached or deduplicated", async () => {
  const { data, config } = setup();
  let count = 0;
  const transport = async () => { count++; return response({ private: true }); };
  for (let i = 0; i < 2; i++) {
    await data.run(config("/sentiment/datasets/id/export"), transport);
    await data.run({ url: "/login", method: "post" }, transport);
  }
  assert.equal(count, 4);
  assert.equal(data.get("api:/login"), undefined);
});

test("cached forecasts are never reused across UTC midnight", async () => {
  let time = Date.parse("2026-10-26T23:59:59Z");
  const data = createSessionData({ now: () => time });
  data.begin("a", "admin");
  const config = { url: "/admin/risk-outlook", sessionToken: "a", sessionEpoch: data.epoch() };
  let count = 0;
  const transport = async () => response({ day: ++count });
  await data.run(config, transport);
  time += 2000;
  assert.equal((await data.run(config, transport)).data.day, 2);
});
