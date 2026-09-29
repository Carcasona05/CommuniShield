import assert from "node:assert/strict";
import { test } from "node:test";
import { __testing } from "./aiService.js";

const { parseAIResponse, repairTruncatedJson, stripModelPrefix, MAX_OUTPUT_TOKENS } = __testing;

test("parses plain JSON response", () => {
  const result = parseAIResponse(
    '{"ai_score": 82, "severity": "High", "credibility_review": "Corroborated by 3 similar reports."}'
  );
  assert.equal(result.ai_score, 82);
  assert.equal(result.severity, "High");
  assert.equal(result.credibility_review, "Corroborated by 3 similar reports.");
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
  assert.notEqual(result.credibility_review, "Unable to generate AI review. Manual verification recommended.");
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
  assert.equal(stripModelPrefix("models/gemini-3.8-flash"), "gemini-3.8-flash");
  assert.equal(stripModelPrefix("gemini-3.8-flash"), "gemini-3.8-flash");
});

test("token budget is large enough for thinking models", () => {
  assert.ok(MAX_OUTPUT_TOKENS >= 1024, "maxOutputTokens must leave room for thinking tokens");
});
