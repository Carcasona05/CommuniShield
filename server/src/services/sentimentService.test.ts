import assert from "node:assert/strict";
import { test } from "node:test";
import {
  __testing,
  detectSentimentLanguage,
  normalizeSentimentLabel,
  sentimentInputHash,
  sentimentService,
  type SentimentPrediction,
} from "./sentimentService.js";

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

test("fuse assist agrees: ensemble + averaged confidence", () => {
  const { prediction, errorCode } = __testing.fuseLocalWithGeminiAssist(
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
  const { prediction } = __testing.fuseLocalWithGeminiAssist(
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
  const { prediction } = __testing.fuseLocalWithGeminiAssist(
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
  assert.equal(detectSentimentLanguage("Gym gyud kaayo ang dili niini"), "cebuano");
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
  assert.notEqual(sentimentInputHash("hello"), sentimentInputHash("hello world"));
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
