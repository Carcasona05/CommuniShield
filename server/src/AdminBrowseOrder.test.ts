import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeBrowseCursor, loadAdminBrowsePage } from "./services/adminBrowseService.js";
import { supabaseAdmin } from "./config/supabaseAdmin.js";

const cursor = { created_at: "2030-01-01T12:00:00.123456+00:00", kind: "Incident", id: "00000000-0000-4000-8000-000000000001",
  priority: { version: 1, status_rank: 0, severity_rank: 1, sort_time: "1893499200.123456" } };
const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

test("priority cursors preserve exact sort keys across backend and database requests", async t => {
  assert.deepEqual(decodeBrowseCursor(encoded(cursor)), cursor);
  const rpc = t.mock.method(supabaseAdmin, "rpc", (async () => ({ data: {
    items: [{ id: cursor.id }], total: 30, stats: {}, hasMore: true, cursor,
  }, error: null })) as never);
  const page = await loadAdminBrowsePage({ view: "records", page: 2, pageSize: 10, cursor });
  const args = rpc.mock.calls[0]!.arguments as unknown as [string, Record<string, unknown>];
  assert.deepEqual(args[1].p_before_sort, cursor.priority);
  assert.equal(args[1].p_before_time, cursor.created_at);
  assert.deepEqual(decodeBrowseCursor(page.nextCursor!), cursor);
});

test("invalid priority cursor keys fail before database execution", () => {
  for (const priority of [null, {}, { ...cursor.priority, version: 2 }, { ...cursor.priority, status_rank: -1 },
    { ...cursor.priority, severity_rank: 5 }, { ...cursor.priority, sort_time: "NaN" }, { ...cursor.priority, sort_time: 1893499200 }]) {
    assert.throws(() => decodeBrowseCursor(encoded({ ...cursor, priority })), /Invalid record cursor/);
  }
});

test("obsolete record cursors must be refreshed, while chronological log cursors remain valid", async t => {
  const { priority, ...oldCursor } = cursor;
  const rpc = t.mock.method(supabaseAdmin, "rpc", (async () => ({ data: { items: [], total: 0, stats: {}, hasMore: false }, error: null })) as never);
  await assert.rejects(loadAdminBrowsePage({ view: "records", page: 2, pageSize: 10, cursor: oldCursor }), /Refresh/);
  assert.equal(rpc.mock.callCount(), 0);
  await loadAdminBrowsePage({ view: "logs", page: 2, pageSize: 10, cursor: oldCursor });
  assert.equal(rpc.mock.callCount(), 1);
  const args = rpc.mock.calls[0]!.arguments as unknown as [string, Record<string, unknown>];
  assert.equal(args[1].p_before_sort, null);
});

test("record service defaults to Admin and forces user records to Incident before SQL/export", async t => {
  const rpc = t.mock.method(supabaseAdmin, "rpc", (async () => ({ data: { items: [], total: 0, stats: {}, hasMore: false }, error: null })) as never);
  await loadAdminBrowsePage({ view: "records", page: 1, pageSize: 10 });
  await loadAdminBrowsePage({ view: "records", page: 1, pageSize: 10, actorRole: "user", kind: "Announcement", exportAll: true });
  await loadAdminBrowsePage({ view: "logs", page: 1, pageSize: 10 });
  const args = rpc.mock.calls.map(call => (call.arguments as unknown as [string, Record<string, unknown>])[1]);
  assert.equal(args[0]!.p_actor_role, "admin");
  assert.equal(args[1]!.p_actor_role, "user");
  assert.equal(args[1]!.p_kind, "Incident");
  assert.equal(args[1]!.p_export, true);
  assert.equal(args[2]!.p_actor_role, null);
});
