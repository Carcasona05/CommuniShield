import "dotenv/config";
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { chooseRawConfidenceWinner, confidenceBand, type ConfidenceCandidate } from "./services/sentimentConfidenceRouting.js";
import { __testing, sentimentInputHash, sentimentService, type LocalModelLanguage, type SentimentPrediction } from "./services/sentimentService.js";
import { supabaseAdmin } from "./config/supabaseAdmin.js";

const candidate = (id: string, label: ConfidenceCandidate["label"], confidence: number): ConfidenceCandidate => ({
  id, source: id === "gemini" ? "gemini" : id.startsWith("support") ? "supporting" : "builtin",
  model: id, label, confidence,
});
const prediction = (label: SentimentPrediction["label"], confidence: number, gemini = false): SentimentPrediction => ({
  label, confidence, provider: gemini ? "gemini" : "local", model: gemini ? "gemini-test" : "builtin-test",
  language: "cebuano", input_hash: "original-hash", source_text: "bitaw akong anak nagkasakit",
});

test("45% is inclusive; 85% only changes the display band", () => {
  assert.equal(confidenceBand(.449999), "low");
  assert.equal(confidenceBand(.45), "moderate");
  assert.equal(confidenceBand(.849999), "moderate");
  assert.equal(confidenceBand(.85), "high");
  assert.equal(confidenceBand(1), "high");
  assert.equal(chooseRawConfidenceWinner([candidate("builtin", "positive", .45)]).label, "positive");
});
for (const [title, inputs, label, confidence] of [
  ["all below minimum abstain", [candidate("builtin", "positive", .44), candidate("gemini", "positive", .4)], "unclear", 0],
  ["moderate disagreement uses the higher raw score", [candidate("builtin", "negative", .7), candidate("gemini", "neutral", .65)], "negative", .7],
  ["high disagreement uses the higher raw score", [candidate("builtin", "positive", .9), candidate("support", "neutral", .92), candidate("gemini", "negative", .95)], "negative", .95],
  ["agreement retains highest score, not average", [candidate("builtin", "positive", .8), candidate("gemini", "positive", .6)], "positive", .8],
  ["one available source can win", [candidate("builtin", "neutral", .6)], "neutral", .6],
  ["same-label exact tie succeeds", [candidate("builtin", "negative", .9), candidate("gemini", "negative", .9)], "negative", .9],
  ["different-label exact tie abstains", [candidate("builtin", "negative", .9), candidate("gemini", "neutral", .9)], "unclear", 0],
  ["near-ties are not exact ties", [candidate("builtin", "negative", .90001), candidate("gemini", "neutral", .9)], "negative", .90001],
  ["duplicate supports do not accumulate confidence", [candidate("support1", "neutral", .78), candidate("support2", "neutral", .78), candidate("gemini", "negative", .95)], "negative", .95],
  ["a source that says unclear abstains", [candidate("gemini", "unclear", .99), candidate("builtin", "positive", .7)], "positive", .7],
  ["existing mixed label remains supported", [candidate("gemini", "mixed", .9)], "mixed", .9],
] as const) {
  test(title, () => {
    const result = chooseRawConfidenceWinner([...inputs]);
    assert.equal(result.label, label);
    assert.equal(result.confidence, confidence);
    assert.equal(result.decision.candidates.length, inputs.length);
  });
}
test("invalid scores cannot become winners through clamping or coercion", () => {
  const result = chooseRawConfidenceWinner([NaN, Infinity, -1, 95].map((score, i) => candidate(`bad${i}`, "negative", score)));
  assert.equal(result.label, "unclear");
  assert.ok(result.decision.candidates.every(item => item.confidence === null && !item.eligible));
  assert.equal(chooseRawConfidenceWinner([]).decision.reason, "no_candidates");
});
test("measured illness example selects Gemini's negative 95% without a confidence discount", () => {
  const sources = [candidate("builtin", "neutral", .7542172074317932),
    candidate("support1", "neutral", .7772260308265686), candidate("support2", "neutral", .7772260308265686)];
  const local = { ...prediction("neutral", .7772260308265686), decision: chooseRawConfidenceWinner(sources).decision };
  const gemini = { ...prediction("negative", .95, true), input_hash: "not-authoritative", source_text: "different" };
  const { prediction: result } = __testing.fuseLocalWithGeminiAssist(local, gemini);
  assert.equal(result.label, "negative");
  assert.equal(result.confidence, .95);
  assert.equal(result.provider, "gemini");
  assert.equal(result.model, "gemini-test");
  assert.equal(result.input_hash, "original-hash");
  assert.equal(result.source_text, local.source_text);
  assert.equal(result.decision?.candidates.length, 4);
});
test("local ties are compared globally rather than silently discarded", () => {
  const local = { ...prediction("unclear", 0), decision: chooseRawConfidenceWinner([
    candidate("builtin", "neutral", .95), candidate("support", "negative", .95),
  ]).decision };
  const result = __testing.fuseLocalWithGeminiAssist(local, prediction("positive", .9, true)).prediction;
  assert.equal(result.label, "unclear");
  assert.equal(result.decision?.reason, "conflicting_top_tie");
});

