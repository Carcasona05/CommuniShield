import assert from "node:assert/strict";
import { test } from "node:test";
import { createLocalSentimentSummary, localSentimentOutcome, recordLocalSentimentResult } from "../../server/scripts/seed/localSentimentSummary.js";
import { chooseRawConfidenceWinner } from "./services/sentimentConfidenceRouting.js";

const result = (overrides = {}) => ({ status: "succeeded", provider: "local", label: "negative",
  model: "word-character-tfidf-logistic-regression-cebuano@bundled", error_code: "", ...overrides });

test("local supporting ensembles count as success instead of false failures", () => {
  assert.equal(localSentimentOutcome(result()), "succeeded");
  assert.equal(localSentimentOutcome(result({ provider: "ensemble", model: "cascade:supporting|validated_support|builtin:bundled|support:id" })), "succeeded");
});
test("a successful unclear cascade is a counted abstention, not an inference failure", () => {
  const summary = createLocalSentimentSummary(1);
  recordLocalSentimentResult(summary, result({ provider: "ensemble", model: "cascade:unclear|support_disagreement|builtin:bundled|support:id", label: "unclear" }));
  assert.equal(summary.succeeded, 1);
  assert.equal(summary.failed, 0);
  assert.equal(summary.labels.unclear, 1);
  assert.equal(summary.origins.unresolved, 1);
});
test("unavailable and pending results are separate from actual failures", () => {
  const summary = createLocalSentimentSummary(4);
  recordLocalSentimentResult(summary, result({ status: "unavailable", provider: "none", model: "none", error_code: "language_uncertain", label: "unclear" }));
  recordLocalSentimentResult(summary, result({ status: "pending", provider: "none", model: "pending", label: "unclear" }));
  recordLocalSentimentResult(summary, result({ status: "failed", error_code: "model_error" }));
  recordLocalSentimentResult(summary, result({ status: "skipped" }));
  assert.equal(summary.unavailable, 2);
  assert.equal(summary.pending, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.succeeded, 0);
  assert.deepEqual(summary.labels, {});
});
test("Gemini and Gemini-assisted ensembles are not accepted as local-only success", () => {
  assert.equal(localSentimentOutcome(result({ provider: "gemini", model: "gemini-model" })), "failed");
  assert.equal(localSentimentOutcome(result({ provider: "ensemble", model: "assist:agree|builtin+gemini" })), "failed");
  assert.equal(localSentimentOutcome(result({ provider: "ensemble", model: "unrecognized" })), "failed");
  assert.equal(localSentimentOutcome(result({ error_code: "unexpected_error" })), "failed");
});
test("label and origin totals include built-in and supporting local predictions", () => {
  const summary = createLocalSentimentSummary(3);
  recordLocalSentimentResult(summary, result({ label: "positive" }));
  recordLocalSentimentResult(summary, result({ provider: "ensemble", model: "cascade:supporting|validated_support", label: "negative" }));
  recordLocalSentimentResult(summary, result({ provider: "ensemble", model: "cascade:unclear|no_reliable_support", label: "unclear" }));
  assert.equal(summary.succeeded, 3);
  assert.deepEqual(summary.labels, { positive: 1, negative: 1, unclear: 1 });
  assert.deepEqual(summary.origins, { builtin: 1, supporting: 1, unresolved: 1 });
});

test("raw-policy traces count local supports and abstentions without counting Gemini evidence", () => {
  const candidates = [{ id: "builtin", source: "builtin" as const, model: "builtin", label: "neutral" as const, confidence: .7 },
    { id: "support", source: "supporting" as const, model: "support", label: "negative" as const, confidence: .9 }];
  const summary = createLocalSentimentSummary(2);
  recordLocalSentimentResult(summary, result({ provider: "ensemble", decision: chooseRawConfidenceWinner(candidates).decision }));
  recordLocalSentimentResult(summary, result({ provider: "ensemble", label: "unclear", decision: chooseRawConfidenceWinner(candidates.map(candidate => ({ ...candidate, confidence: .4 }))).decision }));
  assert.equal(summary.succeeded, 2);
  assert.deepEqual(summary.origins, { builtin: 0, supporting: 1, unresolved: 1 });
  const withGemini = chooseRawConfidenceWinner([...candidates, { id: "gemini", source: "gemini", model: "gemini", label: "positive", confidence: .8 }]).decision;
  assert.equal(localSentimentOutcome(result({ decision: withGemini })), "failed");
});
