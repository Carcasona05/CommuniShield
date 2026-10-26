import "../helpers/serverEnvironment.js";
import assert from "node:assert/strict";
import { after, before, describe, test, type TestContext } from "node:test";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import app from "../../server/api/index.js";
import {
  __testing as sentimentKit,
  detectLanguage,
  normalizeSentimentLabel,
  sentimentInputHash,
  sentimentService,
  type SentimentPrediction,
} from "../../server/src/services/sentimentService.js";
import {
  __testing as rotationKit,
  candidateModels,
  clearModelExhaustion,
  markModelExhausted,
} from "../../server/src/services/geminiRotation.js";
import { __testing as aiKit } from "../../server/src/services/aiService.js";
import {
  __testing as forecastActionsKit,
  type ForecastActionFacts,
} from "../../server/src/services/forecastActionsService.js";
import { validateSetting } from "../../server/src/controllers/settingsController.js";
import { allowsNotification, notificationPreferencesService } from "../../server/src/services/notificationPreferencesService.js";
import { notificationService } from "../../server/src/services/notificationService.js";
import { getNotificationPreferences, updateNotificationPreferences } from "../../server/src/controllers/notificationPreferencesController.js";
import type { Request, Response } from "express";
import type { User } from "@supabase/supabase-js";
import { ARGAO_BARANGAY_NAMES, barangaysAtCoordinates, deriveBarangay } from "../../server/src/utils/argaoLocation.js";
import { formatGeocodedAddress } from "../../server/src/utils/geocode.js";
import { getAdminDashboard, validateReport } from "../../server/src/controllers/reportController.js";
import { reportService } from "../../server/src/services/reportService.js";
import { supabaseAdmin } from "../../server/src/config/supabaseAdmin.js";
import { profileService } from "../../server/src/services/authService.js";

// Unit/integration tests use bundled artifacts, never the live model pointer.
process.env.SENTIMENT_MODEL_REGISTRY_ENABLED = "false";

describe("Argao barangay and street hierarchy", () => {
  test("streets are assigned by their coordinates, not whole-street aliases", () => {
    assert.equal(deriveBarangay("Carlock Street, Argao, Cebu", { latitude: 9.8784487, longitude: 123.5950192 }), "Lamacan");
    assert.equal(deriveBarangay("624 Carlock St., Argao"), "");
    assert.equal(deriveBarangay("Unknown Street, Argao"), "");
    assert.equal(deriveBarangay("Apo Street, Argao"), "");
  });
  test("recognized address barangays are used when coordinates are missing", () => {
    assert.equal(deriveBarangay("Carlock Street, Brgy. Canbanua, Argao"), "Canbanua");
    for (const barangay of ARGAO_BARANGAY_NAMES) {
      assert.equal(deriveBarangay(`Other Street, ${barangay}, Argao`), barangay);
    }
  });
  test("reverse geocoding retains streets below the barangay", () => {
    assert.equal(formatGeocodedAddress({ suburb: "Lamacan", road: "Carlock Street", town: "Argao", state: "Cebu" }), "Lamacan, Carlock Street, Argao, Cebu");
    assert.equal(formatGeocodedAddress({ road: "Carlock Street", town: "Argao" }, { latitude: 9.8784487, longitude: 123.5950192 }), "Lamacan, Carlock Street, Argao");
    assert.equal(formatGeocodedAddress({ suburb: "Canbanua", road: "Carlock Street", town: "Argao" }), "Canbanua, Carlock Street, Argao");
    assert.equal(formatGeocodedAddress({ road: "Unknown Street", town: "Argao" }), "Unknown Street, Argao");
  });
  test("Isidro Kintanar reports appear in the barangay containing each pin", () => {
    const location = "Isidro Kintanar Street, Argao";
    assert.equal(deriveBarangay(location, { latitude: 9.881969, longitude: 123.600326 }), "Lamacan");
    assert.equal(deriveBarangay(location, { latitude: 9.88525, longitude: 123.598033 }), "Canbanua");
    assert.equal(deriveBarangay(location, { latitude: 9.8802091, longitude: 123.605901 }), "Poblacion");
    assert.equal(deriveBarangay("Canbanua, Argao", { latitude: 9.881969, longitude: 123.600326 }), "Lamacan");
    assert.deepEqual(barangaysAtCoordinates(0, 0), []);
    assert.deepEqual(barangaysAtCoordinates(null, ""), []);
  });
  test("reverse geocoding corrects an incorrect suburb using the pin", () => {
    assert.equal(formatGeocodedAddress({ suburb: "Canbanua", road: "Isidro Kintanar Street", town: "Argao" }, { latitude: 9.881969, longitude: 123.600326 }), "Lamacan, Isidro Kintanar Street, Argao");
  });
  test("dashboard filtering uses the resolved barangay, not stale address text", async (t) => {
    t.mock.method(profileService, "getProfile", async () => ({ data: { role: "admin" }, error: null }));
    t.mock.method(reportService, "getAdminDashboard", async () => ({
      data: {
        summary: {},
        reports: [
          { id: "lamacan", barangay: "Lamacan", location: "Isidro Kintanar Street, Canbanua" },
          { id: "canbanua", barangay: "Canbanua", location: "Other Street, Lamacan" },
          { id: "unresolved", barangay: "", location: "Unknown Street" },
        ],
      }, error: null,
    }));
    for (const [barangay, expected] of [["Lamacan", "lamacan"], ["Canbanua", "canbanua"], ["__unresolved__", "unresolved"]]) {
      const req = { user: { id: "admin-1" }, query: { barangay } } as unknown as Request & { user: User };
      let body: { reports: { id: string }[] } | undefined;
      const res = { json(value: typeof body) { body = value; } } as Response;
      await getAdminDashboard(req, res);
      assert.deepEqual(body?.reports.map(({ id }) => id), [expected]);
    }
  });
});

