import "../helpers/serverEnvironment.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, Response } from "express";
import { backtestMethods, buildRiskOutlook, forecastDailySeries, OUTLOOK_POLICY, predictReportCounts, utcDay, type HistoryReport } from "../../server/src/services/riskOutlookService.js";
import { syntheticOutlookEvaluation } from "../../server/scripts/riskOutlook/syntheticEvaluation.js";
import { getRiskOutlook } from "../../server/src/controllers/riskOutlookController.js";
import { profileService } from "../../server/src/services/authService.js";
import { reportService } from "../../server/src/services/reportService.js";
import { riskOutlookHistory } from "../../server/src/services/riskOutlookHistory.js";
import { supabaseAdmin } from "../../server/src/config/supabaseAdmin.js";

const DAY = 86400000;
const now = Date.parse("2026-10-22T12:00:00Z");
const end = utcDay(now);
const date = (time: number) => new Date(time).toISOString().slice(0, 10);
const series = { startDate: date(end - 160 * DAY), counts: Array<number>(160).fill(3) };
const target = date(end + DAY);
const history: HistoryReport[] = Array.from({ length: 160 }, (_, i) => ({
  id: `report-${i}`, created_at: new Date(end - (160 - i) * DAY + 3600000).toISOString(),
  status: i % 2 ? "Resolved" : "Pending Review", location: "Carlock Street, Argao", latitude: 9.8816, longitude: 123.5953,
}));

test("constant history produces submitted-report counts, a baseline comparison and a nonzero error band", () => {
  const forecast = forecastDailySeries(series, target);
  assert.equal(forecast.status, "available");
  if (forecast.status !== "available") return;
  assert.equal(forecast.method, "historical_average", "tie favors the simpler baseline");
  assert.equal(forecast.expectedReports, 21);
  assert.equal(forecast.baselineExpectedReports, 21);
  assert.deepEqual(forecast.daily.map((row) => row.expectedReports), Array(7).fill(3));
  assert.deepEqual([forecast.range.lower, forecast.range.upper], [20, 22]);
  assert.equal(forecast.range.calibratedConfidenceInterval, false);
  assert.equal(forecast.evaluation.selectedMae, 0);
});

test("backtests have chronological training prefixes, a one-day gap and non-overlapping target weeks", () => {
  for (const result of backtestMethods(series)) {
    assert.equal(result.folds.length, 6);
    for (const [i, fold] of result.folds.entries()) {
      assert.equal((Date.parse(fold.targetStartDate) - Date.parse(fold.trainingEndDate)) / DAY, 2);
      if (i) assert.equal((Date.parse(fold.targetStartDate) - Date.parse(result.folds[i - 1]!.targetStartDate)) / DAY, 7);
    }
  }
  assert.throws(() => predictReportCounts(series, series.startDate, "recent_weekday"), /overlaps/);
});

test("sparse, short and stale histories explicitly refuse forecasts rather than claim zero risk", () => {
  const short = forecastDailySeries({ ...series, counts: Array(21).fill(3) }, target);
  assert.equal(short.status, "insufficient_data");
  assert.equal("expectedReports" in short, false);
  const sparse = forecastDailySeries({ ...series, counts: Array.from({ length: 160 }, (_, i) => i === 159 ? 1 : 0) }, target);
  assert.equal(sparse.status, "insufficient_data");
  const stale = forecastDailySeries({ ...series, counts: Array.from({ length: 160 }, (_, i) => i < 100 ? 3 : 0) }, target);
  assert.equal(stale.status, "insufficient_data");
  assert.throws(() => forecastDailySeries({ ...series, counts: [-1] }, target), /Invalid/);
  assert.throws(() => forecastDailySeries({ startDate: "invalid", counts: [] }, target), /Invalid/);
  assert.equal(OUTLOOK_POLICY.minimumHistoryDays, 112);
});

