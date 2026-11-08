import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, Response } from "express";
import { decodeFeedCursor, encodeFeedCursor } from "./utils/feedCursor.js";
import { reportService } from "./services/reportService.js";
import { supabaseAdmin } from "./config/supabaseAdmin.js";
import { addComment, getComments, getMyReports } from "./controllers/reportController.js";
import { backgroundTasks } from "./services/backgroundTasks.js";
import { commentSentimentJobs } from "./services/commentSentimentJobs.js";
import { sentimentService } from "./services/sentimentService.js";

const id = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const response = () => {
  const output = { status: 200, body: null as any };
  const res = { status(value: number) { output.status = value; return this; }, json(body: unknown) { output.body = body; return this; } } as unknown as Response;
  return { output, res };
};

test("cursors retain microseconds and reject malformed/injected IDs and timestamps", () => {
  const row = { id: id(1), created_at: "2026-11-08T10:00:00.123456+00:00", source: "User" as const };
  assert.deepEqual(decodeFeedCursor(encodeFeedCursor(row)), row);
  for (const value of [[], "bad", "x".repeat(513), encodeFeedCursor({ ...row, id: "id),status.eq.Archived" }), encodeFeedCursor({ ...row, created_at: "now()" })]) {
    assert.throws(() => decodeFeedCursor(value), /Invalid pagination cursor/);
  }
});

test("My Reports ignores supplied owner IDs and preserves global status counts", async t => {
  const list = t.mock.method(reportService, "listFeedPage", async () => ({ data: { reports: [], posts: [], order: [], total: 15, statusCounts: { "All Status": 35, "Pending Review": 15 }, hasMore: true, nextCursor: "next" }, error: null }));
  const { output, res } = response();
  await getMyReports({ user: { id: "owner" }, query: { user_id: "other", status: "Pending Review" } } as unknown as Request, res);
  assert.equal(output.status, 200);
  assert.deepEqual(list.mock.calls[0]?.arguments, ["owner", { userId: "owner", status: "Pending Review", cursor: null }]);
  assert.equal(output.body.statusCounts["All Status"], 35);
});

test("feed hydration touches at most ten selected keys and not the lookahead row", async t => {
  const keys = Array.from({ length: 11 }, (_, i) => ({ id: id(i), created_at: "2026-11-08T10:00:00.123456Z", source: i % 2 ? "Admin" : "User" }));
  t.mock.method(supabaseAdmin, "rpc", async () => ({ data: { items: keys, total: 100, statusCounts: {} }, error: null }) as never);
  const reports = t.mock.method(reportService, "listReports", async () => ({ data: [], error: null }));
  const posts = t.mock.method(reportService, "listAdminPosts", async () => ({ data: [], error: null }));
  const result = await reportService.listFeedPage("owner");
  assert.equal(result.data?.total, 100); assert.equal(result.data?.hasMore, true);
  assert.deepEqual(decodeFeedCursor(result.data?.nextCursor), keys[9]);
  assert.equal(reports.mock.calls[0]?.arguments[1]?.ids?.length, 5);
  assert.equal(posts.mock.calls[0]?.arguments[0]?.ids?.length, 5);
  assert.equal(result.data?.order.length, 10);
});

test("comment pages fetch eleven bounded rows but return ten with the total of 100", async t => {
  const calls: { table: string; select?: string; limit?: number; cursor?: string; head?: boolean }[] = [];
  t.mock.method(supabaseAdmin, "from", ((table: string) => {
    const call: typeof calls[number] = { table }; calls.push(call);
    const query = {
      select(fields: string, options?: { head?: boolean }) { call.select = fields; call.head = options?.head ?? false; return query; },
      eq() { return query; }, in() { return query; }, is() { return query; }, order() { return query; },
      limit(value: number) { call.limit = value; return query; },
      or(value: string) { call.cursor = value; return query; },
      then(resolve: (value: unknown) => unknown) {
        const data = call.head ? null : table === "report_comments" ? Array.from({ length: 11 }, (_, i) => ({ id: id(100 - i), user_id: "owner", content: `Comment ${100 - i}`, created_at: "2026-11-08T10:00:00.123456Z" })) : [];
        return Promise.resolve(resolve({ data, count: 100, error: null }));
      },
    }; return query;
  }) as never);
  const result = await reportService.listComments(id(999));
  assert.equal(result.data?.length, 10); assert.equal(result.total, 100); assert.equal(result.hasMore, true);
  assert.equal(result.data?.[0]?.id, id(91)); assert.equal(result.data?.at(-1)?.id, id(100));
  assert.deepEqual(decodeFeedCursor(result.nextCursor), { id: id(91), created_at: "2026-11-08T10:00:00.123456Z" });
  assert.equal(calls.find(call => call.table === "report_comments" && !call.head)?.limit, 11);
  assert.ok(calls.some(call => call.head && call.select === "id"));
  await reportService.listComments(id(999), decodeFeedCursor(result.nextCursor));
  assert.match(calls.find(call => call.cursor)?.cursor || "", /created_at\.lt\.2026-11-08T10:00:00\.123456Z/);
});