describe("archived reports", () => {
  test("archiving records its own audit action and stays off the admin broadcast", async (t) => {
    t.mock.method(profileService, "getProfile", async () => ({ data: { role: "admin", fullname: "Ada Admin" }, error: null }));
    const statusUpdate = t.mock.method(reportService, "validateReport", async () => ({
      data: {
        id: "11111111-1111-4111-8111-111111111111",
        ownerId: "owner-1",
        location: "Lamacan, Argao",
        previousStatus: "Pending Review",
        previousVerified: true,
        incidentType: "Theft",
      },
      error: null,
    }));
    const auditLogs: Parameters<typeof reportService.insertAuditLog>[0][] = [];
    t.mock.method(reportService, "insertAuditLog", async (input: Parameters<typeof reportService.insertAuditLog>[0]) => {
      auditLogs.push(input);
      return { data: null, error: null };
    });
    const broadcast = t.mock.method(notificationService, "notifyAllAdmins", async () => ({ data: null, error: null }));
    const ownerNotice = t.mock.method(notificationService, "createNotification", async () => ({ data: null, error: null }));

    const req = {
      user: { id: "admin-1" },
      params: { id: "11111111-1111-4111-8111-111111111111" },
      body: { status: "Archived", is_verified: true },
    } as unknown as Request & { user: User };
    let body: { status?: string } | undefined;
    const res = {
      json(value: typeof body) { body = value; },
      status() { return this; },
    } as unknown as Response;

    await validateReport(req, res);

    assert.equal(statusUpdate.mock.callCount(), 1);
    assert.deepEqual(statusUpdate.mock.calls[0]?.arguments[1], {
      status: "Archived",
      is_verified: false,
    });
    assert.equal(auditLogs[0]?.actionType, "Report Archived");
    assert.equal(auditLogs[0]?.newValue, "Archived");
    assert.equal(ownerNotice.mock.callCount(), 1);
    assert.equal(broadcast.mock.callCount(), 0);
    assert.equal(body?.status, "Archived");
  });

  test("report feeds and dashboards never select archived rows", async (t) => {
    const queries: { table: string; filters: string[] }[] = [];
    const rowsByTable: Record<string, unknown[]> = {
      reports: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          user_id: "33333333-3333-4333-8333-333333333333",
          location: "Lamacan, Argao",
          latitude: 9.881969,
          longitude: 123.600326,
          details: "Sample report",
          poster_name: "Juan",
          display_name_type: "",
          status: "Pending Review",
          is_verified: false,
          created_at: "2026-10-20T10:00:00.000Z",
          incident_type_id: "44444444-4444-4444-8444-444444444444",
          role: "user",
        },
      ],
    };
    const filterMethods = new Set(["eq", "neq", "in", "gte", "lte", "not"]);
    const makeBuilder = (table: string) => {
      const query = { table, filters: [] as string[] };
      queries.push(query);
      const builder: Record<string, unknown> = {};
      const chain =
        (name: string) =>
        (...args: unknown[]) => {
          if (filterMethods.has(name)) {
            query.filters.push(`${name}:${String(args[0])}:${String(args[1])}`);
          }
          return builder;
        };
      ["select", "order", "limit", "range", "eq", "neq", "in", "gte", "lte", "not"].forEach(
        (name) => {
          builder[name] = chain(name);
        }
      );
      builder.then = (resolve: unknown, reject: unknown) =>
        Promise.resolve({ data: rowsByTable[table] ?? [], error: null }).then(
          resolve as never,
          reject as never
        );
      return builder;
    };
    t.mock.method(supabaseAdmin, "from", makeBuilder as unknown as typeof supabaseAdmin.from);

    const feed = await reportService.listReports();
    assert.equal(feed.error, null);
    assert.equal(feed.data?.length, 1);
    assert.ok(
      queries.find((q) => q.table === "reports")?.filters.includes("neq:status:Archived"),
      "report feeds must exclude archived reports"
    );

    queries.length = 0;
    const dashboard = await reportService.getAdminDashboard();
    assert.equal(dashboard.error, null);
    assert.ok(
      queries.find((q) => q.table === "reports")?.filters.includes("neq:status:Archived"),
      "the admin dashboard must exclude archived reports"
    );

    queries.length = 0;
    const archived = await reportService.getAdminDashboard({ status: "Archived" });
    assert.equal(archived.error, null);
    assert.deepEqual(
      queries.find((q) => q.table === "reports")?.filters,
      ["eq:status:Archived"],
      "the Logs archive view asks for archived reports explicitly"
    );
  });
});

