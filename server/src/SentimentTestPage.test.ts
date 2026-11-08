import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { Request, Response } from "express";
import { testSentiment, sentimentTestDependencies } from "./controllers/sentimentTestController.js";
import { __testing, sentimentService, type SentimentPrediction } from "./services/sentimentService.js";
import { supabaseAdmin } from "./config/supabaseAdmin.js";
import { readFileSync } from "node:fs";
const request = (body: unknown, id = randomUUID()) => ({ body, user: { id } }) as unknown as Request & { user: { id: string } };
function response() {
  const result = { status: 200, body: null as any, headers: {} as Record<string, string> };
  const res = { setHeader(key: string, value: string) { result.headers[key] = value; },
    status(code: number) { result.status = code; return this; }, json(body: unknown) { result.body = body; return this; } } as unknown as Response;
  return { res, result };
}
const prediction: SentimentPrediction = { label: "negative", confidence: .95, language: "cebuano", provider: "gemini", model: "test", source_text: "text", input_hash: "hash" };

test("test endpoint validates input and authentication without running a provider", async t => {
  const run = t.mock.method(sentimentTestDependencies, "testText", async () => ({ prediction, errorCode: "" }));
  const unauth = response();
  await testSentiment({ body: {} } as Request, unauth.res);
  assert.equal(unauth.result.status, 401);
  for (const body of [{}, { text: " " }, { text: 5 }, { text: "a".repeat(2001) }, { text: "hello", context: 12 }, { text: "hello", context: "a".repeat(601) }]) {
    const out = response(); await testSentiment(request(body), out.res); assert.equal(out.result.status, 400);
  }
  assert.equal(run.mock.callCount(), 0);
});
test("test endpoint returns unsaved production result, trims text and disables response caching", async t => {
  const run = t.mock.method(sentimentTestDependencies, "testText", async () => ({ prediction, errorCode: "" }));
  const out = response(); await testSentiment(request({ text: " text ", context: " context " }), out.res);
  assert.deepEqual(run.mock.calls[0]?.arguments, ["text", "context"]);
  assert.equal(out.result.status, 200); assert.equal(out.result.body.saved, false);
  assert.equal(out.result.headers["Cache-Control"], "no-store");
});
test("test endpoint limits each account to five tests per minute", async t => {
  t.mock.method(sentimentTestDependencies, "testText", async () => ({ prediction, errorCode: "" }));
  const id = randomUUID();
  for (let i = 0; i < 5; i++) { const out = response(); await testSentiment(request({ text: "hello" }, id), out.res); assert.equal(out.result.status, 200); }
  const out = response(); await testSentiment(request({ text: "hello" }, id), out.res);
  assert.equal(out.result.status, 429);
});
test("provider errors are not exposed to the browser", async t => {
  t.mock.method(sentimentTestDependencies, "testText", async () => { throw new Error("secret upstream body"); });
  const out = response(); await testSentiment(request({ text: "hello" }), out.res);
  assert.equal(out.result.status, 503);
  assert.ok(!JSON.stringify(out.result.body).includes("secret"));
});
test("testText uses the serving pipeline with usage writes disabled and no database persistence", async t => {
  t.mock.method(supabaseAdmin, "from", (() => { throw new Error("No database writes or claims allowed"); }) as never);
  t.mock.method(supabaseAdmin, "rpc", (() => { throw new Error("No usage RPC allowed"); }) as never);
  t.mock.method(__testing.predictionDependencies, "settings", async () => ({ sentiment_gemini_enabled: "false" }));
  t.mock.method(__testing.predictionDependencies, "detectLanguage", async () => "cebuano" as const);
  const run = t.mock.method(__testing.predictionDependencies, "runLocalPrediction", async () => ({ ...prediction, provider: "local" as const }));
  const result = await sentimentService.testText("text");
  assert.equal(run.mock.calls[0]?.arguments[2], false);
  assert.equal(result.prediction.decision?.policy, "raw-confidence-v1");
});
test("both test routes are guarded for admin roles; page has no polling or storage", () => {
  const routes = readFileSync(new URL("./routes/aiRoute.ts", import.meta.url), "utf8");
  assert.match(routes, /router\.get\("\/sentiment\/test", authenticate, adminOnly/);
  assert.match(routes, /router\.post\("\/sentiment\/test", authenticate, adminOnly, testSentiment\)/);
  assert.match(routes, /const adminOnly = requireRole\(\["admin", "super_admin"\]\)/);
  const page = readFileSync(new URL("../../clients/app/SentimentTest.jsx", import.meta.url), "utf8");
  assert.match(page, /apiClient\.get\("\/sentiment\/test", \{ cacheMode: "network" \}/);
  assert.doesNotMatch(page, /setInterval|useAutoRefresh|AsyncStorage|GEMINI_API_KEY/);
});