test("invalid comment cursors return 400 before any database work", async t => {
  const query = t.mock.method(reportService, "listComments", async () => { throw new Error("Should not query"); });
  const { output, res } = response();
  await getComments({ params: { id: id(1) }, query: { cursor: "bad" } } as unknown as Request, res);
  assert.equal(output.status, 400); assert.equal(query.mock.callCount(), 0);
});

test("comment submission returns the persisted comment while analysis is blocked", async t => {
  const comment = { id: id(1), text: "Test", datePosted: new Date().toISOString(), user: "User", sentiment: null, sentiment_status: "pending" };
  t.mock.method(reportService, "addComment", async () => ({ data: id(1), comment, total: 100 }));
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const worker = t.mock.method(commentSentimentJobs, "drain", async () => held);
  const tracked: Promise<void>[] = [];
  t.mock.method(backgroundTasks, "schedule", (_name: string, task: () => Promise<void>) => { const work = task(); tracked.push(work); return work; });
  const { output, res } = response();
  try {
    await addComment({ user: { id: "owner" }, params: { id: id(2) }, body: { content: "Test" } } as unknown as Request, res);
    assert.equal(output.status, 201); assert.deepEqual(output.body.comment, comment);
    assert.equal(output.body.total, 100); assert.equal(output.body.sentiment_status, "pending");
    assert.equal(worker.mock.callCount(), 1);
  } finally { release(); await Promise.all(tracked); }
});

test("failed comment writes do not schedule analysis", async t => {
  t.mock.method(reportService, "addComment", async () => ({ error: "Daily limit reached" }));
  const schedule = t.mock.method(backgroundTasks, "schedule", async () => {});
  const { output, res } = response();
  await addComment({ user: { id: "owner" }, params: { id: id(2) }, body: { content: "Test" } } as unknown as Request, res);
  assert.equal(output.status, 400); assert.equal(schedule.mock.callCount(), 0);
});

test("worker retains failed jobs for retry and fences updates with the lease token", async t => {
  t.mock.method(supabaseAdmin, "rpc", async () => ({ data: [{ comment_id: id(1), lease_token: id(2), attempts: 1 }], error: null }) as never);
  t.mock.method(sentimentService, "analyze", async () => { throw new Error("Model unavailable"); });
  let changes: any, conditions: any[] = [];
  t.mock.method(supabaseAdmin, "from", (() => {
    const query = { update(value: unknown) { changes = value; return query; }, eq(...args: unknown[]) { conditions.push(args); return query; }, then(resolve: (value: unknown) => unknown) { return Promise.resolve(resolve({ error: null })); } };
    return query;
  }) as never);
  await commentSentimentJobs.drain(1);
  assert.equal(changes.completed_at, null); assert.match(changes.last_error, /Model unavailable/);
  assert.ok(Date.parse(changes.available_at) > Date.now());
  assert.deepEqual(conditions, [["comment_id", id(1)], ["lease_token", id(2)]]);
});

test("opening one report hydrates only that report instead of loading the entire feed", async t => {
  const list = t.mock.method(reportService, "listReports", async () => ({ data: [], error: null }));
  await reportService.getReportById("viewer", id(1));
  assert.deepEqual(list.mock.calls[0]?.arguments, ["viewer", { ids: [id(1)] }]);
});

test("a saved comment remains successful when optional profile/count lookups reject", async t => {
  t.mock.method(supabaseAdmin, "from", ((table: string) => {
    let head = false;
    const query = {
      select(_fields: string, options?: { head?: boolean }) { head = options?.head ?? false; return query; },
      eq() { return query; }, insert() { return query; },
      maybeSingle: async () => {
        if (table === "profiles") throw new Error("Profile temporarily unavailable");
        return { data: table === "reports" ? { id: id(1) } : { id: id(2), content: "Saved", created_at: "2026-11-08T10:00:00Z" }, error: null };
      },
      then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
        return (head ? Promise.reject(new Error("Count temporarily unavailable")) : Promise.resolve({ data: [], error: null })).then(resolve, reject);
      },
    }; return query;
  }) as never);
  const result = await reportService.addComment("owner", id(1), "Saved");
  assert.equal(result.error, undefined); assert.equal(result.data, id(2)); assert.equal(result.total, null);
  assert.equal(result.comment?.text, "Saved"); assert.equal(result.comment?.user, "User");
});
