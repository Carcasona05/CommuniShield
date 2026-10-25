import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeHotspotEvidence, type HotspotEvidenceReport } from "../../server/src/services/hotspotSentimentService.js";

const now = Date.parse("2026-10-21T12:00:00Z");
const atAge = (days: number) => new Date(now - days * 86400000).toISOString();
const report = (id: string, extra: Partial<HotspotEvidenceReport> = {}): HotspotEvidenceReport => ({
  id, created_at: atAge(1), status: "Pending Review", sentiment: "negative", sentiment_status: "succeeded", sentiment_confidence: 0.9,
  sentiment_language: "cebuano", sentiment_model: "test-model", sentiment_provider: "local", ...extra,
});
const comment = (id: string, label = "negative", extra: Record<string, unknown> = {}) => ({
  id, datePosted: atAge(1), sentiment: label, sentiment_status: "succeeded", sentiment_confidence: 0.9, sentiment_language: "cebuano", ...extra,
});
const summarize = (reports: HotspotEvidenceReport[]) => summarizeHotspotEvidence(reports, { now, windowDays: 30 });

test("report distributions retain multilingual and mixed/unclear evidence without fabricating neutral values", () => {
  const result = summarize([
    report("a"), report("b", { sentiment: "positive", sentiment_language: "english" }),
    report("c", { sentiment: "neutral", sentiment_language: "filipino" }),
    report("d", { sentiment: "mixed" }), report("e", { sentiment: "unclear" }),
  ]);
  assert.equal(result.reports.usable, 5);
  assert.deepEqual(result.reports.counts, { negative: 1, neutral: 1, positive: 1, mixed: 1, unclear: 1 });
  assert.equal(result.reports.shares.negative, 0.2);
  assert.deepEqual(result.reports.languages, { english: 1, filipino: 1, cebuano: 3 });
  assert.deepEqual(result.provenance.models, ["test-model"]);
  assert.equal("riskScore" in result, false);
});

test("failed, unknown-language, invalid-confidence and low-confidence analyses are explicitly excluded", () => {
  const rows = [
    report("pending", { sentiment_status: "pending" }), report("failed", { sentiment_status: "failed" }),
    report("error", { sentiment_error: "provider_failed" }), report("label", { sentiment: "not-a-label" }),
    report("language", { sentiment_language: "unknown" }), report("low", { sentiment_confidence: 0.69 }),
    ...[null, "", "not-a-number", true, -0.1, 1.1, Infinity].map((value, i) => report(`invalid-${i}`, { sentiment_confidence: value })),
    report("valid", { sentiment_confidence: "0.7" }),
  ];
  const result = summarize(rows);
  assert.equal(result.reports.usable, 1);
  assert.deepEqual(result.reports.excluded, { unavailable: 4, invalidConfidence: 7, lowConfidence: 1, unsupportedLanguage: 1, outsideWindow: 0 });
  assert.equal(result.reports.counts.neutral, 0);
});

test("a hundred comments on one report cannot outweigh one comment on another", () => {
  const result = summarize([
    report("a", { comments: Array.from({ length: 100 }, (_, i) => comment(`negative-${i}`)) }),
    report("b", { sentiment: "positive", comments: [comment("positive", "positive")] }),
  ]);
  assert.equal(result.comments.usable, 101);
  assert.equal(result.comments.counts.negative, 100);
  assert.equal(result.comments.reportsWithUsableComments, 2);
  assert.equal(result.comments.shares.negative, 0.5);
  assert.equal(result.comments.shares.positive, 0.5);
  assert.equal(result.reports.shares.negative, 0.5);
  assert.equal(result.reports.shares.positive, 0.5);
});

test("comment dates, IDs, confidence and languages are validated independently of parent reports", () => {
  const repeated = comment("duplicate");
  const result = summarize([report("a", { comments: [
    repeated, repeated,
    comment("old", "negative", { datePosted: atAge(40) }),
    comment("future", "negative", { datePosted: atAge(-1) }),
    comment("undated", "negative", { datePosted: null }),
    comment("language", "positive", { sentiment_language: "unknown" }),
    comment("low", "neutral", { sentiment_confidence: 0.2 }),
    comment("", "positive"),
  ] })]);
  assert.equal(result.comments.total, 6);
  assert.equal(result.comments.usable, 1);
  assert.equal(result.comments.missingIds, 1);
  assert.equal(result.comments.excluded.outsideWindow, 3);
  assert.equal(result.comments.excluded.unsupportedLanguage, 1);
  assert.equal(result.comments.excluded.lowConfidence, 1);
  assert.equal(result.reports.usable, 1);
});

test("verification buckets are disjoint and never inferred from negative sentiment", () => {
  const result = summarize([
    report("a"), report("b", { is_verified: true }),
    report("c", { status: "Under Verification" }), report("d", { status: "Unknown" }),
  ]);
  assert.deepEqual(result.verification, { verified: 1, pendingReview: 1, underVerification: 1, other: 1 });
  assert.equal(result.reports.counts.negative, 4);
});

test("sentiment changes require three usable reports in each distinct comparison period", () => {
  const rows = [
    ...[1, 2, 3].map((age) => report(`recent-${age}`, { created_at: atAge(age) })),
    ...[8, 9, 10].map((age) => report(`previous-${age}`, { sentiment: "positive", created_at: atAge(age) })),
  ];
  const result = summarize(rows);
  assert.equal(result.activity.negativeShareChangePoints, 100);
  assert.equal(result.activity.sentimentTrend, "more_negative");
  assert.equal(result.activity.recent.usable, 3);
  assert.equal(result.activity.previous.usable, 3);
  const missing = summarize(rows.filter((row) => row.id !== "previous-10"));
  assert.equal(missing.activity.negativeShareChangePoints, null);
  assert.equal(missing.activity.sentimentTrend, "insufficient_data");
  const narrow = summarizeHotspotEvidence(rows, { now, windowDays: 7 });
  assert.equal(narrow.activity.comparableWindow, false);
  assert.equal(narrow.activity.negativeShareChangePoints, null);
});

test("missing evidence stays unavailable; repeated report IDs do not inflate coverage", () => {
  const row: HotspotEvidenceReport = { id: "a", created_at: atAge(1), comments: [] };
  const result = summarize([row, row]);
  assert.equal(result.reports.total, 1);
  assert.equal(result.reports.usable, 0);
  assert.equal(result.reports.shares.neutral, null);
  assert.equal(result.comments.shares.negative, null);
  assert.equal(result.activity.countTrend, "insufficient_data");
});