test("resolved history remains included; rejected/archived/fake, future, partial today and outside-boundary records do not", () => {
  const extra = (id: string, values: Partial<HistoryReport>) => ({ ...history[159]!, id, ...values });
  const result = buildRiskOutlook([
    ...history, history[0]!, extra("archived", { status: "Archived" }), extra("rejected", { status: "Rejected" }), extra("fake", { status: "Marked Fake" }),
    extra("today", { created_at: new Date(now).toISOString() }), extra("future", { created_at: new Date(now + DAY).toISOString() }),
    extra("outside", { latitude: 14.6, longitude: 120.98 }),
  ], { now, barangay: "Lamacan" });
  assert.equal(result.stats.reports, 160);
  assert.equal(result.stats.historyDays, 160);
  assert.equal(result.status, "available");
  assert.deepEqual(result.excluded, { duplicateIds: 1, status: 3, date: 2, location: 1, otherBarangay: 0 });
  if (result.status === "available") assert.equal(result.targetStartDate, "2026-10-23");
  assert.equal(buildRiskOutlook(history, { now, barangay: "Tulic" }).status, "insufficient_data");
  assert.throws(() => buildRiskOutlook(history, { now, barangay: "Carlock Street" }), /Invalid barangay/);
});

test("forecast fitting is independent of sentiment/severity and only sees earlier rows", () => {
  const a = buildRiskOutlook(history, { now });
  const b = buildRiskOutlook(history.map((row) => ({ ...row, sentiment: "negative", severity: "Critical" })), { now });
  assert.deepEqual(a, b);
  const c = buildRiskOutlook([...history, { ...history[0]!, id: "later", created_at: "2027-01-01T00:00:00Z" }], { now });
  assert.equal(c.status, "available");
  if (a.status === "available" && c.status === "available") assert.deepEqual(a.daily, c.daily);
});

test("synthetic chronological evaluation is deterministic and keeps short/sparse/gapped series gated", () => {
  const result = syntheticOutlookEvaluation();
  assert.deepEqual(syntheticOutlookEvaluation(), result);
  assert.notDeepEqual(syntheticOutlookEvaluation(42), result);
  assert.ok(result.summary.scoredWeeks > 0);
  for (const name of ["short-history", "sparse", "reporting-gap"]) assert.equal(result.scenarios.find((row) => row.name === name)!.gateStatus, "insufficient_data");
  for (const scene of result.scenarios) for (const fold of scene.folds) {
    if (fold.status === "available") assert.ok(Date.parse(fold.trainingEndDate!) < Date.parse(fold.targetStartDate));
  }
});

const response = () => {
  const output = { status: 200, body: {} as Record<string, unknown> };
  const res = { status(code: number) { output.status = code; return this; }, json(body: Record<string, unknown>) { output.body = body; return this; } } as unknown as Response;
  return { output, res };
};
test("outlook endpoint requires admin access and validates barangays before querying", async (t) => {
  let result = response();
  await getRiskOutlook({} as Request, result.res);
  assert.equal(result.output.status, 401);
  t.mock.method(profileService, "getProfile", async () => ({ data: { role: "user" }, error: null }));
  result = response();
  await getRiskOutlook({ user: { id: "u" } } as unknown as Request, result.res);
  assert.equal(result.output.status, 403);
  t.mock.method(profileService, "getProfile", async () => ({ data: { role: "admin" }, error: null }));
  const load = t.mock.method(riskOutlookHistory, "load", async () => { throw new Error("must not query"); });
  result = response();
  await getRiskOutlook({ user: { id: "u" }, query: { barangay: "fake" } } as unknown as Request, result.res);
  assert.equal(result.output.status, 400);
  assert.equal(load.mock.callCount(), 0);
});

test("history read errors do not get converted into a misleading successful forecast", async (t) => {
  t.mock.method(profileService, "getProfile", async () => ({ data: { role: "admin" }, error: null }));
  t.mock.method(reportService, "getAdminDashboard", async () => ({ data: { reports: [], summary: {} }, error: null }));
  t.mock.method(riskOutlookHistory, "load", async () => ({ data: null, error: "database unavailable" }));
  const { output, res } = response();
  await getRiskOutlook({ user: { id: "u" }, query: {} } as unknown as Request, res);
  assert.equal(output.status, 200);
  assert.equal((output.body.forecast as { status: string }).status, "unavailable");
  assert.equal((output.body.current as { activeReportCount: number }).activeReportCount, 0);
});

