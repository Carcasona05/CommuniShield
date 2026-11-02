import "../helpers/serverEnvironment.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { routeSupportingModels, validIndependentPolicy, type RoutingRule, type Scores } from "../../server/src/services/supportingModelRouting.js";
import { supportingModelService } from "../../server/src/services/supportingModelService.js";
import { listSupportingModels, manageSupportingModel } from "../../server/src/controllers/supportingModelController.js";
import { supabase } from "../../server/src/config/supabase.js";
import { profileService } from "../../server/src/services/authService.js";
import { loginVerificationService } from "../../server/src/services/loginVerificationService.js";
import app from "../../server/api/index.js";
import type { Request, Response } from "express";
import type { User } from "@supabase/supabase-js";
const rule: RoutingRule = { primary_confidence: 0.7, primary_margin: 0.2, support_confidence: 0.7, support_margin: 0.2,
  validation_precision: 0.85, validation_support: 40 };
const weak: Scores = { negative: 0.34, neutral: 0.33, positive: 0.33 };
const negative: Scores = { negative: 0.9, neutral: 0.05, positive: 0.05 };
const positive: Scores = { negative: 0.05, neutral: 0.05, positive: 0.9 };
const proposal = (id: string, scores: Scores) => ({ id, version: id, scores, rule });
test("confident primary results cannot be overruled by a supporting vote", () => {
  const r = routeSupportingModels(positive, [proposal("a", negative)]);
  assert.equal(r.label, "positive"); assert.equal(r.origin, "builtin");
});
test("only eligible, verified support can replace an uncertain primary result", () => {
  const r = routeSupportingModels(weak, [proposal("a", positive)]);
  assert.equal(r.label, "positive"); assert.equal(r.origin, "supporting"); assert.deepEqual(r.ids, ["a"]);
  const invalid = { ...proposal("a", positive), rule: { ...rule, validation_support: 1 } };
  assert.equal(routeSupportingModels(weak, [invalid]).origin, "builtin");
});
test("supporting disagreements abstain even with a two-to-one majority", () => {
  const r = routeSupportingModels(weak, [proposal("a", positive), proposal("b", positive), proposal("c", negative)]);
  assert.equal(r.label, "unclear"); assert.equal(r.reason, "support_disagreement"); assert.equal(r.confidence, 0);
});
test("weak supporting scores abstain and agreeing supports do not average confidence", () => {
  assert.equal(routeSupportingModels(weak, [proposal("a", weak)]).label, "unclear");
  const r = routeSupportingModels(weak, [proposal("a", positive), proposal("b", { negative: 0.1, neutral: 0.1, positive: 0.8 })]);
  assert.equal(r.confidence, 0.9); assert.equal(r.label, "positive");
});
test("qualified independent support can correct an uncertain primary without replacing the built-in", () => {
  const correction = routeSupportingModels(weak, [{ ...proposal("a", positive), independent: true }, { ...proposal("b", positive), independent: true }]);
  assert.equal(correction.label, "positive");
  assert.equal(correction.origin, "supporting");
  assert.equal(correction.reason, "validated_support");
  const agreement = routeSupportingModels(weak, [{ ...proposal("a", negative), independent: true }]);
  assert.equal(agreement.label, "negative");
  assert.equal(agreement.origin, "supporting");
  assert.equal(routeSupportingModels(positive, [{ ...proposal("a", negative), independent: true }]).origin, "builtin");
});
test("reported drainage complaint uses qualified negative support despite weak neutral primary", () => {
  const currentRule = { ...rule, primary_confidence: .85, primary_margin: .2, support_confidence: .5, support_margin: .05 };
  const primary = { negative: .295, neutral: .528, positive: .177 };
  const result = routeSupportingModels(primary, [
    { ...proposal("new", { negative: .767, neutral: .153, positive: .080 }), rule: currentRule, independent: true },
    { ...proposal("old", { negative: .502, neutral: .374, positive: .124 }), rule: currentRule, independent: true },
  ]);
  assert.equal(result.label, "negative");
  assert.equal(result.origin, "supporting");
});
test("independent correction still abstains on weak supports and support disagreement", () => {
  const independent = (id: string, scores: Scores) => ({ ...proposal(id, scores), independent: true });
  assert.equal(routeSupportingModels(weak, [independent("a", weak)]).reason, "no_reliable_support");
  const conflict = routeSupportingModels(weak, [independent("a", positive), independent("b", positive), independent("c", negative)]);
  assert.equal(conflict.reason, "support_disagreement");
  assert.equal(conflict.label, "unclear");
});
test("an unqualified high-confidence support cannot defeat a qualified fallback", () => {
  const result = routeSupportingModels(weak, [
    { ...proposal("invalid", negative), rule: { ...rule, validation_precision: .74 }, independent: true },
    { ...proposal("valid", positive), independent: true },
  ]);
  assert.equal(result.label, "positive");
  assert.deepEqual(result.ids, ["valid"]);
});
test("confidence and margin thresholds retain their inclusive boundaries", () => {
  const thresholdRule = { ...rule, primary_confidence: .85, primary_margin: .2, support_confidence: .5, support_margin: .125 };
  const boundary = { ...proposal("a", { negative: .5, neutral: .375, positive: .125 }), rule: thresholdRule, independent: true };
  assert.equal(routeSupportingModels(weak, [boundary]).label, "negative");
  const belowConfidence = { ...boundary, scores: { negative: .499, neutral: .375, positive: .126 } };
  assert.equal(routeSupportingModels(weak, [belowConfidence]).reason, "no_reliable_support");
  const belowMargin = { ...boundary, rule: { ...thresholdRule, support_margin: .126 } };
  assert.equal(routeSupportingModels(weak, [belowMargin]).reason, "no_reliable_support");
  assert.equal(routeSupportingModels({ negative: .1, neutral: .05, positive: .85 }, [boundary]).origin, "builtin");
});
test("disagreement corrections use validation precision, not confidence or model count", () => {
  const first = { ...proposal("first", { negative: .2, neutral: .1, positive: .7 }), independent: true,
    rule: { ...rule, validation_precision: .9 } };
  const second = { ...proposal("second", positive), independent: true, rule: { ...rule, validation_precision: .8 } };
  assert.equal(routeSupportingModels(weak, [second, first]).confidence, .7);
  assert.equal(routeSupportingModels(weak, [first, second]).confidence, .7);
  assert.equal(routeSupportingModels(weak, []).origin, "builtin");
});
test("independent policies require absolute validation and test evidence, not a baseline score", () => {
  const metric = () => ({ macro_f1: .7, per_class: Object.fromEntries(["negative", "neutral", "positive"].map(l => [l, { support: 40, precision: .7, recall: .7 }])) });
  const p = { version: 2, admission: "independent-v1", passed: true, evaluated_pool_ids: [], languages: Object.fromEntries(["cebuano", "english", "filipino"].map(l => [l, { ...rule, primary_confidence: .85 }])),
    independent_test: { passed: true, languages: Object.fromEntries(["cebuano", "english", "filipino"].map(l => [l, { passed: true, metrics: metric(), validation_metrics: metric(), support: 30, precision: .8 }])) } };
  assert.equal(validIndependentPolicy(p), true);
  const invalid = structuredClone(p);
  invalid.independent_test.languages.english!.metrics.per_class.neutral!.recall = .49;
  assert.equal(validIndependentPolicy(invalid), false);
  const sparse = structuredClone(p);
  sparse.languages.english!.validation_support = 1;
  assert.equal(validIndependentPolicy(sparse), false);
  assert.equal(validIndependentPolicy({ version: 2, passed: true }), false);
});
test('language-scoped independent policies qualify only their recorded passing subset',()=>{
  const metric={macro_f1:.7,per_class:Object.fromEntries(['negative','neutral','positive'].map(l=>[l,{support:40,precision:.7,recall:.7}]))};
  const check={passed:true,metrics:metric,validation_metrics:metric,support:30,precision:.8};
  const policy={version:2,scope_version:1,requested_languages:['cebuano','filipino'],admission:'independent-v1',passed:true,evaluated_pool_ids:[],
    languages:{cebuano:{...rule,primary_confidence:.85}},independent_test:{passed:true,languages:{cebuano:check,filipino:{passed:false}}}};
  assert.equal(validIndependentPolicy(policy),true);
  assert.equal(validIndependentPolicy({...policy,requested_languages:['english']}),false);
  assert.equal(validIndependentPolicy({...policy,languages:{}}),false);
  assert.equal(validIndependentPolicy({...policy,scope_version:2}),false);
});
function response() {
  const result = { status: 200, body: null as unknown };
  const res = { status(code: number) { result.status = code; return res; }, json(body: unknown) { result.body = body; return res; } } as Response;
  return { result, res };
}
test("pool handlers reject missing auth, malformed actions and unbounded limits", async (t) => {
  for (const handler of [listSupportingModels, manageSupportingModel]) {
    const { result, res } = response(); await handler({} as Request, res); assert.equal(result.status, 401);
  }
  const id = randomUUID();
  const mutate = t.mock.method(supportingModelService, "action", async () => { throw new Error("must not mutate"); });
  for (const body of [{}, { action: "enable", modelId: "../model", generation: 0 }, { action: "set_limit", limit: 4, generation: 0 },
                      { action: "delete", modelId: id, generation: -1 }]) {
    const { result, res } = response(); await manageSupportingModel({ user: { id } as User, body } as unknown as Request, res); assert.equal(result.status, 400);
  }
  assert.equal(mutate.mock.callCount(), 0);
});
test("real API routes allow admin inspection but only super-admin lifecycle actions", async (t) => {
  const id = randomUUID(); let role = "user";
  t.mock.method(supabase.auth, "getUser", async () => ({ data: { user: { id } }, error: null }));
  t.mock.method(loginVerificationService, "sessionApproved", async () => true);
  t.mock.method(profileService, "getProfile", async () => ({ data: { role, status: "Active" }, error: null }));
  t.mock.method(supportingModelService, "list", async () => ({ data: { models: [], total: 0, maxEnabled: 3, enabledCount: 0, generation: 0 }, error: null }));
  const mutation = t.mock.method(supportingModelService, "action", async (actor: string) => { assert.equal(actor, id); return { data: {}, error: null }; });
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>((done) => server.once("listening", done));
  t.after(() => new Promise<void>((done) => server.close(() => done())));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/sentiment/supporting-models`;
  const headers = { Authorization: "Bearer test-only", "Content-Type": "application/json" };
  assert.equal((await fetch(url, { headers })).status, 403);
  role = "admin"; assert.equal((await fetch(url, { headers })).status, 200);
  const request = () => fetch(url, { method: "POST", headers, body: JSON.stringify({ action: "disable", modelId: randomUUID(), generation: 0, actor: "forged" }) });
  assert.equal((await request()).status, 403); assert.equal(mutation.mock.callCount(), 0);
  role = "super_admin"; assert.equal((await request()).status, 200); assert.equal(mutation.mock.callCount(), 1);
});
