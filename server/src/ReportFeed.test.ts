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
  t.mock.method(supabaseAdmin, "rpc", (async (name: string, args: any) => {
    if (name === "report_engagement_counts") return { data: args.p_ids.map((id: string) => ({ id, comments: 1, likes: 1, is_liked: true })), error: null };
    if (name === "feed_safety_reports") return { data: [], error: null };
    assert.equal(name, "feed_page");
    for (const [column, value, operator] of [["created_at", args.p_from, "gte"], ["created_at", args.p_to, "lte"]]) {
      if (value) filters.push({ table: "feed_page", column, value, operator });
    }
    const selected = reports.filter(row => (!args.p_owner || row.user_id === args.p_owner) && (!args.p_from || row.created_at >= args.p_from) && (!args.p_to || row.created_at <= args.p_to));
    return { data: { items: selected.slice(0, 11).map(row => ({ id: row.id, created_at: row.created_at, source: "User" })), total: selected.length, statusCounts: {} }, error: null };
  }) as never);
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
        if (table === "reports") conditions.push(row => values.includes(row.id));
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
  assert.equal(batches.length, 9);
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
    assert.equal(output.body.reports.length, 10);
    assert.equal(output.body.total, count);
    assert.ok(batches.slice(start).every(batch => batch.ids.every(id => Number(id.split("-")[1]) % 3 < (period === "24h" ? 1 : 2))));
  }
  for (const table of ["feed_page"]) {
    assert.equal(filters.filter(filter => filter.table === table && filter.operator === "gte").length, 2);
    assert.equal(filters.filter(filter => filter.table === table && filter.operator === "lte").length, 2);
  }
});

test("Home defaults to 24 hours and rejects unsupported or unbounded windows", async t => {
  mockFeed(t);
  let r = response();
  await getReports({ query: {}, user: { id: "viewer" } } as unknown as Request, r.res);
  assert.equal(r.output.body.reports.length, 10);
  assert.equal(r.output.body.total, 75);
  for (const period of ["all", "30d", ["24h", "7d"]]) {
    r = response();
    await getReports({ query: { period } } as unknown as Request, r.res);
    assert.equal(r.output.status, 400);
  }
});

test("My Reports uses the authenticated account, never a supplied owner ID", async t => {
  const list = t.mock.method(reportService, "listFeedPage", async () => ({ data: { reports: [], posts: [], order: [], total: 0, statusCounts: {}, hasMore: false, nextCursor: null }, error: null }));
  const { output, res } = response();
  await getMyReports({ query: { user_id: "other-user" }, user: { id: "viewer" } } as unknown as Request & { user: User }, res);
  assert.equal(output.status, 200);
  assert.equal(list.mock.calls[0]?.arguments[0], "viewer");
  assert.equal(list.mock.calls[0]?.arguments[1]?.userId, "viewer");
  const denied = response();
  await getMyReports({ query: {} } as Request, denied.res);
  assert.equal(denied.output.status, 401);
});

test("no recent admin announcements is an empty feed, not a load failure", async t => {
  mockFeed(t);
  const { output, res } = response();
  await getReports({ query: { period: "24h" }, user: { id: "viewer" } } as unknown as Request, res);
  assert.equal(output.status, 200);
  assert.deepEqual(output.body.posts, []);
  assert.equal(output.body.hasMore, true);
});

test("pagination database failures are not disguised as a successful empty page", async t => {
  t.mock.method(supabaseAdmin, "rpc", async () => ({ data: null, error: { message: "Database unavailable" } }) as never);
  const { output, res } = response();
  await getReports({ query: { period: "24h" }, user: { id: "viewer" } } as unknown as Request, res);
  assert.equal(output.status, 500);
  assert.equal(output.body.error, "Database unavailable");
});