test("endpoint keeps active indicators separate from resolved historical submissions", async (t) => {
  t.mock.method(Date, "now", () => now);
  t.mock.method(profileService, "getProfile", async () => ({ data: { role: "admin" }, error: null }));
  const active = { ...history.at(-1)!, id: "active", status: "Pending Review", severity: "High", ai_score: 80, is_verified: false,
    sentiment: "negative", sentiment_status: "succeeded", sentiment_confidence: 0.9, sentiment_language: "cebuano", comments: [] };
  t.mock.method(reportService, "getAdminDashboard", async () => ({ data: { reports: [active, { ...active, id: "unrated", ai_score: null, severity: "Medium" }, { ...active, id: "resolved", status: "Resolved" }], summary: {} }, error: null }));
  t.mock.method(riskOutlookHistory, "load", async () => ({ data: history, error: null }));
  const { output, res } = response();
  await getRiskOutlook({ user: { id: "u" }, query: { barangay: "Lamacan" } } as unknown as Request, res);
  assert.equal(output.status, 200);
  assert.equal((output.body.reports as unknown[]).length, 2);
  const current = output.body.current as { activeReportCount: number; severity: Record<string, number>; evidence: { reports: { usable: number } } };
  assert.equal(current.activeReportCount, 2);
  assert.equal(current.severity.High, 1);
  assert.equal(current.severity.Unknown, 1, "missing analysis must not fabricate Medium severity");
  assert.equal(current.evidence.reports.usable, 2);
  assert.equal((output.body.forecast as { stats: { reports: number } }).stats.reports, 160);
});

test("forecast history explicitly paginates and retains resolved statuses", async (t) => {
  const pages: number[][] = [];
  const exclusions: string[] = [];
  const from = () => {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "gte", "lt", "order"]) builder[method] = () => builder;
    builder.neq = (_column: string, status: string) => { exclusions.push(status); return builder; };
    builder.range = async (start: number, end: number) => {
      pages.push([start, end]);
      return { data: start === 0 ? Array.from({ length: 1000 }, (_, i) => ({ ...history[0], id: String(i), status: "Resolved" })) : [{ ...history[0], id: "last", status: "Resolved" }], error: null, count: 1001 };
    };
    return builder;
  };
  t.mock.method(supabaseAdmin, "from", from as unknown as typeof supabaseAdmin.from);
  const result = await riskOutlookHistory.load(now);
  assert.equal(result.error, null);
  assert.equal(result.data?.length, 1001);
  assert.deepEqual(pages, [[0, 999], [1000, 1999]]);
  assert.equal(exclusions.includes("Resolved"), false);
  assert.equal(exclusions.includes("Archived"), true);
});

test("history size limits fail closed instead of forecasting from the first pages", async (t) => {
  const from = () => {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "gte", "lt", "order", "neq"]) builder[method] = () => builder;
    builder.range = async () => ({ data: Array.from({ length: 1000 }, (_, i) => ({ ...history[0], id: String(i) })), error: null, count: 50001 });
    return builder;
  };
  t.mock.method(supabaseAdmin, "from", from as unknown as typeof supabaseAdmin.from);
  const result = await riskOutlookHistory.load(now);
  assert.equal(result.data, null);
  assert.match(result.error!, /no partial forecast/);
});

test("smaller database page caps are followed and incomplete reads never look successful", async (t) => {
  const offsets: number[] = [];
  let truncated = false;
  const from = () => {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "gte", "lt", "order", "neq"]) builder[method] = () => builder;
    builder.range = async (start: number) => {
      offsets.push(start);
      return { data: start === 0 ? history.slice(0, 2) : truncated ? [] : history.slice(2, 3), count: 3, error: null };
    };
    return builder;
  };
  t.mock.method(supabaseAdmin, "from", from as unknown as typeof supabaseAdmin.from);
  const complete = await riskOutlookHistory.load(now);
  assert.equal(complete.data?.length, 3);
  assert.deepEqual(offsets, [0, 2]);
  truncated = true;
  const incomplete = await riskOutlookHistory.load(now);
  assert.equal(incomplete.data, null);
  assert.match(incomplete.error!, /truncated/);
});
