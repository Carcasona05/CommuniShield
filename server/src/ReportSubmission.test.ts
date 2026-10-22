import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, Response } from "express";
import { createReport } from "./controllers/reportController.js";
import { reportService } from "./services/reportService.js";
import { profileService } from "./services/authService.js";
import { backgroundTasks } from "./services/backgroundTasks.js";
import { reportSubmissionService } from "./services/reportSubmissionService.js";
import { credibilityService } from "./services/credibilityService.js";
import { notificationService } from "./services/notificationService.js";
import { aiService } from "./services/aiService.js";
import { sentimentService } from "./services/sentimentService.js";
import { supabaseAdmin } from "./config/supabaseAdmin.js";
import { uploadService } from "./services/uploadService.js";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};
const response = () => {
  const output = { status: 0, body: null as Record<string, unknown> | null };
  const res = { status(code: number) { output.status = code; return this; }, json(value: Record<string, unknown>) { output.body = value; return this; } } as unknown as Response;
  return { output, res };
};
const request = () => ({ user: { id: "owner" }, body: { incident_category: "Public Safety", incident_type: "Theft", location: "Lamacan, Carlock Street, Argao", latitude: "9.8816", longitude: "123.5953", details: "Fictional test" } }) as unknown as Request;
const submitted = { ownerId: "owner", reportId: "report-1", incidentCategory: "Public Safety", incidentType: "Theft", location: "Lamacan", latitude: 9.8816, longitude: 123.5953, details: "Fictional test" };

test("HTTP 201 is returned while tracked background analysis is still unfinished", async (t) => {
  t.mock.method(profileService, "getProfile", async () => ({ data: { role: "user" }, error: null }));
  t.mock.method(reportService, "createReport", async () => ({ data: { id: "report-1", location: "Lamacan" }, error: null }));
  const gate = deferred<void>();
  const work = t.mock.method(reportSubmissionService, "process", async () => gate.promise);
  const symbol = Symbol.for("@vercel/request-context");
  const globals = globalThis as unknown as Record<symbol, unknown>;
  const original = globals[symbol];
  const tracked: Promise<void>[] = [];
  globals[symbol] = { get: () => ({ waitUntil: (promise: Promise<void>) => tracked.push(promise) }) };
  t.after(() => { if (original === undefined) delete globals[symbol]; else globals[symbol] = original; });
  const { output, res } = response();
  // A blocked model cannot block this controller promise. Timeout prevents a
  // regression from hanging the test suite indefinitely, not a speed target.
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([createReport(request(), res), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("Submission waited for AI")), 2000); })]);
    assert.equal(output.status, 201);
    assert.equal(output.body?.report_id, "report-1");
    assert.equal((output.body?.analysis as Record<string, unknown>).credibility, "pending");
    assert.equal((output.body?.analysis as Record<string, unknown>).sentiment_status, "pending");
    assert.equal(work.mock.callCount(), 1);
    assert.equal(tracked.length, 1, "the real Vercel waitUntil hook must receive the work");
  } finally {
    clearTimeout(timeout);
    gate.resolve();
    await Promise.all(tracked);
  }
});

test("a report is not acknowledged before persistence succeeds; failures enqueue nothing", async (t) => {
  t.mock.method(profileService, "getProfile", async () => ({ data: { role: "user" }, error: null }));
  const gate = deferred<void>();
  t.mock.method(reportService, "createReport", async () => { await gate.promise; return { error: "Storage unavailable" }; });
  const queue = t.mock.method(backgroundTasks, "schedule", async () => {});
  const { output, res } = response();
  const pending = createReport(request(), res);
  await Promise.resolve();
  assert.equal(output.body, null);
  assert.equal(queue.mock.callCount(), 0);
  gate.resolve();
  await pending;
  assert.equal(output.status, 400);
  assert.equal(queue.mock.callCount(), 0);
});

test("background failures are caught rather than becoming unhandled rejections", async (t) => {
  const log = t.mock.method(console, "error", () => {});
  await backgroundTasks.schedule("test", async () => { throw new Error("Model unavailable"); });
  assert.equal(log.mock.callCount(), 1);
});

