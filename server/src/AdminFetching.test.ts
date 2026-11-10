import "dotenv/config";
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Request, Response } from "express";
import { supabaseAdmin } from "./config/supabaseAdmin.js";
import { profileService } from "./services/authService.js";
import { reportService } from "./services/reportService.js";
import { loadAdminOverview } from "./services/adminFetchService.js";
import { compileValidationGroups, loadValidationGroups, validationReport } from "./services/validationGroupsService.js";
import { getAdminOverview, getAdminMapReports, getAdminReportDetails, getValidationGroups } from "./controllers/adminFetchController.js";

type Row = Record<string, unknown>;
const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const baseRow = (i: number): Row => ({ id: uuid(i), user_id: null, incident_type_id: "theft", role: "user", location: "Lamacan, Argao",
  latitude: 9.8784487, longitude: 123.5950192, status: "Pending Review", is_verified: false, created_at: "2026-11-09T10:00:00Z", details: `Narrative ${i}`, poster_name: "Reporter" });

function database(t: TestContext, tables: Record<string, Row[]>, options: { cap?: number; failCount?: boolean; failTable?: string; declaredTotal?: number } = {}) {
  const calls: { table: string; fields?: string; head?: boolean; range?: number[]; limit?: number }[] = [];
  t.mock.method(supabaseAdmin, "from", ((table: string) => {
    const call: typeof calls[number] = { table }; calls.push(call);
    const filters: ((row: Row) => boolean)[] = [];
    const orders: { column: string; ascending: boolean }[] = [];
    const builder = {
      select(fields: string, config?: { head?: boolean }) { call.fields = fields; call.head = config?.head ?? false; return builder; },
      eq(key: string, value: unknown) { filters.push(row => row[key] === value); return builder; },
      neq(key: string, value: unknown) { filters.push(row => row[key] !== value); return builder; },
      in(key: string, values: unknown[]) {
        filters.push(row => key === "report_credibility_analysis.severity"
          ? (tables.report_credibility_analysis || []).some(a => a.report_id === row.id && values.includes(a.severity)) : values.includes(row[key]));
        return builder;
      },
      not(key: string, operator: string, value: unknown) {
        filters.push(row => operator === "is" ? row[key] != null : !String(value).slice(1, -1).split(",").includes(String(row[key]))); return builder;
      },
      or() { filters.push(row => row.is_verified === true || row.status === "Resolved"); return builder; },
      gte(key: string, value: string) { filters.push(row => String(row[key]) >= value); return builder; },
      lte(key: string, value: string) { filters.push(row => String(row[key]) <= value); return builder; },
      lt(key: string, value: string) { filters.push(row => String(row[key]) < value); return builder; },
      order(column: string, config: { ascending: boolean }) { orders.push({ column, ...config }); return builder; },
      range(from: number, to: number) { call.range = [from, to]; return builder; },
      limit(limit: number) { call.limit = limit; return builder; },
      then(resolve: (value: unknown) => unknown) {
        if (options.failTable === table || options.failCount && call.head) return Promise.resolve(resolve({ data: null, count: null, error: { message: "database failed" } }));
        const rows = (tables[table] || []).filter(row => filters.every(filter => filter(row))).sort((a, b) => {
          for (const order of orders) {
            const compared = String(a[order.column]).localeCompare(String(b[order.column]));
            if (compared) return order.ascending ? compared : -compared;
          }
          return 0;
        });
        const from = call.range?.[0] || 0;
        const size = Math.min(options.cap ?? 1000, call.limit ?? (call.range ? call.range[1]! - from + 1 : 1000));
        // Simulate actual select projection: missing payload fields must not be
        // accidentally available just because a test fixture contains them.
        const selected = String(call.fields).split(",").map(key => key.trim());
        const data = rows.slice(from, from + size).map(row => Object.fromEntries(Object.entries(row).filter(([key]) => selected.includes(key))));
        return Promise.resolve(resolve({ data: call.head ? null : data,
          count: table === "reports" && options.declaredTotal !== undefined ? options.declaredTotal : rows.length, error: null }));
      },
    };
    return builder;
  }) as never);
  return calls;
}
const response = () => {
  const output = { status: 200, body: {} as Record<string, unknown>, headers: {} as Record<string, unknown> };
  const res = { status(code: number) { output.status = code; return this; }, json(body: Record<string, unknown>) { output.body = body; return this; },
    setHeader(key: string, value: unknown) { output.headers[key] = value; return this; } } as unknown as Response;
  return { output, res };
};
const request = (query = {}) => ({ user: { id: "admin" }, query }) as unknown as Request;
const day = { dayStart: "2026-11-09T00:00:00Z", dayEnd: "2026-11-10T00:00:00Z" };

