import "dotenv/config";
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Request, Response } from "express";
import { sentimentService } from "./services/sentimentService.js";
import { supabaseAdmin } from "./config/supabaseAdmin.js";
import { reanalyzeSentiment } from "./controllers/aiController.js";
import { profileService } from "./services/authService.js";
import { reportService } from "./services/reportService.js";

function mockComments(t: TestContext, rows: { id: string; report_id: string }[], fail = false) {
  const queries: { ids: string[]; from: number; to: number }[] = [];
  t.mock.method(supabaseAdmin, "from", (table: string) => {
    assert.equal(table, "report_comments");
    let ids: string[] = [];
    const query = {
      select() { return query; }, order() { return query; },
      in(column: string, values: string[]) { assert.equal(column, "report_id"); ids = values; return query; },
      async range(from: number, to: number) {
        queries.push({ ids, from, to });
        return fail ? { data: null, error: { message: "offline" } }
          : { data: rows.filter(row => ids.includes(row.report_id)).slice(from, to + 1), error: null };
      },
    };
    return query as never;
  });
  const analyze = t.mock.method(sentimentService, "analyzeMany", async () => ({}));
  return { queries, analyze };
}

test("report reanalysis refreshes every related comment regardless of its previous label", async t => {
  const { analyze } = mockComments(t, [{ id: "old-neutral", report_id: "selected" }, { id: "old-positive", report_id: "selected" },
    { id: "new-comment", report_id: "selected" }, { id: "unrelated", report_id: "other" }]);
  const result = await sentimentService.reanalyzeReportsWithComments(["selected", "selected"]);
  assert.equal(result.commentCount, 3);
  assert.deepEqual(analyze.mock.calls.map(call => call.arguments), [
    ["report", ["selected"], { force: true }],
    ["comment", ["old-neutral", "old-positive", "new-comment"], { force: true }],
  ]);
});

test("long threads load every comment page instead of silently stopping at the database limit", async t => {
  const rows = Array.from({ length: 1201 }, (_, i) => ({ id: `comment-${i}`, report_id: "selected" }));
  const { queries, analyze } = mockComments(t, rows);
  const result = await sentimentService.reanalyzeReportsWithComments(["selected"]);
  assert.equal(result.commentCount, 1201);
  assert.equal(queries.length, 3);
  assert.equal(analyze.mock.calls[1]?.arguments[1]?.length, 1201);
});

test("large report groups use bounded ID queries", async t => {
  const ids = Array.from({ length: 201 }, (_, i) => `report-${i}`);
  const { queries } = mockComments(t, ids.map(report_id => ({ id: `comment-${report_id}`, report_id })));
  const result = await sentimentService.reanalyzeReportsWithComments(ids);
  assert.equal(result.commentCount, 201);
  assert.equal(queries.length, 3);
  assert.ok(queries.every(query => query.ids.length <= 100));
});

test("comment lookup failures cannot be reported as successful complete thread reanalysis", async t => {
  const { analyze } = mockComments(t, [], true);
  await assert.rejects(sentimentService.reanalyzeReportsWithComments(["selected"]), /Could not load report comments/);
  assert.equal(analyze.mock.callCount(), 0);
});

test("reports with no comments still reanalyze normally", async t => {
  mockComments(t, []);
  const result = await sentimentService.reanalyzeReportsWithComments(["selected"]);
  assert.equal(result.commentCount, 0);
  assert.deepEqual(result.commentResults, {});
});

test("the report endpoint returns separate report and comment analysis results", async t => {
  t.mock.method(profileService, "getProfile", async () => ({ data: { role: "admin" }, error: null }) as never);
  const query = { select() { return query; }, eq() { return query; }, limit() { return query; }, in: async () => ({ data: [], error: null }) };
  t.mock.method(supabaseAdmin, "from", () => query as never);
  const thread = t.mock.method(sentimentService, "reanalyzeReportsWithComments", async () => ({
    results: { report: { label: "neutral", status: "succeeded" } },
    commentResults: { comment: { label: "negative", status: "succeeded" } }, commentCount: 1,
  }) as never);
  t.mock.method(reportService, "insertAuditLog", async () => ({ error: null }) as never);
  let body: any;
  const res = { json(value: unknown) { body = value; return this; }, status(code: number) { assert.equal(code, 200); return this; } } as unknown as Response;
  await reanalyzeSentiment({ user: { id: "admin" }, params: { type: "report", id: "37a733f2-fdcd-4ae7-8d84-b6ed9bbd8102" } } as unknown as Request & { user: { id: string } }, res);
  assert.equal(thread.mock.callCount(), 1);
  assert.equal(body.results.report.label, "neutral");
  assert.equal(body.commentResults.comment.label, "negative");
  assert.equal(body.commentCount, 1);
});
