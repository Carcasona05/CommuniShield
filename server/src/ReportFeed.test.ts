import "dotenv/config";
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { supabaseAdmin } from "./config/supabaseAdmin.js";
import { reportService } from "./services/reportService.js";
import { getReports, getMyReports } from "./controllers/reportController.js";
import type { Request, Response } from "express";
import type { User } from "@supabase/supabase-js";

function mockFeed(t: TestContext, failTable = "") {
  const reports = Array.from({ length: 225 }, (_, i) => ({
    id: `report-${i}`, user_id: i % 2 ? "other-user" : "viewer", incident_type_id: "incident",
    status: "Pending Review", created_at: new Date(Date.now() - [12, 72, 240][i % 3]! * 3600000).toISOString(), details: "A reported incident",
  }));
  const batches: { table: string; ids: string[] }[] = [];
  const filters: { table: string; column: string; value: string; operator: string }[] = [];
  t.mock.method(supabaseAdmin, "from", (table: string) => {
    let ids: string[] = [];
    const conditions: ((row: (typeof reports)[number]) => boolean)[] = [];
    const query = {
      select() { return query; }, neq() { return query; }, order() { return query; },
      eq(column: string, value: string) {
        filters.push({ table, column, value, operator: "eq" });
        if (table === "reports") conditions.push(row => row[column as keyof typeof row] === value);
        return query;
      },
      gte(column: string, value: string) {
        filters.push({ table, column, value, operator: "gte" });
        if (table === "reports") conditions.push(row => row.created_at >= value);
        return query;
      },
      lte(column: string, value: string) {
        filters.push({ table, column, value, operator: "lte" });
        if (table === "reports") conditions.push(row => row.created_at <= value);
        return query;
      },
      in(_column: string, values: string[]) {
        ids = values;
        batches.push({ table, ids });
        assert.ok(ids.length <= 100, "Relation queries must stay below proxy URL limits");
        return query;
      },
      then(resolve: (result: unknown) => unknown) {
        if (table === failTable) return Promise.resolve(resolve({ data: null, error: { message: "Database unavailable" } }));
        let data: unknown[];
        switch (table) {
          case "incident_types": data = [{ id: "incident", name: "Fire", incident_categories: [{ name: "Safety" }] }]; break;
          case "reports": data = reports.filter(row => conditions.every(condition => condition(row))); break;
          case "admin_announcement": data = []; break;
          case "report_credibility_analysis": data = ids.map(report_id => ({ report_id, ai_score: 75, severity: "High" })); break;
          case "sentiment_analysis": data = ids.map(subject_id => ({ subject_id, status: "succeeded", label: "negative", confidence: 0.9 })); break;
          case "report_images": data = ids.map(report_id => ({ report_id, image_url: `https://example.test/${report_id}.jpg` })); break;
          case "report_likes": data = ids.map(report_id => ({ report_id, user_id: "viewer" })); break;
          case "report_comments": data = ids.map(report_id => ({ report_id })); break;
          default: throw new Error(`Unexpected table: ${table}`);
        }
        return Promise.resolve(resolve({ data, error: null }));
      },
    };
    return query as never;
  });
  return { reports, batches, filters };
}

test("large Home feeds batch all report relations and retain enrichment", async t => {
  const { batches } = mockFeed(t);
  const result = await reportService.listReports("viewer");
  assert.equal(result.error, null);
  assert.equal(result.data?.length, 225);
  assert.equal(batches.length, 15);
  const last = result.data!.at(-1)!;
  assert.equal(last.incident_type, "Fire");
  assert.equal(last.severity, "High");
  assert.equal(last.sentiment, "negative");
  assert.equal(last.likes, 1);
  assert.equal(last.comments, 1);
  assert.equal(last.is_liked, true);
  assert.equal(last.images.length, 1);
});

test("My Reports remains available for large feeds and only includes the owner", async t => {
  const { batches, filters } = mockFeed(t);
  const result = await reportService.listMyReports("viewer");
  assert.equal(result.error, null);
  assert.equal(result.data?.length, 113);
  assert.ok(result.data?.every(report => report.user_id === "viewer"));
  assert.ok(filters.some(filter => filter.table === "reports" && filter.column === "user_id" && filter.value === "viewer"));
  assert.ok(batches.every(batch => batch.ids.every(id => Number(id.split("-")[1]) % 2 === 0)), "Do not fetch other accounts' related data");
});

test("real database failures are not disguised as an empty feed", async t => {
  mockFeed(t, "report_images");
  const result = await reportService.listReports("viewer");
  assert.equal(result.data, null);
  assert.equal(result.error, "Database unavailable");
});

function response() {
  const output = { status: 200, body: null as any };
  const res = { status(value: number) { output.status = value; return this; }, json(body: unknown) { output.body = body; return this; } } as unknown as Response;
  return { output, res };
}

test("Home filters 24-hour and 7-day windows in the database before loading relations", async t => {
  const { batches, filters } = mockFeed(t);
  for (const [period, count] of [["24h", 75], ["7d", 150]] as const) {
    const { output, res } = response();
    const start = batches.length;
    await getReports({ query: { period }, user: { id: "viewer" } } as unknown as Request & { user: User }, res);
    assert.equal(output.status, 200);
    assert.equal(output.body.reports.length, count);
    assert.ok(batches.slice(start).every(batch => batch.ids.every(id => Number(id.split("-")[1]) % 3 < (period === "24h" ? 1 : 2))));
  }
  for (const table of ["reports", "admin_announcement"]) {
    assert.equal(filters.filter(filter => filter.table === table && filter.operator === "gte").length, 2);
    assert.equal(filters.filter(filter => filter.table === table && filter.operator === "lte").length, 2);
  }
});

test("Home defaults to 24 hours and rejects unsupported or unbounded windows", async t => {
  mockFeed(t);
  let r = response();
  await getReports({ query: {} } as Request, r.res);
  assert.equal(r.output.body.reports.length, 75);
  for (const period of ["all", "30d", ["24h", "7d"]]) {
    r = response();
    await getReports({ query: { period } } as unknown as Request, r.res);
    assert.equal(r.output.status, 400);
  }
});

test("My Reports uses the authenticated account, never a supplied owner ID", async t => {
  const list = t.mock.method(reportService, "listMyReports", async () => ({ data: [], error: null }));
  const { output, res } = response();
  await getMyReports({ query: { user_id: "other-user" }, user: { id: "viewer" } } as unknown as Request & { user: User }, res);
  assert.equal(output.status, 200);
  assert.equal(list.mock.calls[0]?.arguments[0], "viewer");
  const denied = response();
  await getMyReports({ query: {} } as Request, denied.res);
  assert.equal(denied.output.status, 401);
});

test("no recent admin announcements is an empty feed, not a load failure", async t => {
  mockFeed(t);
  const { output, res } = response();
  await getReports({ query: { period: "24h" } } as unknown as Request, res);
  assert.equal(output.status, 200);
  assert.deepEqual(output.body.posts, []);
  assert.equal(output.body.postsUnavailable, false);
});

test("real announcement database failures still report unavailable content", async t => {
  mockFeed(t, "admin_announcement");
  const { output, res } = response();
  await getReports({ query: { period: "24h" } } as unknown as Request, res);
  assert.equal(output.status, 200);
  assert.equal(output.body.postsUnavailable, true);
  assert.equal(output.body.reports.length, 75);
});
