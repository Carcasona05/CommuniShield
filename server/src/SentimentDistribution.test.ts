import "dotenv/config";
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Request, Response } from "express";
import { supabaseAdmin } from "./config/supabaseAdmin.js";
import { profileService } from "./services/authService.js";
import { buildSentimentTrend, distributionRange, loadSentimentDistribution, summarizeDistribution } from "./services/sentimentDistributionService.js";
import { getSentimentDistribution } from "./controllers/adminFetchController.js";
import { analysisSnapshots } from "./services/analysisSnapshots.js";
type Row = Record<string, unknown>;
const now = Date.parse("2026-11-12T04:00:00Z"); // noon in the Philippines
function database(t: TestContext, tables: Record<string, Row[]>, cap = 500, fail?: string) {
  const calls: { table: string; fields?: string; filters: [string, string, unknown][] }[] = [];
  t.mock.method(supabaseAdmin, "from", ((table: string) => {
    const call: typeof calls[number] = { table, filters: [] }; calls.push(call);
    let start = 0, end = 499;
    const builder = {
      select(fields: string) { call.fields = fields; return builder; },
      neq(key: string, value: unknown) { call.filters.push(["neq", key, value]); return builder; },
      eq(key: string, value: unknown) { call.filters.push(["eq", key, value]); return builder; },
      gte(key: string, value: unknown) { call.filters.push(["gte", key, value]); return builder; },
      lt(key: string, value: unknown) { call.filters.push(["lt", key, value]); return builder; },
      in(key: string, value: unknown) { call.filters.push(["in", key, value]); return builder; },
      order() { return builder; },
      range(from: number, to: number) { start = from; end = to; return builder; },
      then(resolve: (value: unknown) => unknown) {
        if (table === fail) return Promise.resolve(resolve({ data: null, error: { message: "Database failed" }, count: null }));
        const rows = (tables[table] || []).filter(row => {
          if (table === "report_comments" && !tables.reports?.some(parent => parent.id === row.report_id)) return false;
          return call.filters.every(([op, key, value]) => {
            const item = key === "reports.status" ? tables.reports?.find(parent => parent.id === row.report_id)?.status : row[key];
            return op === "eq" ? item === value : op === "neq" ? item !== value : op === "in" ? (value as unknown[]).includes(item)
              : op === "gte" ? String(item) >= String(value) : String(item) < String(value);
          });
        }).sort((a, b) => String(a.id || a.subject_id).localeCompare(String(b.id || b.subject_id)));
        return Promise.resolve(resolve({ data: rows.slice(start, start + Math.min(cap, end - start + 1)), count: rows.length, error: null }));
      },
    };
    return builder;
  }) as never);
  return calls;
}
test("Today, past seven and past thirty days use Philippine boundaries across UTC/month/year changes", () => {
  assert.equal(distributionRange("today", now).from, "2026-11-11T16:00:00.000Z");
  assert.equal(distributionRange("7d", now).from, "2026-11-05T16:00:00.000Z");
  assert.equal(distributionRange("30d", now).from, "2026-10-13T16:00:00.000Z");
  assert.equal(distributionRange("month", now).from, "2026-10-31T16:00:00.000Z", "Legacy clients retain their calendar-month meaning");
  assert.equal(distributionRange("all", now).from, null);
  const midnight = Date.parse("2026-12-31T16:00:00Z");
  assert.equal(distributionRange("today", midnight).day, "2027-01-01");
  assert.equal(distributionRange("30d", midnight).from, "2026-12-02T16:00:00.000Z");
  assert.equal(distributionRange("today", midnight - 1).day, "2026-12-31");
});
test("distribution independently filters report/comment dates and excludes archived parents", async t => {
  const calls = database(t, { reports: [
    { id: "old", status: "Resolved", created_at: "2026-10-01T00:00:00Z" },
    { id: "recent", status: "Pending Review", created_at: "2026-11-12T00:00:00Z" },
    { id: "archived", status: "Archived", created_at: "2026-11-12T00:00:00Z" },
  ], report_comments: [
    { id: "new-comment-old-report", report_id: "old", created_at: "2026-11-12T00:00:00Z" },
    { id: "old-comment-recent-report", report_id: "recent", created_at: "2026-11-01T00:00:00Z" },
    { id: "archived-comment", report_id: "archived", created_at: "2026-11-12T00:00:00Z" },
    { id: "future-comment", report_id: "recent", created_at: "2026-11-13T00:00:00Z" },
  ], sentiment_analysis: [
    { subject_type: "report", subject_id: "old", status: "succeeded", label: "positive" },
    { subject_type: "report", subject_id: "recent", status: "succeeded", label: "neutral" },
    { subject_type: "comment", subject_id: "new-comment-old-report", status: "succeeded", label: "negative" },
    { subject_type: "comment", subject_id: "old-comment-recent-report", status: "succeeded", label: "mixed" },
  ] });
  const today = await loadSentimentDistribution("today", now);
  assert.equal(today.summary.sentimentTotal, 2); assert.equal(today.summary.sentimentAnalyzed, 2);
  assert.equal(today.summary.sentimentDistribution.find(row => row.label === "negative")?.count, 1, "New comments on old reports count today");
  assert.equal((await loadSentimentDistribution("30d", now)).summary.sentimentTotal, 3);
  assert.equal((await loadSentimentDistribution("all", now)).summary.sentimentTotal, 4);
  assert.ok(calls.filter(call => call.table === "report_comments").every(call => !String(call.fields).includes("content")));
});
test("all time counts 700+ reports and 3000+ comments across smaller database caps without narrative downloads", async t => {
  const reports = Array.from({ length: 701 }, (_, i) => ({ id: `r-${String(i).padStart(4, "0")}`, status: "Pending Review", created_at: "2025-01-01T00:00:00Z" }));
  const comments = Array.from({ length: 3007 }, (_, i) => ({ id: `c-${String(i).padStart(4, "0")}`, report_id: reports[i % reports.length]!.id, created_at: "2025-01-01T00:00:00Z" }));
  const sentiments = [...reports.map(row => ({ subject_type: "report", subject_id: row.id, status: "succeeded", label: "positive" })),
    ...comments.map(row => ({ subject_type: "comment", subject_id: row.id, status: "succeeded", label: "negative" }))];
  const calls = database(t, { reports, report_comments: comments, sentiment_analysis: sentiments }, 37);
  const all = await loadSentimentDistribution("all", now);
  assert.equal(all.summary.sentimentTotal, 3708); assert.equal(all.summary.sentimentAnalyzed, 3708);
  assert.equal(all.trend.buckets.reduce((sum, bucket) => sum + bucket.total, 0), 3708);
  assert.equal(all.trend.buckets.reduce((sum, bucket) => sum + bucket.usable, 0), 3708);
  assert.equal(all.summary.sentimentDistribution.find(row => row.label === "negative")?.count, 3007);
  assert.equal(calls.some(call => /details|source_text|content|images/.test(call.fields || "")), false);
});
test("coverage keeps unclear, failed, pending, unavailable and missing separate", () => {
  const summary = summarizeDistribution({ reports: ["a", "b", "c", "d", "e", "f"], comments: [] }, { reports: [
    { subject_id: "a", status: "succeeded", label: "positive" }, { subject_id: "b", status: "succeeded", label: "unclear" },
    { subject_id: "c", status: "failed", label: "negative" }, { subject_id: "d", status: "pending", label: null },
    { subject_id: "e", status: "skipped", label: null },
  ], comments: [] });
  assert.deepEqual(summary.sentimentCoverage, { version: 1, unclear: 1, failed: 1, pending: 1, unavailable: 1, missing: 1 });
  assert.equal(summary.sentimentAnalyzed, 2); assert.equal(summary.sentimentTotal, 6);
  assert.equal(summary.reportCount, 6); assert.equal(summary.commentCount, 0);
  assert.equal(summary.usableCount, 1); assert.equal(summary.positiveShare, 100);
});
test("overview positive share uses usable results, not an inverted health or danger score", () => {
  const summary = summarizeDistribution({ reports: ["positive", "negative", "unclear", "missing"], comments: [] }, { reports: [
    { subject_id: "positive", status: "succeeded", label: "positive" }, { subject_id: "negative", status: "succeeded", label: "negative" },
    { subject_id: "unclear", status: "succeeded", label: "unclear" },
  ], comments: [] });
  assert.equal(summary.positiveShare, 50); assert.equal(summary.usableCount, 2);
  assert.equal(summarizeDistribution({ reports: ["missing"], comments: [] }, { reports: [], comments: [] }).positiveShare, null);
});
test("hourly trend uses actual Philippine creation hours and never fabricates neutral values for gaps", () => {
  const subjects = { reports: [{ id: "r", created_at: "2026-11-11T16:00:00Z" }], comments: [
    { id: "c", created_at: "2026-11-11T16:30:00Z" }, { id: "pending", created_at: "2026-11-11T17:00:00Z" },
    { id: "unclear", created_at: "2026-11-11T17:00:00Z" },
  ] };
  const trend = buildSentimentTrend("today", subjects, { reports: [{ subject_id: "r", status: "succeeded", label: "positive" }], comments: [
    { subject_id: "c", status: "succeeded", label: "negative" }, { subject_id: "pending", status: "pending", label: "neutral" },
    { subject_id: "unclear", status: "succeeded", label: "unclear" },
  ] }, now);
  assert.equal(trend.interval, "hour"); assert.equal(trend.buckets.length, 24);
  assert.equal(trend.buckets[0]!.usable, 2); assert.equal(trend.buckets[0]!.counts.positive, 1); assert.equal(trend.buckets[0]!.counts.negative, 1);
  assert.equal(trend.buckets[1]!.total, 2); assert.equal(trend.buckets[1]!.usable, 0); assert.equal(trend.buckets[1]!.counts.neutral, 0);
  assert.equal(trend.buckets[1]!.unclear, 1); assert.equal(trend.buckets[1]!.withoutResult, 1);
  assert.equal(trend.buckets.at(-1)!.future, true);
});
test("seven/thirty day graphs cover their entire periods and All Time groups all history without truncation", () => {
  const subjects = { reports: [{ id: "old", created_at: "2020-01-01T00:00:00Z" }], comments: [{ id: "new", created_at: "2026-11-12T00:00:00Z" }] };
  const results = { reports: [{ subject_id: "old", status: "succeeded", label: "positive" }], comments: [{ subject_id: "new", status: "succeeded", label: "negative" }] };
  assert.equal(buildSentimentTrend("7d", subjects, results, now).buckets.length, 7);
  assert.equal(buildSentimentTrend("30d", subjects, results, now).buckets.length, 30);
  const all = buildSentimentTrend("all", subjects, results, now);
  assert.equal(all.interval, "month"); assert.ok(all.buckets.length <= 12);
  assert.equal(Date.parse(all.buckets.at(-1)!.end), now + 1, "Current All Time group must not advertise future months");
  assert.equal(all.buckets.reduce((sum, bucket) => sum + bucket.total, 0), 2);
  assert.equal(all.buckets.reduce((sum, bucket) => sum + bucket.usable, 0), 2);
});
test("database errors do not become successful zero distributions", async t => {
  database(t, {}, 500, "report_comments");
  await assert.rejects(loadSentimentDistribution("today", now), /Database failed/);
});
test("endpoint enforces administrator access and validates the card-specific period", async t => {
  analysisSnapshots.invalidate();
  const output = { status: 200, body: {} as Record<string, unknown> };
  const res = { status(code: number) { output.status = code; return this; }, json(value: typeof output.body) { output.body = value; return this; }, setHeader() {} } as unknown as Response;
  const req = (query: Record<string, unknown> = {}) => ({ user: { id: "admin-distribution" }, query }) as unknown as Request;
  await getSentimentDistribution({ query: {} } as Request, res); assert.equal(output.status, 401);
  t.mock.method(profileService, "getProfile", async () => ({ data: { role: "user" }, error: null }));
  await getSentimentDistribution(req(), res); assert.equal(output.status, 403);
  t.mock.method(profileService, "getProfile", async () => ({ data: { role: "admin" }, error: null }));
  for (const period of ["bad", ["today"], { period: "all" }]) {
    await getSentimentDistribution(req({ period }), res); assert.equal(output.status, 400);
  }
  database(t, {}); output.status = 200;
  await getSentimentDistribution(req(), res); assert.equal(output.status, 200); assert.equal(output.body.period, "today");
  for (const period of ["30d", "month"]) {
    output.status = 200;
    await getSentimentDistribution(req({ period }), res);
    assert.equal(output.status, 200); assert.equal(output.body.period, period);
  }
});