describe("dashboard relation batching", () => {
  function fixture(t: TestContext, failSecondAnalysisBatch = false, empty = false,
    options: { reportCount?: number; replies?: number; images?: number; likes?: number; failCommentPage?: boolean } = {}) {
    const reports = Array.from({ length: empty ? 0 : options.reportCount ?? 640 }, (_, i) => ({
      id: `report-${i}`, user_id: `poster-${i}`, location: "Lamacan, Argao, Cebu",
      latitude: 9.880192, longitude: 123.583668, details: "Synthetic test",
      poster_name: "Poster", status: "Pending Review", is_verified: false,
      created_at: "2026-10-22T10:00:00Z", incident_type_id: "type", role: "user",
    }));
    const comments = reports.flatMap((r, i) => Array.from({ length: options.replies ?? 2 }, (_, n) => ({
      id: `comment-${i}-${n}`, report_id: r.id, user_id: `commenter-${i}`,
      content: "Synthetic comment", created_at: "2026-10-22T11:00:00Z",
    })));
    const sentiment = (id: string) => ({ subject_id: id, label: "neutral", confidence: 0.9,
      language: "english", provider: "local", model: "test", status: "succeeded",
      error_code: "", analyzed_at: "2026-10-22T12:00:00Z" });
    const calls: Array<{ table: string; ids: string[] }> = [];
    t.mock.method(supabaseAdmin, "from", ((table: string) => {
      let ids: string[] = [];
      let subjectType = "";
      let range: [number, number] | undefined;
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "order", "neq", "gte", "lte"]) builder[method] = () => builder;
      builder.range = (from: number, to: number) => { range = [from, to]; return builder; };
      builder.eq = (column: string, value: string) => { if (column === "subject_type") subjectType = value; return builder; };
      builder.in = (_column: string, values: string[]) => {
        assert.ok(values.length <= 100, `${table} must never send oversized IN filters`);
        ids = values;
        calls.push({ table, ids: [...ids] });
        return builder;
      };
      builder.then = (resolve: never, reject: never) => {
        let data: unknown[] = [];
        let error: { message: string } | null = null;
        if (table === "incident_types") data = [{ id: "type", name: "Theft", incident_categories: { name: "Property" } }];
        if (table === "reports") data = reports;
        if (table === "profiles") data = ids.map((id) => ({ id, fullname: `Name ${id}`, user_name: id }));
        if (table === "report_comments") data = comments.filter((c) => ids.includes(c.report_id));
        if (table === "report_comments" && options.failCommentPage && range && range[0] >= 500) error = { message: "Comment page failed" };
        if (table === "report_images") data = ids.flatMap((id) => Array.from({ length: options.images ?? 1 }, (_, n) => ({ report_id: id, image_url: `https://example.test/${id}-${n}.png` })));
        if (table === "report_likes") data = ids.flatMap((id) => Array.from({ length: options.likes ?? 0 }, (_, n) => ({ report_id: id, user_id: `liker-${n}` })));
        if (table === "report_credibility_analysis") {
          if (failSecondAnalysisBatch && calls.filter((c) => c.table === table).length === 2) error = { message: "Second analysis batch failed" };
          else data = ids.map((id) => ({ report_id: id, ai_score: 60, severity: "Low", credibility_review: "Synthetic" }));
        }
        if (table === "sentiment_analysis") {
          const valid = subjectType === "comment" ? comments.map((c) => c.id) : reports.map((r) => r.id);
          data = ids.filter((id) => valid.includes(id)).map(sentiment);
        }
        if (range) data = data.slice(range[0], range[1] + 1);
        return Promise.resolve({ data: error ? null : data, error }).then(resolve, reject);
      };
      return builder;
    }) as unknown as typeof supabaseAdmin.from);
    return { calls, reports, comments };
  }

  test("640 reports and 1280 comments retain all profiles, sentiment and images across batches", async (t) => {
    const { calls } = fixture(t);
    const result = await reportService.getAdminDashboard();
    assert.equal(result.error, null);
    assert.equal(result.data?.summary.total, 640);
    assert.equal(result.data?.reports.reduce((sum, r) => sum + r.comments.length, 0), 1280);
    assert.equal(calls.filter((c) => c.table === "report_credibility_analysis").length, 7);
    assert.equal(calls.filter((c) => c.table === "profiles").length, 14);
    assert.equal(calls.filter((c) => c.table === "sentiment_analysis").length, 20);
    for (const [index, report] of (result.data?.reports || []).entries()) {
      assert.equal(report.reporter_name, `Name poster-${index}`);
      assert.equal(report.ai_score, 60);
      assert.equal(report.sentiment, "neutral");
      assert.equal(report.images.length, 1);
      assert.equal(report.comments.length, 2);
      for (const comment of report.comments) {
        assert.equal(comment.user, `Name commenter-${index}`);
        assert.equal(comment.sentiment, "neutral");
      }
    }
  });

  test("a failed later batch returns an error rather than a partial dashboard", async (t) => {
    fixture(t, true);
    const result = await reportService.getAdminDashboard();
    assert.equal(result.data, null);
    assert.equal(result.error, "Second analysis batch failed");
  });

  test("empty dashboards skip all relation queries", async (t) => {
    const { calls } = fixture(t, false, true);
    const result = await reportService.getAdminDashboard();
    assert.equal(result.error, null);
    assert.equal(result.data?.summary.total, 0);
    assert.deepEqual(calls, []);
  });

  test("analytics paginates reports and busy threads and batches all sentiment UUIDs", async (t) => {
    const apiKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    t.after(() => { if (apiKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = apiKey; });
    const { reports, comments } = fixture(t, false, false, { reportCount: 1100, replies: 12 });
    const result = await reportService.getAdminAnalytics();
    assert.equal(result.error, null);
    assert.equal(result.data?.summary.activeIncidents, reports.length);
    assert.equal(result.data?.summary.sentimentTotal, reports.length + comments.length);
    assert.equal(result.data?.summary.sentimentAnalyzed, reports.length + comments.length);
    assert.equal(result.data?.summary.sentimentDistribution.find(r => r.label === "neutral")?.count, 14300);
  });

  test("analytics returns errors instead of silently aggregating partial comment pages", async (t) => {
    fixture(t, false, false, { replies: 12, failCommentPage: true });
    const result = await reportService.getAdminAnalytics();
    assert.equal(result.data, null);
    assert.equal(result.error, "Comment page failed");
  });

  test("empty analytics skips relation reads", async (t) => {
    const apiKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    t.after(() => { if (apiKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = apiKey; });
    const { calls } = fixture(t, false, true);
    const result = await reportService.getAdminAnalytics();
    assert.equal(result.error, null);
    assert.equal(result.data?.summary.sentimentTotal, 0);
    assert.deepEqual(calls, []);
  });

  test("user feeds batch UUIDs and retain reports, comments, likes and images beyond response caps", async (t) => {
    fixture(t, false, false, { reportCount: 1100, replies: 12, images: 11, likes: 12 });
    const result = await reportService.listReports("liker-0");
    assert.equal(result.error, null);
    assert.equal(result.data?.length, 1100);
    for (const report of result.data || []) {
      assert.equal(report.comments, 12);
      assert.equal(report.likes, 12);
      assert.equal(report.images.length, 11);
      assert.equal(report.is_liked, true);
      assert.equal(report.sentiment, "neutral");
      assert.equal(report.ai_score, 60);
    }
  });

  test("My Reports and report details load through the batched feed", async (t) => {
    fixture(t);
    const mine = await reportService.listMyReports("poster-7");
    assert.equal(mine.error, null);
    assert.deepEqual(mine.data?.map(r => r.id), ["report-7"]);
    const details = await reportService.getReportById("poster-7", "report-7");
    assert.equal(details.error, null);
    assert.equal(details.data?.id, "report-7");
  });

  test("user feeds surface failed relation batches instead of partial results", async (t) => {
    fixture(t, true);
    const result = await reportService.listReports();
    assert.equal(result.data, null);
    assert.equal(result.error, "Second analysis batch failed");
  });

  test("user feeds surface a failed later comment page", async (t) => {
    fixture(t, false, false, { replies: 12, failCommentPage: true });
    const result = await reportService.listReports();
    assert.equal(result.data, null);
    assert.equal(result.error, "Comment page failed");
  });

  test("empty user feeds skip relation reads", async (t) => {
    const { calls } = fixture(t, false, true);
    const result = await reportService.listReports();
    assert.equal(result.error, null);
    assert.deepEqual(result.data, []);
    assert.deepEqual(calls, []);
  });
});

