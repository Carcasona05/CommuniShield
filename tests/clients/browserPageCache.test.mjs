import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createRequire } from "node:module";
import { createSessionData } from "../../clients/services/sessionData.js";
import { querySnapshotKey } from "../../clients/services/querySnapshots.js";
import { createBrowserPageCache, TAB_PAGE_CACHE_KEY, TAB_PAGE_CACHE_MAX_AGE_MS } from "../../clients/services/browserPageCache.js";

const require = createRequire(new URL("../../clients/package.json", import.meta.url));
const { decompressFromUTF16 } = require("lz-string");
const storedEntries = raw => {
  const saved = JSON.parse(raw);
  return saved.entries.map(([key, entry]) => {
    if (saved.version === 1) return [key, entry];
    const payload = JSON.parse(decompressFromUTF16(entry.data));
    return [key, { at: entry.at, data: key.startsWith("query-snapshot:") ? { data: payload, checkedAt: entry.checkedAt } : payload }];
  });
};

function fixture(t) {
  const saved = new Map();
  const storage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) };
  let time = Date.now() - 1000;
  const start = ({ token = "private-login-token", role = "admin", userId = "account-a", backend = "https://api.example/api", fingerprint, customStorage } = {}) => {
    const data = createSessionData({ now: () => time });
    const cache = createBrowserPageCache({ sessionData: data, storage: customStorage || (() => storage), backend: () => backend, now: () => time, ...(fingerprint ? { fingerprint } : {}) });
    t.after(() => cache.dispose());
    data.begin(token, role);
    const config = { url: "/admin/clusters", params: { period: "30d" }, sessionToken: token, sessionEpoch: data.epoch() };
    return { data, cache, config, verify: () => cache.restore({ token, role, userId }) };
  };
  const warm = async instance => {
    await instance.verify();
    await instance.data.run(instance.config, async () => ({ status: 200, data: { reports: [{ id: "cached-report" }], clustering: { clusters: [] } } }));
    instance.cache.flush();
  };
  return { saved, start, warm, advance: ms => { time += ms; } };
}

test("Ctrl+R restores filter-matched data only after verification, without storing credentials", async t => {
  const f = fixture(t), original = f.start();
  await f.warm(original);
  const serialized = f.saved.get(TAB_PAGE_CACHE_KEY);
  assert.ok(serialized);
  assert.equal(serialized.includes("private-login-token"), false);
  const refreshed = f.start();
  const key = querySnapshotKey("/admin/clusters", { period: "30d" });
  assert.equal(refreshed.data.get(key), undefined, "never hydrate before a successful server session check");
  assert.equal(refreshed.cache.verified(), false);
  await refreshed.verify();
  assert.equal(refreshed.cache.verified(), true);
  assert.equal(refreshed.data.get(key).data.reports[0].id, "cached-report");
  assert.equal(refreshed.data.get(querySnapshotKey("/admin/clusters", { period: "7d" })), undefined);
  assert.equal(refreshed.data.fresh(refreshed.config), false, "display snapshots must not pretend a new server check occurred");
});

test("ordinary raw-page caches also survive a browser refresh", async t => {
  const f = fixture(t), original = f.start();
  await original.verify();
  await original.data.run({ ...original.config, url: "/admin/dashboard", params: undefined }, async () => ({ status: 200, data: { reports: [{ id: "ready" }] } }));
  original.cache.flush();
  const refreshed = f.start();
  await refreshed.verify();
  assert.equal(refreshed.data.get("api:/admin/dashboard").reports[0].id, "ready");
});

test("large already-loaded report pages survive reload instead of being evicted by small background results", async t => {
  const f = fixture(t), original = f.start();
  await original.verify();
  const payload = { reports: Array.from({ length: 640 }, (_, id) => ({ id: String(id), details: "Loaded report details. ".repeat(100) })) };
  assert.ok(JSON.stringify(payload).length > 1000000);
  await original.data.run({ ...original.config, url: "/admin/dashboard", params: undefined }, async () => ({ status: 200, data: payload }));
  await original.data.run({ ...original.config, url: "/admin/notifications", params: undefined }, async () => ({ status: 200, data: { notifications: [] } }));
  original.cache.flush();
  const refreshed = f.start();
  await refreshed.verify();
  assert.equal(refreshed.data.get("api:/admin/dashboard")?.reports.length, 640);
  assert.equal(refreshed.data.get(querySnapshotKey("/admin/dashboard"))?.data.reports.length, 640);
});

test("browser restoration works without secure-context Web Crypto", async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined });
  try {
    const f = fixture(t);
    await f.warm(f.start());
    const refreshed = f.start();
    await refreshed.verify();
    assert.equal(refreshed.data.get(querySnapshotKey("/admin/clusters", { period: "30d" }))?.data.reports[0].id, "cached-report");
  } finally { Object.defineProperty(globalThis, "crypto", descriptor); }
});

