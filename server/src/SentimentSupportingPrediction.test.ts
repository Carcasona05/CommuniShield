import "dotenv/config";
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { randomUUID } from "node:crypto";
import { __testing } from "./services/sentimentService.js";
import { supportingRegistryDependencies, invalidateSupportingRegistry } from "./services/supportingModelRegistry.js";
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
  assert.match(result.model, /^cascade:supporting\|validated_support\|builtin:bundled\|support:/);
  assert.ok(result.model.includes(support.id));
  assert.equal(result.source_text, text);
  assert.deepEqual(usage.mock.calls[0]?.arguments[0], [support.id]);
});

test("supporting disagreement returns unclear instead of taking the largest confidence", async t => {
  setup(t, [proposal(negative), proposal({ negative: .01, neutral: .01, positive: .98 })]);
  const result = await __testing.runLocalPrediction("cebuano", text);
  assert.equal(result.label, "unclear");
  assert.equal(result.confidence, 0);
  assert.match(result.model, /cascade:unclear\|support_disagreement/);
});

test("uncertain supporting results abstain rather than invent a correction", async t => {
  setup(t, [proposal({ negative: .34, neutral: .33, positive: .33 })]);
  const result = await __testing.runLocalPrediction("cebuano", text);
  assert.equal(result.label, "unclear");
  assert.match(result.model, /no_reliable_support/);
});

test("a built-in prediction meeting its policy thresholds is retained", async t => {
  setup(t, [proposal(positive, { primary_confidence: .4, primary_margin: .05 })]);
  const result = await __testing.runLocalPrediction("cebuano", text);
  assert.equal(result.label, "neutral");
  assert.equal(result.provider, "local");
  assert.match(result.model, /@bundled$/);
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

test("agreeing supports are selected by validation precision, not raw confidence", async t => {
  setup(t, [proposal(negative, { validation_precision: .8 }),
    proposal({ negative: .65, neutral: .2, positive: .15 }, { validation_precision: .95 })]);
  const result = await __testing.runLocalPrediction("cebuano", text);
  assert.equal(result.label, "negative");
  assert.equal(result.confidence, .65);
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