describe("user notification preferences", () => {
  test("master switch and crime switch independently control delivery", () => {
    for (const notifications_enabled of [true, false]) {
      for (const crime_alerts_enabled of [true, false]) {
        const preferences = { notifications_enabled, crime_alerts_enabled };
        assert.equal(allowsNotification(preferences, "report_status"), notifications_enabled);
        assert.equal(allowsNotification(preferences, "nearby_incident"), notifications_enabled && crime_alerts_enabled);
      }
    }
  });

  const response = () => {
    const result = { status: 200, body: undefined as unknown };
    const res = {
      status(code: number) { result.status = code; return res; },
      json(body: unknown) { result.body = body; return res; },
    } as Response;
    return { res, result };
  };
  const request = (body?: unknown) => ({ user: { id: "user-1" } as User, body }) as Request & { user: User };

  test("preferences require authentication", async () => {
    for (const handler of [getNotificationPreferences, updateNotificationPreferences]) {
      const { res, result } = response();
      await handler({} as Request, res);
      assert.equal(result.status, 401);
    }
  });

  test("rejects empty, unknown, and non-boolean preferences", async () => {
    for (const body of [undefined, {}, [], { role: "admin" }, { notifications_enabled: "false" }, { crime_alerts_enabled: null }]) {
      const { res, result } = response();
      await updateNotificationPreferences(request(body), res);
      assert.equal(result.status, 400);
    }
  });

  test("saves only the supplied preference for the authenticated user", async (t) => {
    const saved = { notifications_enabled: false, crime_alerts_enabled: true };
    t.mock.method(notificationPreferencesService, "update", async (id: string, patch: Record<string, boolean>) => {
      assert.equal(id, "user-1");
      assert.deepEqual(patch, { notifications_enabled: false });
      return { data: saved, error: null };
    });
    const { res, result } = response();
    await updateNotificationPreferences(request({ notifications_enabled: false }), res);
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, saved);
  });

  test("returns an error instead of reporting a failed save as successful", async (t) => {
    t.mock.method(notificationPreferencesService, "update", async () => ({ data: null, error: { message: "database unavailable" } }));
    const { res, result } = response();
    await updateNotificationPreferences(request({ crime_alerts_enabled: false }), res);
    assert.equal(result.status, 500);
  });

  test("loads the authenticated user's saved preferences", async (t) => {
    const saved = { notifications_enabled: true, crime_alerts_enabled: false };
    t.mock.method(notificationPreferencesService, "get", async (id: string) => {
      assert.equal(id, "user-1");
      return { data: saved, error: null };
    });
    const { res, result } = response();
    await getNotificationPreferences(request(), res);
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, saved);
  });

  test("failed preference reads do not silently enable notifications", async (t) => {
    t.mock.method(notificationPreferencesService, "get", async () => ({ data: null, error: { message: "database unavailable" } }));
    const { res, result } = response();
    await getNotificationPreferences(request(), res);
    assert.equal(result.status, 500);
    const delivery = await notificationService.createNotification({ userId: "user-1", type: "report_status", title: "Test" });
    assert.ok(delivery.error);
  });

  test("opted-out user notifications are skipped before insertion", async (t) => {
    t.mock.method(notificationPreferencesService, "get", async () => ({
      data: { notifications_enabled: false, crime_alerts_enabled: true }, error: null,
    }));
    const typeLookup = t.mock.method(notificationService, "getTypeId", async () => { throw new Error("must not insert"); });
    for (const type of ["report_status", "nearby_incident"] as const) {
      const result = await notificationService.createNotification({ userId: "user-1", type, title: "Test" });
      assert.equal(result.skipped, true);
    }
    assert.equal(typeLookup.mock.callCount(), 0);
  });

  test("crime opt-out suppresses nearby incidents even with notifications on", async (t) => {
    t.mock.method(notificationPreferencesService, "get", async () => ({
      data: { notifications_enabled: true, crime_alerts_enabled: false }, error: null,
    }));
    const result = await notificationService.createNotification({ userId: "user-1", type: "nearby_incident", title: "Test" });
    assert.equal(result.skipped, true);
  });
});

const basePrediction = (
  overrides: Partial<SentimentPrediction>
): SentimentPrediction => ({
  label: "neutral",
  confidence: 0.5,
  language: "english",
  provider: "local",
  model: "local-model",
  input_hash: "hash",
  source_text: "text",
  ...overrides,
});

