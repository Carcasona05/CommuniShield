import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, Response } from "express";
import { createAnalysisSnapshots } from "./services/analysisSnapshots.js";
import { adminAnalysisJobs } from "./services/adminAnalysisJobs.js";
import { backgroundTasks } from "./services/backgroundTasks.js";
import { profileService } from "./services/authService.js";
import { supabaseAdmin } from "./config/supabaseAdmin.js";
import { validateReport } from "./controllers/reportController.js";
import { enqueueAdminAnalysis, getAdminAnalysisProgress } from "./controllers/adminAnalysisController.js";
const id = "00000000-0000-4000-8000-000000000001";
const response = () => {
  const output = { status: 200, body: {} as Record<string, unknown>, headers: {} as Record<string, unknown> };
  const res = { status(code: number) { output.status = code; return this; }, json(body: typeof output.body) { output.body = body; return this; },
    setHeader(key: string, value: unknown) { output.headers[key] = value; } } as unknown as Response;
  return { output, res };
};
test("status responds after atomic save without waiting for notifications or AI", async t => {
  t.mock.method(profileService, "getProfile", async () => ({ data: { role: "admin", fullname: "Ada" }, error: null }));
  const save = t.mock.method(adminAnalysisJobs, "saveStatus", async () => ({ id, status: "Archived", is_verified: false, jobId: id }));
  const tasks: (() => Promise<void>)[] = [];
  t.mock.method(backgroundTasks, "schedule", (_name: string, task: () => Promise<void>) => { tasks.push(task); return Promise.resolve(); });
  const result = response();
  await validateReport({ user: { id }, params: { id }, body: { status: "Archived", is_verified: true } } as unknown as Request, result.res);
  assert.equal(result.output.status, 200); assert.equal(result.output.body.is_verified, false); assert.equal(result.output.body.followup, "queued");
  assert.equal(save.mock.calls[0]!.arguments[4], false); assert.equal(tasks.length, 1); assert.ok(result.output.headers["Server-Timing"]);
});
test("failed status commit is not reported as saved and does not schedule follow-up", async t => {
  t.mock.method(profileService, "getProfile", async () => ({ data: { role: "admin" }, error: null }));
  t.mock.method(adminAnalysisJobs, "saveStatus", async () => { throw new Error("Database unavailable"); });
  const schedule = t.mock.method(backgroundTasks, "schedule", () => Promise.resolve());
  const result = response();
  await validateReport({ user: { id }, params: { id }, body: { status: "Resolved" } } as unknown as Request, result.res);
  assert.equal(result.output.status, 503); assert.equal(schedule.mock.callCount(), 0);
});
test("queue endpoints authorize and reject invalid IDs before enqueueing", async t => {
  const queued = t.mock.method(adminAnalysisJobs, "enqueue", async () => id);
  let result = response(); await enqueueAdminAnalysis({ body: { reportIds: [id] } } as Request, result.res); assert.equal(result.output.status, 401);
  t.mock.method(profileService, "getProfile", async () => ({ data: { role: "user" }, error: null }));
  result = response(); await enqueueAdminAnalysis({ user: { id }, body: { reportIds: [id] } } as unknown as Request, result.res); assert.equal(result.output.status, 403);
  t.mock.method(profileService, "getProfile", async () => ({ data: { role: "admin" }, error: null }));
  for (const reportIds of [[], ["bad"], Array(51).fill(id), "bad"]) {
    result = response(); await enqueueAdminAnalysis({ user: { id }, body: { reportIds } } as unknown as Request, result.res); assert.equal(result.output.status, 400);
  }
  assert.equal(queued.mock.callCount(), 0);
});
test("queue responds 202 before any AI call; progress never claims failed work completed successfully", async t => {
  t.mock.method(profileService, "getProfile", async () => ({ data: { role: "super_admin" }, error: null }));
  const queued = t.mock.method(adminAnalysisJobs, "enqueue", async () => id);
  const run = t.mock.method(backgroundTasks, "schedule", () => Promise.resolve());
  let result = response();
  await enqueueAdminAnalysis({ user: { id }, body: { reportIds: [id, id] } } as unknown as Request, result.res);
  assert.equal(result.output.status, 202); assert.equal(result.output.body.state, "queued");
  assert.deepEqual(queued.mock.calls[0]!.arguments[1], [id]); assert.equal(run.mock.callCount(), 1);
  t.mock.method(adminAnalysisJobs, "progress", async () => ({ id, state: "failed", done: 3, total: 3, failed: 1, reports: [] }));
  result = response(); await getAdminAnalysisProgress({ user: { id }, params: { id } } as unknown as Request, result.res);
  assert.equal(result.output.body.state, "failed"); assert.equal(result.output.headers["Cache-Control"], "no-store");
});
test("worker fences completion by lease token and retries failures only three times", async t => {
  let attempt = 2;
  t.mock.method(supabaseAdmin, "rpc", (async () => ({ data: [{ id, kind: "credibility", subject_id: id, report_id: id, lease_token: "lease", attempts: attempt, payload: {} }], error: null })) as never);
  t.mock.method(adminAnalysisJobs, "perform", async () => { throw new Error("Provider timeout"); });
  const writes: Record<string, unknown>[] = [], filters: unknown[][] = [];
  t.mock.method(supabaseAdmin, "from", (() => {
    const builder = { update(value: Record<string, unknown>) { writes.push(value); return builder; },
      eq(...args: unknown[]) { filters.push(args); return builder; },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve(resolve({ error: null })); } };
    return builder;
  }) as never);
  await adminAnalysisJobs.drain(1); assert.equal(writes[0]!.state, "queued");
  attempt = 3; await adminAnalysisJobs.drain(1); assert.equal(writes[1]!.state, "failed");
  assert.ok(filters.some(([key, value]) => key === "lease_token" && value === "lease"));
});
test("analysis snapshots coalesce builds, retain stale success and isolate account/filter keys", async t => {
  let now = 100000, calls = 0;
  const cache = createAnalysisSnapshots(() => now);
  const load = async () => { calls++; return { reports: ["real report"] }; };
  const [a, b] = await Promise.all([cache.read("admin:a:30d", load), cache.read("admin:a:30d", load)]);
  assert.equal(calls, 1); assert.equal(a.value, b.value);
  await cache.read("admin:b:30d", load); await cache.read("admin:a:7d", load); assert.equal(calls, 3);
  let finish: (() => void) | undefined;
  const held = new Promise<void>(done => { finish = done; });
  const tasks: Promise<void>[] = [];
  t.mock.method(backgroundTasks, "schedule", (_name: string, task: () => Promise<void>) => { const promise = task().catch(() => {}); tasks.push(promise); return promise; });
  now += 61000;
  const stale = await cache.read("admin:a:30d", async () => { await held; return { reports: ["updated report"] }; });
  assert.deepEqual(stale.value.reports, ["real report"]); assert.equal(stale.snapshot.refreshing, true);
  finish!(); await Promise.all(tasks);
  assert.deepEqual((await cache.read("admin:a:30d", load)).value.reports, ["updated report"]);
  cache.invalidate(); await cache.read("admin:a:30d", load); assert.equal(calls, 4);
});
test("cache never publishes a late pre-mutation computation or caches a failed cold read", async () => {
  const cache = createAnalysisSnapshots();
  let finish: (() => void) | undefined;
  const held = new Promise<void>(done => { finish = done; });
  const pending = cache.read("admin", async () => { await held; return { count: 99 }; });
  cache.invalidate(); finish!(); await assert.rejects(pending, /inputs changed/);
  await assert.rejects(cache.read("admin", async () => { throw new Error("database failed"); }), /database failed/);
  assert.equal((await cache.read("admin", async () => ({ count: 3 }))).value.count, 3);
});
