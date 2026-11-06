import "dotenv/config";
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { randomUUID } from "node:crypto";
import { __testing } from "./services/sentimentService.js";
import { builtinModelHashes, supportingProposals, supportingRegistryDependencies, invalidateSupportingRegistry } from "./services/supportingModelRegistry.js";
import { fileURLToPath } from "node:url";
import type { RoutingRule, Scores, SupportProposal } from "./services/supportingModelRouting.js";

const text = "walay suga sa tulay ug lisod kaayo motabok kon gabii.";
const rule: RoutingRule = { primary_confidence: .85, primary_margin: .2, support_confidence: .5,
  support_margin: .05, validation_precision: .85, validation_support: 40 };
const negative: Scores = { negative: .8, neutral: .15, positive: .05 };
const positive: Scores = { negative: .05, neutral: .15, positive: .8 };
const proposal = (scores: Scores, overrides: Partial<RoutingRule> = {}): SupportProposal => ({
  id: randomUUID(), version: "test", scores, rule: { ...rule, ...overrides }, independent: true,
});

function setup(t: TestContext, proposals: SupportProposal[]) {
  const previous = process.env.SENTIMENT_MODEL_REGISTRY_ENABLED;
  process.env.SENTIMENT_MODEL_REGISTRY_ENABLED = "false"; // Keep primary inference on the real bundled ONNX model.
  t.after(() => {
    if (previous === undefined) delete process.env.SENTIMENT_MODEL_REGISTRY_ENABLED;
    else process.env.SENTIMENT_MODEL_REGISTRY_ENABLED = previous;
  });
  const supports = t.mock.method(__testing.localPredictionDependencies, "supportingProposals", async (_directory: string, language: string, source: string, scores: Scores) => {
    assert.equal(language, "cebuano");
    assert.equal(source, text);
    assert.ok(scores.neutral > scores.negative, "Exercise a real uncertain neutral built-in prediction");
    return proposals;
  });
  const usage = t.mock.method(__testing.localPredictionDependencies, "recordSupportUsage", async (_ids: string[]) => {});
  return { supports, usage };
}

test("the production local prediction path consults supports and can correct the bridge complaint", async t => {
  const support = proposal(negative);
  const { supports, usage } = setup(t, [support]);
  const result = await __testing.runLocalPrediction("cebuano", text);
  assert.equal(supports.mock.callCount(), 1);
  assert.equal(result.label, "negative");
  assert.equal(result.confidence, .8);
  assert.equal(result.provider, "ensemble");
  assert.match(result.model, /^supporting:/);
  assert.equal(result.decision?.policy, "raw-confidence-v1");
  assert.ok(result.model.includes(support.id));
  assert.equal(result.source_text, text);
  assert.deepEqual(usage.mock.calls[0]?.arguments[0], [support.id]);
});

test("supporting disagreement selects the largest eligible raw confidence", async t => {
  setup(t, [proposal(negative), proposal({ negative: .01, neutral: .01, positive: .98 })]);
  const result = await __testing.runLocalPrediction("cebuano", text);
  assert.equal(result.label, "positive");
  assert.equal(result.confidence, .98);
  assert.equal(result.decision?.candidates.length, 3);
});

test("low-confidence supports do not discard an eligible built-in prediction", async t => {
  setup(t, [proposal({ negative: .34, neutral: .33, positive: .33 })]);
  const result = await __testing.runLocalPrediction("cebuano", text);
  assert.equal(result.label, "neutral");
  assert.equal(result.decision?.candidates.find(item => item.source === "supporting")?.eligible, false);
});

test("old primary thresholds do not hide a higher-confidence support", async t => {
  setup(t, [proposal(positive, { primary_confidence: .4, primary_margin: .05 })]);
  const result = await __testing.runLocalPrediction("cebuano", text);
  assert.equal(result.label, "positive");
  assert.equal(result.provider, "ensemble");
  assert.equal(result.confidence, .8);
});

test("the newly supplied report stays protected at its real 91 percent built-in confidence", async t => {
  setup(t, []);
  const reportText = "taga gabie diri sa amoa dapit karsada kay grabe ka ngitngit. mahadlok mi mo labang labang diri.";
  t.mock.method(__testing.localPredictionDependencies, "supportingProposals", async (_directory: string, _language: string, source: string, scores: Scores) => {
    assert.equal(source, reportText);
    assert.ok(scores.neutral >= .85);
    return [proposal(negative)];
  });
  const result = await __testing.runLocalPrediction("cebuano", reportText);
  assert.equal(result.label, "neutral");
  assert.equal(result.provider, "local");
  assert.ok(result.confidence >= .9);
});

test("agreeing supports are selected by raw confidence, not validation precision", async t => {
  setup(t, [proposal(negative, { validation_precision: .8 }),
    proposal({ negative: .65, neutral: .2, positive: .15 }, { validation_precision: .95 })]);
  const result = await __testing.runLocalPrediction("cebuano", text);
  assert.equal(result.label, "negative");
  assert.equal(result.confidence, .8);
});