describe("sentimentService", () => {
  test("fuse assist agrees: ensemble + averaged confidence", () => {
    const { prediction, errorCode } =
      sentimentKit.fuseLocalWithGeminiAssist(
        basePrediction({ label: "positive", confidence: 0.8, provider: "local" }),
        basePrediction({
          label: "positive",
          confidence: 0.6,
          provider: "gemini",
          model: "gemini-2.5-flash",
        })
      );
    assert.equal(errorCode, "");
    assert.equal(prediction.label, "positive");
    assert.equal(prediction.provider, "ensemble");
    assert.equal(prediction.confidence, 0.7);
    assert.match(prediction.model, /^assist:agree\|/);
  });

  test("fuse assist disagree: local wins when confident", () => {
    const { prediction } = sentimentKit.fuseLocalWithGeminiAssist(
      basePrediction({ label: "negative", confidence: 0.8, provider: "local" }),
      basePrediction({
        label: "positive",
        confidence: 0.9,
        provider: "gemini",
        model: "gemini-2.5-flash",
      })
    );
    assert.equal(prediction.label, "negative");
    assert.equal(prediction.provider, "ensemble");
    assert.ok(prediction.confidence < 0.8);
    assert.match(prediction.model, /^assist:local_wins\|/);
  });

  test("fuse assist disagree: gemini rescues weak local", () => {
    const { prediction } = sentimentKit.fuseLocalWithGeminiAssist(
      basePrediction({
        label: "neutral",
        confidence: 0.3,
        provider: "local",
        input_hash: "abc",
        source_text: "kept",
      }),
      basePrediction({
        label: "negative",
        confidence: 0.9,
        provider: "gemini",
        model: "gemini-2.5-flash",
        input_hash: "other",
        source_text: "other",
      })
    );
    assert.equal(prediction.label, "negative");
    assert.equal(prediction.provider, "ensemble");
    assert.equal(prediction.input_hash, "abc");
    assert.equal(prediction.source_text, "kept");
    assert.match(prediction.model, /^assist:gemini_rescue\|/);
  });

  test("normalizeSentimentLabel accepts supported labels", () => {
    assert.equal(normalizeSentimentLabel("positive"), "positive");
    assert.equal(normalizeSentimentLabel("Neutral"), "neutral");
    assert.equal(normalizeSentimentLabel(" negative "), "negative");
    assert.equal(normalizeSentimentLabel("mixed"), "mixed");
    assert.equal(normalizeSentimentLabel("unclear"), "unclear");
  });

  test("normalizeSentimentLabel maps legacy aliases and rejects unknown values", () => {
    assert.equal(normalizeSentimentLabel("concerned"), "negative");
    assert.equal(normalizeSentimentLabel("anxious"), "negative");
    assert.equal(normalizeSentimentLabel("no majority"), "mixed");
    assert.equal(normalizeSentimentLabel("unknown"), "unclear");
    assert.equal(normalizeSentimentLabel("happy"), null);
    assert.equal(normalizeSentimentLabel(""), null);
    assert.equal(normalizeSentimentLabel(null), null);
  });

  test("detectLanguage routes real text with the trained model and treats blank as unknown", async () => {
    assert.equal(
      await detectLanguage(
        "Kani siya tawhana sge ni shag balik balik ug sulod sa room, nya wami kaila kinsa"
      ),
      "cebuano"
    );
    assert.equal(
      await detectLanguage("Thank you for the update, this is very helpful"),
      "english"
    );
    assert.equal(await detectLanguage("Hindi ako papayag dito"), "filipino");
    assert.equal(await detectLanguage(""), "unknown");
  });

  test("sentimentInputHash normalizes whitespace before hashing", () => {
    assert.equal(
      sentimentInputHash("hello   world\n"),
      sentimentInputHash(" hello world ")
    );
    assert.notEqual(
      sentimentInputHash("hello"),
      sentimentInputHash("hello world")
    );
  });

  test("analyze returns unavailable without persisting when subject is missing", async () => {
    const result = await sentimentService.analyze(
      "report",
      "00000000-0000-0000-0000-000000000001"
    );
    assert.equal(result.status, "unavailable");
    assert.equal(result.error_code, "subject_missing");
    assert.equal(result.label, "unclear");
    assert.equal(result.confidence, 0);
  });

  test("gemini prompt carries sarcasm rules and the JSON contract", () => {
    const prompt = sentimentKit.buildGeminiSentimentPrompt(
      "Salamat kaayo sa atong security",
      "cebuano"
    );
    assert.ok(prompt.includes("Sarcasm rules"));
    assert.ok(
      prompt.includes('"label":"positive|neutral|negative|mixed|unclear"')
    );
    assert.ok(prompt.includes("Do not infer credibility or severity"));
    assert.ok(prompt.includes('Text: "Salamat kaayo sa atong security"'));
    assert.ok(!prompt.includes("Surrounding post"));
  });

  test("gemini prompt includes parent context only when provided", () => {
    const without = sentimentKit.buildGeminiSentimentPrompt(
      "Safe kaayo.",
      "cebuano"
    );
    const withContext = sentimentKit.buildGeminiSentimentPrompt(
      "Safe kaayo.",
      "cebuano",
      "Nahadlok mi kay gisulod mi balik."
    );
    assert.ok(!without.includes("Surrounding post"));
    assert.ok(withContext.includes("Surrounding post"));
    assert.ok(withContext.includes("Nahadlok mi kay gisulod mi balik."));
  });
});

describe("geminiRotation", () => {
  test("candidateModels puts the primary model first and never duplicates it", () => {
    clearModelExhaustion();
    const models = candidateModels("gemini-3.6-flash");
    assert.equal(models[0], "gemini-3.6-flash");
    assert.equal(new Set(models).size, models.length);
    assert.equal(models.length, 1 + rotationKit.ROTATION_POOL.length);
  });

  test("candidateModels deduplicates a primary that is also in the pool", () => {
    clearModelExhaustion();
    const models = candidateModels("gemini-3.8-flash");
    assert.equal(models[0], "gemini-3.8-flash");
    assert.equal(models.filter((m) => m === "gemini-3.8-flash").length, 1);
  });

  test("exhausted models are skipped until the cooldown passes", () => {
    clearModelExhaustion();
    markModelExhausted("gemini-3.6-flash");
    const models = candidateModels("gemini-3.6-flash");
    assert.ok(!models.includes("gemini-3.6-flash"));
    assert.equal(models[0], "gemini-3.8-flash");
  });

  test("escalating cooldowns cap at the maximum", () => {
    clearModelExhaustion();
    for (let i = 0; i < 10; i++) markModelExhausted("gemini-3.5-flash");
    const until = rotationKit.exhaustedUntil.get("gemini-3.5-flash") ?? 0;
    const remaining = until - Date.now();
    assert.ok(remaining > 0);
    assert.ok(remaining <= rotationKit.MAX_COOLDOWN_MS);
  });

  test("a successful model clears its exhaustion memory", () => {
    clearModelExhaustion();
    markModelExhausted("gemini-3.7-flash");
    clearModelExhaustion("gemini-3.7-flash");
    const models = candidateModels("gemini-3.6-flash");
    assert.ok(models.includes("gemini-3.7-flash"));
  });

  test("when every model is cooling down the full list is still returned", () => {
    clearModelExhaustion();
    const all = ["gemini-3.6-flash", ...rotationKit.ROTATION_POOL];
    all.forEach(markModelExhausted);
    const models = candidateModels("gemini-3.6-flash");
    assert.equal(models.length, all.length);
    clearModelExhaustion();
  });
});