for (const changed of [{ userId: "account-b" }, { role: "super_admin" }, { token: "another-login" }, { backend: "https://other.example/api" }]) {
  test(`saved pages never cross a different ${Object.keys(changed)[0]}`, async t => {
    const f = fixture(t);
    await f.warm(f.start());
    const refreshed = f.start(changed);
    await refreshed.verify();
    assert.equal(refreshed.data.get(querySnapshotKey("/admin/clusters", { period: "30d" })), undefined);
  });
}

test("logout clears the tab snapshot synchronously and late work cannot recreate it", async t => {
  const f = fixture(t), original = f.start();
  await f.warm(original);
  original.data.reset("logout");
  assert.equal(f.saved.has(TAB_PAGE_CACHE_KEY), false);
  original.cache.flush();
  assert.equal(f.saved.has(TAB_PAGE_CACHE_KEY), false);
});

test("logout while computing the verified cache scope cannot restore old pages", async t => {
  const f = fixture(t);
  await f.warm(f.start());
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const refreshed = f.start({ fingerprint: () => pending });
  const restore = refreshed.verify();
  refreshed.data.reset("logout");
  release("late-scope");
  assert.equal(await restore, false);
  assert.equal(refreshed.cache.verified(), false);
  assert.equal(f.saved.has(TAB_PAGE_CACHE_KEY), false);
});

test("access denial and mutations remove affected persisted snapshots immediately", async t => {
  const f = fixture(t), original = f.start();
  await f.warm(original);
  await assert.rejects(original.data.run({ ...original.config, cacheMode: "network" }, async () => { throw { response: { status: 403 } }; }));
  assert.equal(JSON.stringify(storedEntries(f.saved.get(TAB_PAGE_CACHE_KEY))).includes("cached-report"), false);
  await f.warm(original);
  original.data.invalidate({ paths: ["/admin/clusters"] });
  assert.equal(JSON.stringify(storedEntries(f.saved.get(TAB_PAGE_CACHE_KEY))).includes("cached-report"), false);
});

test("expired, malformed or oversized tab storage safely falls back to normal loading", async t => {
  const f = fixture(t);
  await f.warm(f.start());
  f.advance(TAB_PAGE_CACHE_MAX_AGE_MS);
  const expired = f.start();
  await expired.verify();
  assert.equal(expired.data.pageEntries().length, 0);
  for (const corrupt of ["not json", "x".repeat(1000001), JSON.stringify({ version: 1, entries: [null] })]) {
    f.saved.set(TAB_PAGE_CACHE_KEY, corrupt);
    const refreshed = f.start();
    await refreshed.verify();
    assert.equal(refreshed.data.pageEntries().length, 0);
  }
});

test("blocked storage and failed scope computation never block authenticated pages", async t => {
  const f = fixture(t);
  const blocked = f.start({ customStorage: () => { throw new Error("blocked"); } });
  assert.equal(await blocked.verify(), true);
  blocked.cache.flush();
  const noCrypto = f.start({ fingerprint: async () => null });
  await f.warm(noCrypto);
  assert.equal(noCrypto.cache.verified(), true);
  assert.equal(f.saved.has(TAB_PAGE_CACHE_KEY), false, "do not persist a cache with an unbound identity");
});

test("restoration ignores non-page records and time-expired forecasts", async t => {
  const f = fixture(t), original = f.start();
  await f.warm(original);
  const saved = JSON.parse(f.saved.get(TAB_PAGE_CACHE_KEY));
  saved.entries = storedEntries(f.saved.get(TAB_PAGE_CACHE_KEY));
  saved.version = 1; // Also exercise migration from the previous uncompressed format.
  const old = saved.savedAt - 6 * 60 * 1000;
  saved.entries.push(
    null,
    ["api:/session", { data: { authorization: "must-not-restore" }, at: saved.savedAt }],
    ["api:/admin/risk-outlook", { data: { forecast: { count: 4 } }, at: old }],
    [querySnapshotKey("/admin/risk-outlook"), { data: { data: { forecast: { count: 4 } }, checkedAt: old }, at: old }],
  );
  f.saved.set(TAB_PAGE_CACHE_KEY, JSON.stringify(saved));
  const refreshed = f.start();
  await refreshed.verify();
  assert.equal(refreshed.data.get("api:/session"), undefined);
  assert.equal(refreshed.data.get("api:/admin/risk-outlook"), undefined);
  assert.equal(refreshed.data.get(querySnapshotKey("/admin/risk-outlook")), undefined);
  assert.ok(refreshed.data.get(querySnapshotKey("/admin/clusters", { period: "30d" })));
});

test("role layouts gate child mounting behind server verification on web", () => {
  for (const group of ["(admin)", "(sadmin)", "(tabs)"]) {
    const layout = readFileSync(new URL(`../../clients/app/${group}/_layout.jsx`, import.meta.url), "utf8");
    assert.match(layout, /<BrowserSessionGate>/);
  }
  const auth = readFileSync(new URL("../../clients/services/auth.js", import.meta.url), "utf8");
  assert.ok(auth.indexOf('apiClient.get("/session"') < auth.indexOf("await hydrateCache({ token"));
  assert.ok(auth.indexOf("await hydrateCache({ token") < auth.indexOf("void prefetchAllData()"));
});
