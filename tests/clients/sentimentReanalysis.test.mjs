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
  const source = readFileSync(new URL(`../../clients/app/(${role})/${role === "admin" ? "Admin" : "SAdmin"}_Validation.jsx`, import.meta.url), "utf8");
  const match = /const handleReanalyze = async \(group\) => \{([\s\S]*?)\n  \};/.exec(source);
  async function run(group) {
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
        return { data: {} };
      } },
      loadValidation: async () => { await Promise.resolve(); state.refreshed = true; },
      toast: { success: message => { assert.equal(state.refreshed, true); state.messages.push(message); },
        error: message => state.messages.push(message) },
    };
    await vm.runInNewContext(`(async (group) => {${match[1]}})`, context)(group);
    return state;
  }
  test(`${role} Re-Analyze sends unclear and no-data comments alongside post analyses`, async () => {
    const unclear = comment("unclear", "succeeded", { id: "unclear" });
    const state = await run({ reports: [
      { id: "post-1", comments: [comment("positive"), unclear, { id: "missing" }, comment(null, "unavailable", { id: "unavailable" })] },
      { id: "post-2", comments: [unclear, comment("negative", "failed", { id: "failed" })] },
    ] });
    const comments = state.calls.find(call => call.path === "/ai/sentiment/reanalyze");
    assert.deepEqual(comments.body, { subject_type: "comment", ids: ["unclear", "missing", "unavailable", "failed"] });
    assert.equal(state.calls.length, 5);
    for (const id of ["post-1", "post-2"]) {
      assert.ok(state.calls.some(call => call.path === `/ai/analyze/${id}`));
      assert.ok(state.calls.some(call => call.path === `/ai/sentiment/reanalyze/report/${id}`));
    }
    assert.deepEqual(state.busy, [true, false]);
    assert.match(source, /getSentimentRetryCommentIds.*from "\.\.\/\.\.\/services\/sentimentReanalysis"/);
  });
  test(`${role} leaves clear successful comment analyses untouched`, async () => {
    const state = await run({ reports: [{ id: "post-1", comments: [comment("positive"), comment("neutral"), comment("negative"), comment("mixed")] }] });
    assert.equal(state.calls.length, 2);
    assert.ok(state.calls.every(call => call.path !== "/ai/sentiment/reanalyze"));
  });
}

test("modal retries its freshest comments and refreshes after reanalysis completes", () => {
  const source = readFileSync(new URL("../../clients/components/Admin_compo/Admin_ViewSimilarReportsModal.jsx", import.meta.url), "utf8");
  assert.match(source, /onReanalyze\?\.\(\{ \.\.\.compiledGroup, reports: reportsWithFreshComments \}\)/);
  assert.match(source, /if \(!visible \|\| !compiledGroup \|\| reanalyzing\) return;/);
  assert.match(source, /\[visible, compiledGroup, reanalyzing\]/);
  assert.match(source, /return \{ reportId: report\.id, comments: null \};/);
  assert.match(source, /if \(Array\.isArray\(comments\)\) commentsMap\[reportId\] = comments;/);
});