describe("aiService", () => {
  const { parseAIResponse, repairTruncatedJson, stripModelPrefix, MAX_OUTPUT_TOKENS } =
    aiKit;

  test("parses plain JSON response", () => {
    const result = parseAIResponse(
      '{"ai_score": 82, "severity": "High", "credibility_review": "Corroborated by 3 similar reports."}'
    );
    assert.equal(result.ai_score, 82);
    assert.equal(result.severity, "High");
    assert.equal(
      result.credibility_review,
      "Corroborated by 3 similar reports."
    );
    assert.equal(result.status, "succeeded");
  });

  test("parses JSON wrapped in markdown code fences", () => {
    const result = parseAIResponse(
      '```json\n{"ai_score": 70, "severity": "Medium", "credibility_review": "Details are specific."}\n```'
    );
    assert.equal(result.ai_score, 70);
    assert.equal(result.severity, "Medium");
  });

  test("recovers JSON truncated mid-string (MAX_TOKENS cut)", () => {
    const truncated =
      '```json\n{\n  "ai_score": 86,\n  "severity": "Medium",\n  "credibility_review": "The report prov';
    const result = parseAIResponse(truncated);
    assert.equal(result.ai_score, 86);
    assert.equal(result.severity, "Medium");
    assert.ok(result.credibility_review.startsWith("The report prov"));
    assert.notEqual(
      result.credibility_review,
      "Unable to generate AI review. Manual verification recommended."
    );
  });

  test("recovers JSON truncated right after a field", () => {
    const result = parseAIResponse('{"ai_score": 45, "severity": "Low",');
    assert.equal(result.ai_score, 45);
    assert.equal(result.severity, "Low");
  });

  test("recovers JSON truncated before a key value", () => {
    const result = parseAIResponse('{"ai_score": 45, "severity":');
    assert.equal(result.ai_score, 45);
    assert.equal(result.severity, "Medium");
  });

  test("falls back on non-JSON response", () => {
    const result = parseAIResponse("I could not analyze this report.");
    assert.equal(result.ai_score, 50);
    assert.equal(result.severity, "Medium");
    assert.equal(
      result.credibility_review,
      "Unable to generate AI review. Manual verification recommended."
    );
    assert.equal(result.status, "failed");
  });

  test("normalizes lowercase severity and out-of-range scores", () => {
    const result = parseAIResponse(
      '{"ai_score": 250, "severity": "critical", "credibility_review": "ok"}'
    );
    assert.equal(result.ai_score, 100);
    assert.equal(result.severity, "Critical");
  });

  test("keeps a genuine zero score", () => {
    const result = parseAIResponse(
      '{"ai_score": 0, "severity": "Low", "credibility_review": "no corroboration"}'
    );
    assert.equal(result.ai_score, 0);
  });

  test("repairTruncatedJson rejects already complete structures", () => {
    assert.equal(repairTruncatedJson('{"a": 1}'), null);
  });

  test("stripModelPrefix removes the models/ path segment", () => {
    assert.equal(
      stripModelPrefix("models/gemini-3.8-flash"),
      "gemini-3.8-flash"
    );
    assert.equal(stripModelPrefix("gemini-3.8-flash"), "gemini-3.8-flash");
  });

  test("token budget is large enough for thinking models", () => {
    assert.ok(
      MAX_OUTPUT_TOKENS >= 1024,
      "maxOutputTokens must leave room for thinking tokens"
    );
  });
});

describe("settingsController", () => {
  test("validateSetting accepts booleans and rejects other values", () => {
    assert.deepEqual(validateSetting("ai_scoring_enabled", "true"), {
      value: "true",
    });
    assert.deepEqual(validateSetting("notification_push", "false"), {
      value: "false",
    });
    assert.ok("error" in validateSetting("ai_scoring_enabled", "yes"));
  });

  test("validateSetting restricts cebuano mode to gemini, local, or disabled", () => {
    assert.deepEqual(validateSetting("sentiment_cebuano_mode", "gemini"), {
      value: "gemini",
    });
    assert.deepEqual(validateSetting("sentiment_cebuano_mode", "local"), {
      value: "local",
    });
    assert.deepEqual(validateSetting("sentiment_cebuano_mode", "disabled"), {
      value: "disabled",
    });
    assert.ok("error" in validateSetting("sentiment_cebuano_mode", "transformer"));
  });

  test("validateSetting enforces threshold bounds as integers", () => {
    assert.deepEqual(validateSetting("ai_high_threshold", "85"), { value: "85" });
    assert.deepEqual(validateSetting("ai_medium_threshold", "0"), { value: "0" });
    assert.ok("error" in validateSetting("ai_high_threshold", "101"));
    assert.ok("error" in validateSetting("ai_medium_threshold", "-1"));
    assert.ok("error" in validateSetting("ai_high_threshold", "85.5"));
  });

  test("validateSetting enforces temperature and timeout ranges", () => {
    assert.deepEqual(validateSetting("ai_temperature", "0.1"), { value: "0.1" });
    assert.ok("error" in validateSetting("ai_temperature", "1.5"));
    assert.ok("error" in validateSetting("ai_temperature", "-0.1"));
    assert.deepEqual(validateSetting("ai_timeout", "30000"), { value: "30000" });
    assert.ok("error" in validateSetting("ai_timeout", "500"));
    assert.ok("error" in validateSetting("ai_timeout", "200000"));
  });

  test("validateSetting enforces map zoom and center bounds", () => {
    assert.deepEqual(validateSetting("map_default_zoom", "13"), { value: "13" });
    assert.ok("error" in validateSetting("map_default_zoom", "0"));
    assert.ok("error" in validateSetting("map_default_zoom", "21"));
    assert.deepEqual(validateSetting("map_center", "Argao, Cebu"), {
      value: "Argao, Cebu",
    });
    assert.ok("error" in validateSetting("map_center", ""));
    assert.ok("error" in validateSetting("map_center", "x".repeat(201)));
  });

  test("validateSetting validates model names and API endpoints", () => {
    assert.deepEqual(validateSetting("ai_model_name", "models/gemini-2.5-flash"), {
      value: "gemini-2.5-flash",
    });
    assert.ok("error" in validateSetting("ai_model_name", "gpt-4o"));
    assert.deepEqual(validateSetting("ai_api_endpoint", ""), { value: "" });
    assert.deepEqual(
      validateSetting("ai_api_endpoint", "https://api.example.com/v1"),
      { value: "https://api.example.com/v1" }
    );
    assert.ok("error" in validateSetting("ai_api_endpoint", "not-a-url"));
    assert.ok("error" in validateSetting("ai_api_endpoint", "ftp://example.com"));
  });
});