function setup(t: TestContext, local: SentimentPrediction | Error, gemini: SentimentPrediction | Error) {
  const old = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "offline-test-not-a-key";
  t.after(() => { if (old === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = old; });
  const dependencies = __testing.predictionDependencies;
  t.mock.method(dependencies, "settings", async () => ({ sentiment_gemini_enabled: "true", sentiment_local_model_enabled: "true", sentiment_cebuano_mode: "local" }));
  t.mock.method(dependencies, "detectLanguage", async () => "cebuano" as const);
  t.mock.method(dependencies, "runLocalPrediction", async () => { if (local instanceof Error) throw local; return local; });
  return t.mock.method(dependencies, "callGeminiSentiment", async () => { if (gemini instanceof Error) throw gemini; return gemini; });
}
test("production predict applies the minimum even when Gemini fails", async t => {
  setup(t, prediction("neutral", .44), new Error("offline"));
  const result = await __testing.predict("test text");
  assert.equal(result.prediction.label, "unclear");
  assert.equal(result.errorCode, "");
});
test("production predict applies the minimum when only Gemini succeeds", async t => {
  setup(t, new Error("local unavailable"), prediction("positive", .44, true));
  assert.equal((await __testing.predict("test text")).prediction.label, "unclear");
});
test("production Gemini-only mode uses the same minimum and trace", async t => {
  setup(t, new Error("must not call local"), prediction("positive", .44, true));
  t.mock.method(__testing.predictionDependencies, "settings", async () => ({ sentiment_local_model_enabled: "false", sentiment_gemini_enabled: "true" }));
  const result = await __testing.predict("test text");
  assert.equal(result.prediction.label, "unclear");
  assert.equal(result.prediction.decision?.candidates.length, 1);
});
test("local-only requests never call Gemini and retain raw local confidence", async t => {
  const gemini = setup(t, prediction("negative", .6), prediction("neutral", .99, true));
  const result = await __testing.predict("test text", undefined, true);
  assert.equal(result.prediction.label, "negative");
  assert.equal(result.prediction.confidence, .6);
  assert.equal(gemini.mock.callCount(), 0);
});
test("unknown-language fallback preserves conflicting ties", async t => {
  setup(t, prediction("negative", .9), new Error("not used"));
  t.mock.method(__testing.predictionDependencies, "settings", async () => ({ sentiment_gemini_enabled: "false" }));
  t.mock.method(__testing.predictionDependencies, "detectLanguage", async () => "unknown" as const);
  t.mock.method(__testing.predictionDependencies, "runLocalPrediction", async (language: LocalModelLanguage) => ({
    ...prediction(language === "english" ? "positive" : "negative", .9), model: language, language,
  }));
  assert.equal((await __testing.predict("test text")).prediction.label, "unclear");
});

test("analysis persists and returns all source scores under existing claim fences", async t => {
  setup(t, prediction("neutral", .7772260308265686), prediction("negative", .95, true));
  const old = process.env.SENTIMENT_MODEL_REGISTRY_ENABLED;
  process.env.SENTIMENT_MODEL_REGISTRY_ENABLED = "false";
  t.after(() => { if (old === undefined) delete process.env.SENTIMENT_MODEL_REGISTRY_ENABLED; else process.env.SENTIMENT_MODEL_REGISTRY_ENABLED = old; });
  let row: Record<string, unknown> | null = null;
  const updates: Array<{ data: Record<string, unknown>; filters: Array<[string, unknown]> }> = [];
  t.mock.method(supabaseAdmin, "from", ((table: string) => {
    let inserted: Record<string, unknown> | undefined;
    let update: Record<string, unknown> | undefined;
    const filters: Array<[string, unknown]> = [];
    const query = {
      select() { return this; },
      eq(name: string, value: unknown) { filters.push([name, value]); return this; },
      insert(values: Array<Record<string, unknown>>) { inserted = values[0]; return this; },
      update(values: Record<string, unknown>) { update = values; return this; },
      async maybeSingle() {
        if (table === "reports") return { data: { details: "bitaw akong anak nagkasakit" }, error: null };
        assert.equal(table, "sentiment_analysis");
        if (inserted) row = { id: "claim-id", ...inserted };
        if (update) {
          updates.push({ data: update, filters });
          row = { ...row, ...update };
        }
        return { data: row, error: null };
      },
    };
    return query;
  }) as never);
  // Match predictor identity to the actual source snapshot used by the claim.
  t.mock.method(__testing.predictionDependencies, "runLocalPrediction", async () => ({
    ...prediction("neutral", .7772260308265686), input_hash: sentimentInputHash("bitaw akong anak nagkasakit"),
  }));
  const result = await sentimentService.analyze("report", "report-id", { requestId: "request-id" });
  assert.equal(result.status, "succeeded");
  assert.equal(result.label, "negative");
  assert.equal(result.confidence, .95);
  assert.equal(result.decision?.candidates.length, 2);
  assert.equal(result.decision?.winnerId, "gemini:gemini-test");
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0]?.data.decision, result.decision);
  for (const pair of [["id", "claim-id"], ["status", "pending"], ["request_id", "request-id"],
    ["input_hash", sentimentInputHash("bitaw akong anak nagkasakit")]]) {
    assert.ok(updates[0]?.filters.some(filter => filter[0] === pair[0] && filter[1] === pair[1]));
  }
});
