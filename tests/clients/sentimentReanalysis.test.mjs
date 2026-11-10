import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { getSentimentRetryCommentIds, needsCommentSentimentReanalysis } from "../../clients/services/sentimentReanalysis.js";

const comment = (sentiment, status = "succeeded", extra = {}) => ({
  id: "comment-1", sentiment, sentiment_status: status, ...extra,
});

test("successful unclear comments are retried, including casing and whitespace variants", () => {
  assert.equal(needsCommentSentimentReanalysis(comment("unclear")), true);
  assert.equal(needsCommentSentimentReanalysis(comment(" Unclear ", " Succeeded ")), true);
});

test("No data includes missing labels, unavailable/failed/pending/skipped and absent analysis", () => {
  for (const label of [null, undefined, "", " ", "none", "No data", "unavailable", "unknown"]) {
    assert.equal(needsCommentSentimentReanalysis(comment(label)), true);
  }
  for (const status of ["unavailable", "failed", "pending", "skipped", null, undefined]) {
    assert.equal(needsCommentSentimentReanalysis({ id: "comment-1", sentiment: "negative", sentiment_status: status }), true);
  }
  assert.equal(needsCommentSentimentReanalysis({ id: "comment-1" }), true);
});

test("clear successful sentiments are retained unless they carry an analysis error", () => {
  for (const label of ["positive", "negative", "neutral", "mixed", " Positive "]) {
    assert.equal(needsCommentSentimentReanalysis(comment(label)), false);
    assert.equal(needsCommentSentimentReanalysis(comment(label, "succeeded", { sentiment_error: "language_uncertain" })), true);
  }
});

test("selection deduplicates IDs and tolerates missing comments and malformed entries", () => {
  const reports = [null, {}, { comments: 5 }, { comments: [null, {}, comment("unclear"), comment(null), comment("positive"), comment("unclear", "succeeded", { id: " " })] }];
  assert.deepEqual(getSentimentRetryCommentIds(reports), ["comment-1"]);
  assert.deepEqual(getSentimentRetryCommentIds(undefined), []);
  assert.equal(needsCommentSentimentReanalysis(null), false);
  assert.equal(needsCommentSentimentReanalysis({ id: 7 }), false);
});

for (const role of ["admin", "sadmin"]) {
  const route = readFileSync(new URL(`../../clients/app/(${role})/${role === "admin" ? "Admin" : "SAdmin"}_Validation.jsx`, import.meta.url), "utf8");
  assert.match(route, /<ValidationPage Layout=/);
  const source = readFileSync(new URL("../../clients/components/Admin_compo/ValidationPage.jsx", import.meta.url), "utf8");
  const match = /const handleReanalyze = async \(group\) => \{([\s\S]*?)\n  \};/.exec(source);
  async function run(group, payload = {}) {
    assert.ok(match, "reanalysis handler must exist");
    const state = { calls: [], busy: [], refreshed: false, messages: [] };
    const context = {
      reanalyzing: false,
      setReanalyzing: value => state.busy.push(value),
      AsyncStorage: { getItem: async () => "token" },
      getSentimentRetryCommentIds,
      apiClient: { post: async (path, body, options) => {
        assert.equal(options.headers.Authorization, "Bearer token");
        state.calls.push({ path, body: JSON.parse(JSON.stringify(body)) });
        return { data: payload };
      } },
      loadValidation: async () => { await Promise.resolve(); state.refreshed = true; },
      toast: { success: message => { assert.equal(state.refreshed, true); state.messages.push(message); },
        error: message => state.messages.push(message) },
    };
    await vm.runInNewContext(`(async (group) => {${match[1]}})`, context)(group);
    return state;
  }
  test(`${role} Re-Analyze delegates all comment reanalysis to the report endpoint`, async () => {
    const unclear = comment("unclear", "succeeded", { id: "unclear" });
    const state = await run({ reports: [
      { id: "post-1", comments: [comment("positive"), unclear, { id: "missing" }, comment(null, "unavailable", { id: "unavailable" })] },
      { id: "post-2", comments: [unclear, comment("negative", "failed", { id: "failed" })] },
    ] });
    assert.ok(state.calls.every(call => call.path !== "/ai/sentiment/reanalyze"));
    assert.equal(state.calls.length, 4);
    for (const id of ["post-1", "post-2"]) {
      assert.ok(state.calls.some(call => call.path === `/ai/analyze/${id}`));
      assert.ok(state.calls.some(call => call.path === `/ai/sentiment/reanalyze/report/${id}`));
    }
    assert.deepEqual(state.busy, [true, false]);
    assert.doesNotMatch(source, /getSentimentRetryCommentIds/);
  });
  test(`${role} also invokes thread reanalysis when all comments already have successful labels`, async () => {
    const state = await run({ reports: [{ id: "post-1", comments: [comment("positive"), comment("neutral"), comment("negative"), comment("mixed")] }] });
    assert.equal(state.calls.length, 2);
    assert.ok(state.calls.every(call => call.path !== "/ai/sentiment/reanalyze"));
    assert.ok(state.calls.some(call => call.path === "/ai/sentiment/reanalyze/report/post-1"));
    assert.match(state.messages[0], /and their comments/);
  });
  test(`${role} does not claim success when comment analyses return failed statuses`, async () => {
    const state = await run({ reports: [{ id: "post-1" }] }, { results: { "post-1": { status: "succeeded" } }, commentResults: { comment: { status: "failed" } } });
    assert.match(state.messages[0], /Could not complete reanalysis/);
  });
}

test("modal retries its freshest comments and refreshes after reanalysis completes", () => {
  const source = readFileSync(new URL("../../clients/components/Admin_compo/Admin_ViewSimilarReportsModal.jsx", import.meta.url), "utf8");
  assert.match(source, /onReanalyze\?\.\(\{ \.\.\.compiledGroup, reports: reportsWithFreshComments \}\)/);
  assert.match(source, /useAdminReportDetails\(\(compiledGroup\?\.reports \|\| \[\]\)\.map\(report => report.id\), visible\)/);
  assert.match(source, /detailQuery\.data\?\.reports/);
  assert.match(source, /onRetry=\{detailQuery.reload\}/);
  const cache = readFileSync(new URL("../../clients/services/sessionData.js", import.meta.url), "utf8");
  assert.match(cache, /"\/admin\/report-details"/);
});