const actionFacts = (
  overrides: Partial<ForecastActionFacts> = {}
): ForecastActionFacts => ({
  riskLevel: "HIGH",
  probability: 92,
  zones: [{ location: "Poblacion", count: 4 }],
  timeWindow: "8:00 PM - 10:00 PM",
  trendPct: 14,
  crimeTypes: [{ label: "Theft", value: "50%" }],
  activeHighCritical: 6,
  activeTotal: 40,
  ...overrides,
});

describe("forecastActionsService", () => {
  test("rule fallback returns a single data message when there are no reports", () => {
    const actions = forecastActionsKit.ruleBasedActions(
      actionFacts({ activeTotal: 0, zones: [], crimeTypes: [] })
    );
    assert.equal(actions.length, 1);
    assert.match(actions[0] ?? "", /Not enough report data/);
  });

  test("rule fallback for HIGH risk mentions the primary zone and time window", () => {
    const actions = forecastActionsKit.ruleBasedActions(actionFacts());
    assert.ok(actions.length >= 3 && actions.length <= 5);
    assert.ok(
      actions.some((action) => action.includes("Poblacion")),
      `expected a zone in ${JSON.stringify(actions)}`
    );
    assert.ok(
      actions.some((action) => action.includes("8:00 PM - 10:00 PM")),
      `expected the time window in ${JSON.stringify(actions)}`
    );
  });

  test("rule fallback never exceeds 5 actions", () => {
    const actions = forecastActionsKit.ruleBasedActions(
      actionFacts({ riskLevel: "MEDIUM", trendPct: 40 })
    );
    assert.ok(actions.length <= 5);
    assert.ok(actions.every((action) => action.length > 0));
  });

  test("fingerprint is stable for identical facts and changes with the prediction", () => {
    const first = forecastActionsKit.actionsFingerprint(actionFacts());
    const second = forecastActionsKit.actionsFingerprint(actionFacts());
    assert.equal(first, second);
    const changed = forecastActionsKit.actionsFingerprint(
      actionFacts({ probability: 60 })
    );
    assert.notEqual(first, changed);
  });

  test("prompt includes the computed zone, risk level, and incident types", () => {
    const prompt = forecastActionsKit.buildActionsPrompt(actionFacts());
    assert.match(prompt, /Poblacion/);
    assert.match(prompt, /HIGH/);
    assert.match(prompt, /92%/);
    assert.match(prompt, /Theft 50%/);
    assert.match(prompt, /\+14%/);
  });

  test("parser accepts a fenced JSON array and wraps object responses", () => {
    const fromArray = forecastActionsKit.parseActionsResponse(
      '```json\n["Increase patrol in Poblacion", "Notify standby units", "Review incoming reports"]\n```'
    );
    assert.ok(fromArray);
    assert.equal(fromArray.length, 3);

    const fromObject = forecastActionsKit.parseActionsResponse(
      '{"actions": ["Watch Poblacion at night", "Stage response units", "Verify high-severity reports", "Brief barangay officials"]}'
    );
    assert.ok(fromObject);
    assert.equal(fromObject.length, 4);
  });

  test("parser rejects fewer than 3 items and non-JSON output", () => {
    assert.equal(
      forecastActionsKit.parseActionsResponse('["Only one action"]'),
      null
    );
    assert.equal(
      forecastActionsKit.parseActionsResponse("Increase patrols tonight"),
      null
    );
  });
});

