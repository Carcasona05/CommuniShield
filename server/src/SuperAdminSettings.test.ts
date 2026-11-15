import "dotenv/config";
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Request, Response } from "express";
import { getSettings, updateSettings, validateSetting } from "./controllers/settingsController.js";
import { supabaseAdmin } from "./config/supabaseAdmin.js";
import { profileService } from "./services/authService.js";

// In this isolated test process every provider request is mocked; no real key
// or network call is used by the analysis tests.
const previousKey = process.env.GEMINI_API_KEY;
process.env.GEMINI_API_KEY = "offline-settings-test";
const { aiService } = await import("./services/aiService.js");
if (previousKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousKey;
const { adminAnalysisJobs } = await import("./services/adminAnalysisJobs.js");
const retired = ["map_auto_map_verified", "map_cluster_overlay", "map_heatmap_overlay", "map_default_zoom", "map_center", "notification_email", "notification_push", "ai_high_threshold", "ai_medium_threshold"];
const request = (settings = {}) => ({ user: { id: "super-admin" }, body: { settings } }) as unknown as Request;
function response() {
  const output = { status: 200, body: {} as any };
  const res = { status(value: number) { output.status = value; return this; }, json(body: unknown) { output.body = body; return this; } } as unknown as Response;
  return { output, res };
}

test("retired controls are neither returned nor accepted while active settings and Cebuano are retained", async t => {
  for (const key of retired) assert.ok("error" in validateSetting(key, "true"));
  t.mock.method(profileService, "getProfile", (async () => ({ data: { role: "super_admin" } })) as never);
  let writes = 0;
  t.mock.method(supabaseAdmin, "from", (() => ({
    async select() { return { data: [...retired.map(key => ({ key, value: "old" })), { key: "sentiment_cebuano_mode", value: "gemini" }], error: null }; },
    async upsert() { writes++; return { error: null }; },
  })) as never);
  const got = response(); await getSettings(request(), got.res);
  for (const key of retired) assert.equal(key in got.output.body.settings, false);
  assert.equal(got.output.body.settings.sentiment_cebuano_mode, "gemini");
  for (const key of retired) {
    const saved = response(); await updateSettings(request({ [key]: "true" }), saved.res);
    assert.equal(saved.output.status, 400);
  }
  assert.equal(writes, 0);
});

test("a settings save only persists the setting and never starts or awaits AI analysis", async t => {
  t.mock.method(profileService, "getProfile", (async () => ({ data: { role: "super_admin" } })) as never);
  t.mock.method(aiService, "analyzeReport", (() => { throw new Error("Settings saves must not run AI"); }) as never);
  const writes: unknown[] = [];
  t.mock.method(supabaseAdmin, "from", ((table: string) => {
    assert.equal(table, "system_settings");
    return { async upsert(rows: unknown) { writes.push(rows); return { error: null }; } };
  }) as never);
  const result = response(); await updateSettings(request({ ai_scoring_enabled: "false" }), result.res);
  assert.equal(result.output.status, 200);
  assert.deepEqual(writes, [[{ key: "ai_scoring_enabled", value: "false" }]]);
});

test("only Super Admin can update the remaining system controls", async t => {
  t.mock.method(supabaseAdmin, "from", (() => { throw new Error("Unauthorized updates must not access settings"); }) as never);
  for (const role of ["user", "admin"]) {
    t.mock.method(profileService, "getProfile", (async () => ({ data: { role } })) as never);
    const result = response(); await updateSettings(request({ ai_scoring_enabled: "false" }), result.res);
    assert.equal(result.output.status, 403);
  }
});

function analysisStorage(t: TestContext, enabled: boolean, failSetting = false) {
  const tables: string[] = [], writes: any[] = [];
  t.mock.method(console, "log", () => {});
  t.mock.method(supabaseAdmin, "from", ((table: string) => {
    tables.push(table);
    const query = {
      select() { return query; }, eq() { return query; }, order() { return query; },
      async in() { return { data: [{ key: "ai_model_name", value: "gemini-2.5-flash" }], error: null }; },
      async maybeSingle() {
        if (table === "system_settings") return { data: failSetting ? null : { value: String(enabled) }, error: failSetting ? { message: "database offline" } : null };
        return { data: { id: "report", incident_type_id: null, details: "An incident", location: "Lamacan", incident_types: { name: "Theft" } }, error: null };
      },
      async upsert(row: unknown) { writes.push(row); return { error: null }; },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve(resolve({ data: [], count: 0, error: null })); },
    };
    return query;
  }) as never);
  const provider = t.mock.method(globalThis, "fetch", async (_input: unknown, init?: RequestInit) => new Response(JSON.stringify(init?.method === "POST"
    ? { candidates: [{ content: { parts: [{ text: JSON.stringify({ ai_score: 87, severity: "High", credibility_review: "A detailed report for administrative review." }) }] } }] }
    : { models: [{ name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] }] }), { status: 200 }));
  return { tables, writes, provider };
}