test("dashboard uses complete database counts, but hydrates only twelve recent feed rows", async t => {
  const reports = Array.from({ length: 1205 }, (_, i) => ({ ...baseRow(i), status: i < 5 ? "Archived" : i < 10 ? "Resolved" : "Pending Review" }));
  const calls = database(t, { reports, report_credibility_analysis: [{ report_id: uuid(20), severity: "High", ai_score: 90 }] });
  const result = await loadAdminOverview({ superAdmin: false, ...day });
  assert.equal(result.summary.total, 1200);
  assert.equal(result.summary.pending, 1195);
  assert.equal(result.summary.verified, 5);
  assert.equal(result.summary.hotspots, 1);
  assert.equal(result.reports.length, 12);
  assert.equal(calls.find(call => call.table === "reports" && !call.head)?.limit, 12);
  assert.equal(calls.some(call => ["report_comments", "report_images", "audit_logs"].includes(call.table)), false);
  assert.equal("management" in result, false);
  assert.equal("details" in result.reports[0]!, false);
});

test("super-admin overview uses independent management counts and only five activity rows", async t => {
  const calls = database(t, { reports: [baseRow(1)], profiles: [
    { id: "a", role: "admin", status: "Active" }, { id: "b", role: "admin", status: "Disabled" },
    { id: "s", role: "super_admin", status: "Active" }, { id: "u", role: "user", status: "Disabled" },
  ], audit_logs: Array.from({ length: 80 }, (_, i) => ({ id: String(i), created_at: "2026-11-09T10:00:00Z", title: "Activity" })) });
  const result = await loadAdminOverview({ superAdmin: true, ...day });
  assert.ok("management" in result);
  assert.deepEqual(result.management, { activeAdmins: 1, admins: 2, superAdmins: 1, disabled: 1, logsToday: 80 });
  assert.equal(result.logs.length, 5);
  assert.equal(calls.find(call => call.table === "audit_logs" && !call.head)?.limit, 5);
});

test("failed summary counts fail explicitly rather than return zero", async t => {
  database(t, { reports: [baseRow(1)] }, { failCount: true });
  await assert.rejects(loadAdminOverview({ superAdmin: false, ...day }), /database failed/);
});

test("map reads follow smaller database caps and never fetch narratives, images, comments or sentiment", async t => {
  const calls = database(t, { reports: Array.from({ length: 1205 }, (_, i) => baseRow(i)) }, { cap: 137 });
  t.mock.method(profileService, "getProfile", async () => ({ data: { role: "admin" }, error: null }));
  const { output, res } = response();
  await getAdminMapReports(request(), res);
  assert.equal(output.status, 200);
  const reports = output.body.reports as Row[];
  assert.equal(reports.length, 1205);
  assert.equal(new Set(reports.map(report => report.id)).size, 1205);
  assert.equal(output.body.complete, true);
  assert.equal(calls.some(call => ["report_comments", "report_images", "sentiment_analysis", "profiles"].includes(call.table)), false);
  assert.equal(calls.filter(call => call.table === "reports").every(call => !call.fields?.includes("details")), true);
  assert.equal("comments" in reports[0]!, false);
  assert.ok(output.headers["Server-Timing"]);
});

test("oversized/incomplete snapshots fail closed instead of reporting partial map counts", async t => {
  database(t, { reports: [baseRow(1)] }, { declaredTotal: 50001 });
  const result = await reportService.getAdminDashboard({ mode: "map", allPages: true });
  assert.equal(result.data, null);
  assert.match(result.error!, /no partial/);
});

test("report inspection paginates busy comment threads and retains every image", async t => {
  database(t, { reports: [baseRow(1)], report_comments: Array.from({ length: 1301 }, (_, i) => ({ id: uuid(2000 + i), report_id: uuid(1),
    content: `Comment ${i}`, created_at: "2026-11-09T12:00:00Z", user_id: null })),
    report_images: [{ report_id: uuid(1), image_url: "https://example.test/evidence.jpg" }] }, { cap: 137 });
  const result = await reportService.getAdminDashboard({ ids: [uuid(1)], includeArchived: true });
  assert.equal(result.error, null);
  assert.equal(result.data?.reports[0]?.comments.length, 1301);
  assert.equal(result.data?.reports[0]?.images.length, 1);
  assert.equal(result.data?.reports[0]?.details, "Narrative 1");
});