describe("API", () => {
  let server: Server | undefined;
  let baseUrl = "";

  const UUID = "00000000-0000-0000-0000-000000000000";

  const postJson = (path: string, body: object) =>
    fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  before(async () => {
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      server?.once("listening", () => resolve());
      server?.once("error", reject);
    });
    const address = server?.address() as AddressInfo | null;
    baseUrl = `http://127.0.0.1:${address?.port ?? 0}`;
  });

  after(() => {
    server?.closeAllConnections?.();
    server?.close();
  });

  test("GET / serves the root health check", async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /It is working/);
  });

  test("GET /health supplies Render's unauthenticated liveness probe", async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "ok" });
  });

  describe("public auth routes reject empty payloads with 400", () => {
    const publicCases: Array<{ path: string; error: string }> = [
      {
        path: "/api/register",
        error: "Username, email, and password are required",
      },
      { path: "/api/login", error: "Email and password are required" },
      { path: "/api/admin/login", error: "Email and password are required" },
      { path: "/api/forgot-password", error: "Email is required" },
      { path: "/api/verify-otp", error: "Email and OTP are required" },
      {
        path: "/api/reset-password",
        error: "Email and new password are required",
      },
    ];

    for (const route of publicCases) {
      test(`POST ${route.path}`, async () => {
        const res = await postJson(route.path, {});
        assert.equal(res.status, 400);
        const body = (await res.json()) as { error?: string };
        assert.equal(body.error, route.error);
      });
    }
  });

  describe("POST /api/register enforces input validation before creating an account", () => {
    test("rejects an invalid email address", async () => {
      const res = await postJson("/api/register", {
        userName: "TestUser",
        email: "not-an-email",
        password: "Str0ng!pass1",
        termsVersion: "1.0",
      });
      assert.equal(res.status, 400);
      const body = (await res.json()) as { error?: string };
      assert.equal(body.error, "Please enter a valid email address");
    });

    const weakPasswordCases: Array<{ password: string; error: string }> = [
      { password: "Sh0rt!a", error: "Password must be 8 to 16 characters." },
      { password: "lowercase1!x", error: "Password must contain at least one uppercase letter." },
      { password: "NoDigits!Long", error: "Password must contain at least one number." },
      { password: "NoSpecial12345", error: "Password must contain at least one special character." },
      { password: "TooLongPassword1234!x", error: "Password must be 8 to 16 characters." },
    ];

    for (const weak of weakPasswordCases) {
      test(`rejects weak password "${weak.password}"`, async () => {
        const res = await postJson("/api/register", {
          userName: "TestUser",
          email: "user@example.com",
          password: weak.password,
          termsVersion: "1.0",
        });
        assert.equal(res.status, 400);
        const body = (await res.json()) as { error?: string };
        assert.equal(body.error, weak.error);
      });
    }
  });

  describe("protected routes reject requests without a token", () => {
    const protectedRoutes: Array<{ method: string; path: string }> = [
      { method: "GET", path: "/api/profile" },
      { method: "GET", path: "/api/session" },
      { method: "GET", path: "/api/profile/notification-preferences" },
      { method: "PATCH", path: "/api/profile/notification-preferences" },
      { method: "PUT", path: "/api/profile" },
      { method: "PUT", path: "/api/profile/email" },
      { method: "PUT", path: "/api/profile/password" },
      { method: "GET", path: "/api/terms/status" },
      { method: "POST", path: "/api/terms/accept" },
      { method: "POST", path: "/api/admin/register" },
      { method: "GET", path: "/api/admin/accounts" },
      { method: "PUT", path: `/api/admin/accounts/${UUID}` },
      { method: "DELETE", path: `/api/admin/accounts/${UUID}` },
      { method: "PATCH", path: `/api/admin/accounts/${UUID}/status` },

      { method: "GET", path: "/api/reports" },
      { method: "GET", path: "/api/reports/mine" },
      { method: "GET", path: `/api/reports/${UUID}` },
      { method: "GET", path: `/api/reports/${UUID}/comments` },
      { method: "POST", path: `/api/reports/${UUID}/comments` },
      { method: "POST", path: `/api/reports/${UUID}/like` },
      { method: "POST", path: `/api/reports/${UUID}/status` },
      { method: "POST", path: "/api/reports" },
      { method: "PUT", path: `/api/reports/${UUID}` },
      { method: "DELETE", path: `/api/reports/${UUID}` },
      { method: "GET", path: "/api/incidents/options" },
      { method: "GET", path: "/api/admin/posts" },
      { method: "GET", path: "/api/admin/dashboard" },
      { method: "GET", path: "/api/admin/overview" },
      { method: "GET", path: "/api/admin/risk-outlook" },
      { method: "GET", path: "/api/admin/analytics" },
      { method: "POST", path: "/api/admin/announcements" },
      { method: "GET", path: "/api/admin/announcements" },
      { method: "GET", path: "/api/admin/logs" },

      { method: "GET", path: "/api/notifications" },
      { method: "GET", path: "/api/notifications/login-activity" },
      { method: "PATCH", path: "/api/notifications/read-all" },
      { method: "PATCH", path: `/api/notifications/${UUID}/read` },
      { method: "GET", path: "/api/admin/notifications" },
      { method: "PATCH", path: "/api/admin/notifications/read-all" },
      { method: "PATCH", path: `/api/admin/notifications/${UUID}/read` },

      { method: "GET", path: "/api/facilities/nearby" },

      { method: "GET", path: "/api/admin/settings" },
      { method: "PUT", path: "/api/admin/settings" },

      { method: "POST", path: "/api/upload/image" },

      { method: "GET", path: "/api/ai/status" },
      { method: "GET", path: "/api/sentiment/datasets" },
      { method: "GET", path: "/api/sentiment/training" },
      { method: "POST", path: "/api/sentiment/training" },
      { method: "POST", path: "/api/sentiment/datasets/preview" },
      { method: "POST", path: "/api/sentiment/datasets" },
      { method: "GET", path: "/api/sentiment/datasets/00000000-0000-0000-0000-000000000000" },
      { method: "PATCH", path: "/api/sentiment/datasets/00000000-0000-0000-0000-000000000000/samples/00000000-0000-0000-0000-000000000000" },
      { method: "POST", path: "/api/sentiment/datasets/00000000-0000-0000-0000-000000000000/review" },
      { method: "GET", path: "/api/sentiment/datasets/00000000-0000-0000-0000-000000000000/export" },
      { method: "POST", path: `/api/ai/analyze/${UUID}` },
      { method: "POST", path: "/api/ai/batch-analyze" },
      { method: "PUT", path: "/api/ai/toggle" },
      {
        method: "POST",
        path: `/api/ai/sentiment/reanalyze/report/${UUID}`,
      },
      { method: "POST", path: "/api/ai/sentiment/reanalyze" },
      { method: "POST", path: "/api/ai/sentiment/reanalyze-all" },
    ];

    for (const route of protectedRoutes) {
      test(`${route.method} ${route.path}`, async () => {
        const res = await fetch(`${baseUrl}${route.path}`, {
          method: route.method,
        });
        assert.equal(res.status, 401);
        const body = (await res.json()) as { error?: string };
        assert.equal(body.error, "Missing or invalid authorization header");
      });
    }
  });

  test("invalid bearer token is rejected as invalid or expired", async () => {
    const res = await fetch(`${baseUrl}/api/reports`, {
      headers: { Authorization: "Bearer not-a-real-token" },
    });
    assert.equal(res.status, 401);
    const body = (await res.json()) as { error?: string };
    assert.equal(body.error, "Invalid or expired token");
  });

  test("unknown API route returns 404", async () => {
    const res = await fetch(`${baseUrl}/api/definitely-not-a-route`);
    assert.equal(res.status, 404);
  });

  test("malformed JSON body is handled by the error handler", async () => {
    const originalError = console.error;
    console.error = () => {};
    try {
      const res = await fetch(`${baseUrl}/api/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ this is not json",
      });
      assert.equal(res.status, 500);
      const body = (await res.json()) as { error?: string };
      assert.equal(body.error, "Internal server error");
    } finally {
      console.error = originalError;
    }
  });

  test("CORS preflight is answered", async () => {
    const res = await fetch(`${baseUrl}/api/profile`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://example.com",
        "Access-Control-Request-Method": "GET",
      },
    });
    assert.ok(res.status === 204 || res.status === 200);
    assert.ok(res.headers.get("access-control-allow-origin"));
  });
});