test("disabling credibility analysis skips scoring AND review generation without overwriting saved results", async t => {
  const store = analysisStorage(t, false);
  const result = await aiService.analyzeReport("report", { incident_category: "Safety", incident_type: "Theft", location: "Lamacan", details: "An incident" });
  assert.equal(result.status, "skipped");
  assert.equal(store.provider.mock.callCount(), 0);
  assert.deepEqual(store.tables, ["system_settings"]);
  assert.equal(store.writes.length, 0);
});

test("enabled credibility analysis generates and stores both the score and written review", async t => {
  const store = analysisStorage(t, true);
  const result = await aiService.analyzeReport("report", { incident_category: "Safety", incident_type: "Theft", location: "Lamacan", details: "An incident" });
  assert.equal(result.status, "succeeded");
  assert.equal(store.writes.length, 1);
  assert.equal(store.writes[0].ai_score, 87);
  assert.equal(store.writes[0].credibility_review, "A detailed report for administrative review.");
  assert.ok(store.provider.mock.callCount() > 0);
});

test("queued credibility work checks the current disabled state at execution time", async t => {
  const store = analysisStorage(t, false);
  const result = await adminAnalysisJobs.perform({ id: "job", kind: "credibility", subject_id: "report", report_id: "report", lease_token: "lease", attempts: 1, payload: {} });
  assert.equal(result, "skipped");
  assert.equal(store.provider.mock.callCount(), 0);
  assert.equal(store.writes.length, 0);
});

test("an unreadable analysis setting fails closed instead of enabling provider calls", async t => {
  const store = analysisStorage(t, true, true);
  await assert.rejects(aiService.analyzeReport("report", { incident_category: "Safety", incident_type: "Theft", location: "Lamacan", details: "An incident" }), /Could not read/);
  assert.equal(store.provider.mock.callCount(), 0);
  assert.equal(store.writes.length, 0);
});

test("a skipped manual analysis is audited as skipped, not a completed score/review", async t => {
  const { reportService } = await import("./services/reportService.js");
  const { analyzeReport } = await import("./controllers/aiController.js");
  t.mock.method(aiService, "analyzeReport", async () => ({ ai_score: 50, severity: "Medium" as const, credibility_review: "AI analysis disabled", status: "skipped" as const }));
  t.mock.method(reportService, "getReportCoords", async () => ({ data: { latitude: 9.88, longitude: 123.59 }, error: null }));
  const audit = t.mock.method(reportService, "insertAuditLog", (async () => ({ data: true })) as never);
  t.mock.method(profileService, "getProfile", (async () => ({ data: { role: "super_admin", fullname: "Ada" } })) as never);
  t.mock.method(supabaseAdmin, "from", (() => {
    const query = { select() { return query; }, eq() { return query; }, async maybeSingle() { return { data: {
      id: "report", details: "An incident", location: "Lamacan", incident_types: { name: "Theft", incident_categories: { name: "Safety" } },
    }, error: null }; } };
    return query;
  }) as never);
  const result = response();
  await analyzeReport({ user: { id: "admin" }, params: { id: "report" } } as unknown as Request, result.res);
  assert.equal(result.output.status, 200);
  assert.equal(audit.mock.calls[0]!.arguments[0].actionType, "AI Analysis Skipped");
  assert.equal(audit.mock.calls[0]!.arguments[0].newValue, null);
});