test("post-processing preserves points, notifications and analysis without tying independent work together", async (t) => {
  const points = t.mock.method(credibilityService, "addPoints", async () => ({ data: 65, error: null }));
  const nearby = t.mock.method(notificationService, "notifyNearbyUsers", async () => ({ data: 0, error: null }));
  const admins = t.mock.method(notificationService, "notifyAllAdmins", async () => ({ data: 1, error: null }));
  t.mock.method(aiService, "analyzeReport", async () => ({ ai_score: 80, severity: "High", credibility_review: "Synthetic test", status: "succeeded" }));
  const gate = deferred<void>();
  t.mock.method(sentimentService, "analyze", async () => { await gate.promise; throw new Error("Sentiment unavailable"); });
  const log = t.mock.method(console, "error", () => {});
  const processing = reportSubmissionService.process(submitted);
  // Allow immediate fulfilled service promises to finish, while sentiment is held.
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.equal(points.mock.callCount(), 1);
  assert.equal(nearby.mock.callCount(), 1);
  assert.equal(admins.mock.callCount(), 1, "admin notifications do not wait for sentiment");
  assert.equal(admins.mock.calls[0]?.arguments[0]?.priority, "High");
  gate.resolve();
  await processing;
  assert.equal(log.mock.callCount(), 1);
});

test("failed credibility still sends the existing medium-priority admin notification", async (t) => {
  t.mock.method(credibilityService, "addPoints", async () => { throw new Error("Points unavailable"); });
  t.mock.method(notificationService, "notifyNearbyUsers", async () => ({ data: 0, error: null }));
  t.mock.method(aiService, "analyzeReport", async () => { throw new Error("Gemini unavailable"); });
  t.mock.method(sentimentService, "analyze", async () => { throw new Error("Sentiment unavailable"); });
  const admins = t.mock.method(notificationService, "notifyAllAdmins", async () => ({ data: 1, error: null }));
  t.mock.method(console, "error", () => {});
  await reportSubmissionService.process(submitted);
  assert.equal(admins.mock.calls[0]?.arguments[0]?.priority, "Medium");
});

test("persistence preserves street details, uses no network geocoder and waits for photo links", async (t) => {
  const images = deferred<void>();
  const startedImages = deferred<void>();
  let saved: Record<string, unknown> = {};
  const tables: string[] = [];
  const from = (table: string) => {
    tables.push(table);
    const builder: Record<string, unknown> = {};
    builder.select = () => builder;
    builder.eq = () => builder;
    builder.insert = (value: Record<string, unknown>) => {
      if (table === "reports") saved = value;
      if (table === "report_images") startedImages.resolve();
      return builder;
    };
    builder.maybeSingle = async () => ({ data: table === "incident_categories" ? { id: "category" } : table === "incident_types" ? { id: "type" } : { id: "report-1", location: saved.location }, error: null });
    builder.then = (resolve: never, reject: never) => (table === "report_images" ? images.promise : Promise.resolve()).then(() => ({ data: null, error: null })).then(resolve, reject);
    return builder;
  };
  t.mock.method(supabaseAdmin, "from", from as unknown as typeof supabaseAdmin.from);
  const network = t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected reverse geocode request"); });
  let finished = false;
  const saving = reportService.createReport("owner", { incident_category: "Public Safety", incident_type: "Theft", location: "Lamacan, Carlock Street, Argao", latitude: "9.8816", longitude: "123.5953", photos: ["https://example.test/photo.jpg"] }).then((value) => { finished = true; return value; });
  await startedImages.promise;
  assert.equal(finished, false);
  images.resolve();
  const result = await saving;
  assert.equal(result.data?.location, "Lamacan, Carlock Street, Argao");
  assert.equal(network.mock.callCount(), 0);
  assert.equal(tables.filter((table) => table === "reports").length, 1, "no redundant location reread/update");
});

test("parallel uploads cannot overwrite same-named photos and share bucket initialization", async (t) => {
  const bucket = t.mock.method(supabaseAdmin.storage, "listBuckets", async () => ({ data: [{ name: "report-images" }], error: null }));
  const paths: string[] = [];
  const from = () => ({
    upload: async (path: string, _bytes: unknown, options: { upsert: boolean }) => { paths.push(path); assert.equal(options.upsert, false); return { data: {}, error: null }; },
    getPublicUrl: (path: string) => ({ data: { publicUrl: `https://example.test/${path}` } }),
  });
  t.mock.method(supabaseAdmin.storage, "from", from as unknown as typeof supabaseAdmin.storage.from);
  const result = await Promise.all(Array.from({ length: 3 }, () => uploadService.uploadImage("aGVsbG8=", "same.jpg", "image/jpeg")));
  assert.equal(bucket.mock.callCount(), 1);
  assert.equal(new Set(paths).size, 3);
  assert.ok(result.every((value) => value.data?.url));
});
