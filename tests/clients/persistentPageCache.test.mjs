import assert from "node:assert/strict";
import { test } from "node:test";
import { createSessionData } from "../../clients/services/sessionData.js";
import { createPersistentPageCache, createPreviewStorage, safePagePreview, PERSISTED_TTL_MS } from "../../clients/services/persistentPageCache.js";

const summary = { total: 57, pending: 20, verified: 30, rejected: 7, hotspots: 2 };
function fixture(storage, time = Date.parse("2026-10-26T12:00:00Z")) {
  const memory = createSessionData({ now: () => time });
  const persistent = createPersistentPageCache({ memory, storage, now: () => time });
  memory.begin("secret-token", "admin");
  const identity = { userId: "user-a", role: "admin", apiUrl: "https://api.example/api" };
  const fetch = (path, data) => memory.run({ url: path, method: "get", sessionToken: "secret-token", sessionEpoch: memory.epoch(), cacheMode: "network" }, async () => ({ status: 200, data }));
  return { memory, persistent, identity, fetch, advance: value => { time += value; } };
}
function storageFixture() {
  const records = new Map();
  return { records,
    read: async scope => structuredClone(records.get(scope)),
    replace: async record => { records.clear(); records.set(record.scope, structuredClone(record)); },
    clear: async () => records.clear(),
  };
}

test("allowlist persists only numeric overview counts and the incident catalog, never sensitive fields", () => {
  assert.deepEqual(safePagePreview("/admin/overview", { summary: { ...summary, password: "secret" }, reports: [{ details: "private" }] }, "admin"), { summary });
  assert.equal(safePagePreview("/admin/overview", { summary }, "user"), null);
  for (const path of ["/profile", "/reports", "/admin/dashboard", "/admin/accounts", "/admin/logs", "/admin/blotters", "/sentiment/datasets", "/sentiment/training"]) {
    assert.equal(safePagePreview(path, { token: "secret", summary }, "super_admin"), null);
  }
  assert.deepEqual(safePagePreview("/incidents/options", { categories: [{ category: "Safety", types: ["Theft"], contact: "private" }] }, "admin"),
    { categories: [{ category: "Safety", types: ["Theft"] }] });
});

test("fresh authorized data saves without tokens; reload restores preview only after activation", async () => {
  const storage = storageFixture(), first = fixture(storage);
  await first.persistent.activate(first.identity);
  await first.fetch("/admin/overview", { summary, reports: [{ details: "private" }] });
  await first.persistent.flush();
  assert.doesNotMatch(JSON.stringify([...storage.records.values()]), /secret-token|private|reports/);
  first.persistent.dispose(); // A document reload does not mean logout.
  const next = fixture(storage);
  assert.equal(next.memory.get("preview:/admin/overview"), undefined);
  await next.persistent.activate(next.identity);
  assert.deepEqual(next.memory.get("preview:/admin/overview").summary, summary);
  assert.equal(next.memory.get("api:/admin/overview"), undefined, "saved data must never masquerade as a live response");
  await next.fetch("/admin/overview", { summary: { ...summary, total: 58 } });
  assert.equal(next.memory.get("preview:/admin/overview"), undefined);
  await next.persistent.flush();
  assert.equal([...storage.records.values()][0].pages[0].data.summary.total, 58);
});

test("identity, role, backend scope and expiry prevent restoring another user's preview", async () => {
  for (const scenario of ["user", "role", "backend", "expired", "midnight"]) {
    const storage = storageFixture(), original = fixture(storage, Date.parse("2026-10-26T23:59:00Z"));
    await original.persistent.activate(original.identity);
    await original.fetch("/admin/overview", { summary }); await original.persistent.flush(); original.persistent.dispose();
    const next = fixture(storage, Date.parse("2026-10-26T23:59:00Z"));
    const identity = { ...next.identity };
    if (scenario === "user") identity.userId = "other-user";
    if (scenario === "backend") identity.apiUrl = "https://other.example/api";
    if (scenario === "role") { identity.role = "super_admin"; next.memory.begin("other-token", "super_admin"); }
    if (scenario === "expired") next.advance(PERSISTED_TTL_MS);
    if (scenario === "midnight") next.advance(61000);
    await next.persistent.activate(identity);
    assert.equal(next.memory.get("preview:/admin/overview"), undefined, scenario);
  }
});

test("logout and mutation clear disk and prevent delayed reads/writes from republishing old data", async () => {
  const storage = storageFixture(), f = fixture(storage);
  await f.persistent.activate(f.identity);
  await f.fetch("/admin/overview", { summary }); await f.persistent.flush();
  f.memory.invalidate(); await f.persistent.flush();
  assert.equal(storage.records.size, 0);
  await f.fetch("/admin/overview", { summary });
  f.memory.reset(); await f.persistent.flush();
  assert.equal(storage.records.size, 0);
  let release;
  const slow = fixture({ ...storage, read: () => new Promise(done => { release = done; }) });
  const restoring = slow.persistent.activate(slow.identity);
  await Promise.resolve(); await Promise.resolve();
  slow.memory.reset();
  release({ version: 1, scope: JSON.stringify([slow.identity.apiUrl, slow.identity.userId, slow.identity.role]), pages: [{ path: "/admin/overview", data: { summary }, checkedAt: Date.parse("2026-10-26T12:00:00Z") }] });
  await restoring;
  assert.equal(slow.memory.get("preview:/admin/overview"), undefined);
});

test("corrupt, unavailable and unsupported storage do not block authenticated use", async () => {
  const unsupported = createPreviewStorage({ indexedDB: undefined });
  assert.equal(await unsupported.read("x"), null);
  await unsupported.clear();
  const corrupt = {}; corrupt.self = corrupt;
  for (const read of [async () => { throw new Error("Private mode"); }, async () => corrupt]) {
    const f = fixture({ read, replace: async () => { throw new Error("quota"); }, clear: async () => {} });
    await f.persistent.activate(f.identity);
    assert.equal(f.memory.get("preview:/admin/overview"), undefined);
    await f.fetch("/admin/overview", { summary });
    await f.persistent.flush();
    assert.deepEqual(f.memory.get("api:/admin/overview"), { summary });
  }
});

test("cache restoration budget is bounded when storage never responds", { timeout: 1000 }, async () => {
  const f = fixture({ read: () => new Promise(() => {}), replace: async () => {}, clear: async () => {} });
  const start = performance.now();
  await f.persistent.activate(f.identity);
  assert.ok(performance.now() - start < 700);
});