test("no enabled or qualifying supports preserves the original built-in result", async t => {
  const { usage } = setup(t, []);
  const result = await __testing.runLocalPrediction("cebuano", text);
  assert.equal(result.label, "neutral");
  assert.equal(result.provider, "local");
  assert.equal(usage.mock.callCount(), 0);
});

test("support registry failures do not break a working built-in prediction", async t => {
  setup(t, []);
  t.mock.method(__testing.localPredictionDependencies, "supportingProposals", async () => { throw new Error("Registry offline"); });
  const result = await __testing.runLocalPrediction("cebuano", text);
  assert.equal(result.label, "neutral");
  assert.equal(result.provider, "local");
});

test("usage telemetry failures do not discard a successful supporting prediction", async t => {
  setup(t, [proposal(negative)]);
  t.mock.method(__testing.localPredictionDependencies, "recordSupportUsage", async () => { throw new Error("Telemetry offline"); });
  const result = await __testing.runLocalPrediction("cebuano", text);
  assert.equal(result.label, "negative");
  assert.equal(result.provider, "ensemble");
});

test("disabled serving never reads the supporting pool or changes built-in results", async t => {
  const previous = process.env.SENTIMENT_MODEL_REGISTRY_ENABLED;
  process.env.SENTIMENT_MODEL_REGISTRY_ENABLED = "false";
  t.after(() => {
    if (previous === undefined) delete process.env.SENTIMENT_MODEL_REGISTRY_ENABLED;
    else process.env.SENTIMENT_MODEL_REGISTRY_ENABLED = previous;
    invalidateSupportingRegistry();
  });
  const read = t.mock.method(supportingRegistryDependencies, "readEnabled", async () => { throw new Error("Must not read disabled pool"); });
  const result = await __testing.runLocalPrediction("cebuano", text);
  assert.equal(result.label, "neutral");
  assert.equal(result.provider, "local");
  assert.equal(read.mock.callCount(), 0);
});

test("registry evaluates validated enabled supports even when the primary is strong", async t => {
  const oldRegistry = process.env.SENTIMENT_MODEL_REGISTRY_ENABLED;
  const oldSupport = process.env.SENTIMENT_SUPPORT_ENABLED;
  process.env.SENTIMENT_MODEL_REGISTRY_ENABLED = "true";
  process.env.SENTIMENT_SUPPORT_ENABLED = "true";
  invalidateSupportingRegistry();
  t.after(() => {
    if (oldRegistry === undefined) delete process.env.SENTIMENT_MODEL_REGISTRY_ENABLED;
    else process.env.SENTIMENT_MODEL_REGISTRY_ENABLED = oldRegistry;
    if (oldSupport === undefined) delete process.env.SENTIMENT_SUPPORT_ENABLED;
    else process.env.SENTIMENT_SUPPORT_ENABLED = oldSupport;
    invalidateSupportingRegistry();
  });
  const directory = fileURLToPath(new URL("../models", import.meta.url));
  const hashes = await builtinModelHashes(directory);
  const id = randomUUID();
  const quality = { macro_f1: .8, per_class: Object.fromEntries(["negative", "neutral", "positive"].map(label => [label, { support: 30, precision: .8, recall: .8 }])) };
  const policy = {
    version: 2 as const, scope_version: 1, requested_languages: ["cebuano"], admission: "independent-v1", passed: true,
    builtin_hashes: hashes, evaluated_pool_ids: [], languages: { cebuano: rule },
    independent_test: { passed: true, languages: { cebuano: { passed: true, metrics: quality, validation_metrics: quality, precision: .8, support: 30 } } },
  };
  t.mock.method(supportingRegistryDependencies, "readEnabled", async () => [{ id, artifact_manifest: {}, routing_policy: policy }]);
  const prepare = t.mock.method(supportingRegistryDependencies, "prepareBundle", async () => ({ version: id, directory }));
  t.mock.method(supportingRegistryDependencies, "createSession", (async () => ({
    run: async () => ({ probabilities: { data: [.98, .01, .01] } }), release: async () => {},
  })) as never);
  const results = await supportingProposals(directory, "cebuano", text, { negative: .01, neutral: .98, positive: .01 });
  assert.equal(prepare.mock.callCount(), 1);
  assert.equal(results.length, 1);
  assert.equal(results[0]?.scores.negative, .98);
  // A mismatched or unqualified support is still excluded before download.
  invalidateSupportingRegistry();
  t.mock.method(supportingRegistryDependencies, "readEnabled", async () => [{ id, artifact_manifest: {},
    routing_policy: { ...policy, builtin_hashes: { ...hashes, "language_id.onnx": "wrong" } } }]);
  assert.deepEqual(await supportingProposals(directory, "cebuano", text, negative), []);
  assert.equal(prepare.mock.callCount(), 1);
});