test("new endpoints independently enforce admin roles and validate before accessing report data", async t => {
  const load = t.mock.method(reportService, "getAdminDashboard", async () => { throw new Error("Must not load reports"); });
  for (const endpoint of [getAdminOverview, getAdminMapReports, getAdminReportDetails, getValidationGroups]) {
    let result = response();
    await endpoint({ query: {} } as Request, result.res);
    assert.equal(result.output.status, 401);
    t.mock.method(profileService, "getProfile", async () => ({ data: { role: "user" }, error: null }));
    result = response();
    await endpoint(request(), result.res);
    assert.equal(result.output.status, 403);
  }
  t.mock.method(profileService, "getProfile", async () => ({ data: { role: "admin" }, error: null }));
  for (const query of [{ ids: "not-a-uuid" }, { ids: Array(51).fill(uuid(1)).join(",") }, { ids: [uuid(1)] }]) {
    const result = response(); await getAdminReportDetails(request(query), result.res); assert.equal(result.output.status, 400);
  }
  for (const query of [{ page: "0" }, { pageSize: "51" }, { page: ["1"] }, { timeZone: "Invalid/Zone" }, { from: "bad" }]) {
    const result = response(); await getValidationGroups(request(query), result.res); assert.equal(result.output.status, 400);
  }
  const result = response(); await getAdminOverview(request({ dayStart: "invalid" }), result.res); assert.equal(result.output.status, 400);
  assert.equal(load.mock.callCount(), 0);
});

test("whole-group pagination preserves off-page totals, notification targets and complete exports", async t => {
  const raw = await (async () => {
    database(t, { reports: Array.from({ length: 25 }, (_, i) => baseRow(i)) });
    const result = await reportService.getAdminDashboard();
    return result.data!.reports;
  })();
  const reports = raw.map((report, i) => ({ ...report, incident_type: `Type ${Math.floor(i / 2)}`, details: `Export narrative ${i}` }));
  t.mock.method(reportService, "getAdminDashboard", async () => ({ data: { reports, summary: { total: 25, pending: 25, verified: 0, rejected: 0, hotspots: 0 } }, error: null }));
  const first = await loadValidationGroups({ page: 1, pageSize: 10, timeZone: "Asia/Manila", focusReport: reports[24]!.id });
  const second = await loadValidationGroups({ page: 2, pageSize: 10, timeZone: "Asia/Manila" });
  assert.equal(first.totalGroups, 13); assert.equal(first.stats.totalReports, 25); assert.equal(first.groups.length, 10);
  assert.equal(second.groups.length, 3); assert.equal(second.stats.totalReports, 25);
  assert.equal(first.groups[0]!.reportCount, 2);
  assert.equal(first.focusedGroup?.reports[0]?.id, reports[24]!.id);
  assert.equal(first.groups[0]!.reports[0]!.details, "");
  const exported = await loadValidationGroups({ page: 1, pageSize: 10, timeZone: "Asia/Manila", exportAll: true });
  assert.equal(exported.groups.flatMap(group => group.reports).length, 25);
  assert.match(exported.groups[0]!.reports[0]!.details, /Export narrative/);
  const ids = [...first.groups, ...second.groups].flatMap(group => group.reports.map(report => report.id));
  assert.equal(new Set(ids).size, 25);
});

test("compilation respects calendar dates, severity and status boundaries", async t => {
  database(t, { reports: [baseRow(1)] });
  const result = await reportService.getAdminDashboard();
  const raw = result.data!.reports[0]!;
  const reports = [
    { ...raw, created_at: "2026-11-09T23:30:00Z", severity: "Low" },
    { ...raw, id: uuid(2), created_at: "2026-11-09T10:00:00Z", severity: "Critical" },
    { ...raw, id: uuid(3), created_at: "2026-11-07T10:00:00Z" },
    { ...raw, id: uuid(4), status: "Resolved", created_at: "2026-11-09T10:00:00Z" },
  ].map(report => validationReport(report, "Asia/Manila"));
  const groups = compileValidationGroups(reports);
  assert.equal(groups.length, 3); assert.equal(groups[0]!.reportCount, 2); assert.equal(groups[0]!.severity, "Critical");
  assert.equal(groups[2]!.status, "Resolved");
});
