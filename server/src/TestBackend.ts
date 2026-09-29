import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import app from "../api/index.js";
import {
  __testing as sentimentKit,
  detectSentimentLanguage,
  normalizeSentimentLabel,
  sentimentInputHash,
  sentimentService,
  type SentimentPrediction,
} from "./services/sentimentService.js";
import {
  __testing as rotationKit,
  candidateModels,
  clearModelExhaustion,
  markModelExhausted,
} from "./services/geminiRotation.js";
import { __testing as aiKit } from "./services/aiService.js";
import { validateSetting } from "./controllers/settingsController.js";

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

  test("detectSentimentLanguage routes cebuano over filipino on cebuano markers", () => {
    assert.equal(
      detectSentimentLanguage("Unsa ang mahitabo ugma sa daplin?"),
      "cebuano"
    );
    assert.equal(
      detectSentimentLanguage("Gym gyud kaayo ang dili niini"),
      "cebuano"
    );
  });

  test("detectSentimentLanguage identifies english, filipino, and unknown", () => {
    assert.equal(
      detectSentimentLanguage("Thank you for the update, this is very helpful"),
      "english"
    );
    assert.equal(detectSentimentLanguage("Hindi ako papayag dito"), "filipino");
    assert.equal(detectSentimentLanguage("12345 !!!"), "unknown");
    assert.equal(detectSentimentLanguage(""), "unknown");
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

  describe("protected routes reject requests without a token", () => {
    const protectedRoutes: Array<{ method: string; path: string }> = [
      { method: "GET", path: "/api/profile" },
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
      { method: "GET", path: "/api/admin/analytics" },
      { method: "POST", path: "/api/admin/announcements" },
      { method: "GET", path: "/api/admin/logs" },

      { method: "GET", path: "/api/notifications" },
      { method: "GET", path: "/api/notifications/login-activity" },
      { method: "PATCH", path: "/api/notifications/read-all" },
      { method: "PATCH", path: `/api/notifications/${UUID}/read` },
      { method: "GET", path: "/api/admin/notifications" },
      { method: "PATCH", path: `/api/admin/notifications/${UUID}/read` },

      { method: "GET", path: "/api/facilities/nearby" },

      { method: "GET", path: "/api/admin/settings" },
      { method: "PUT", path: "/api/admin/settings" },

      { method: "POST", path: "/api/upload/image" },

      { method: "GET", path: "/api/ai/status" },
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
