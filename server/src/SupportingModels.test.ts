import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { routeSupportingModels, validIndependentPolicy, type RoutingRule, type Scores } from "./services/supportingModelRouting.js";
import { supportingModelService } from "./services/supportingModelService.js";
import { listSupportingModels, manageSupportingModel } from "./controllers/supportingModelController.js";
import { supabase } from "./config/supabase.js";
import { profileService } from "./services/authService.js";
import { loginVerificationService } from "./services/loginVerificationService.js";
import app from "../api/index.js";
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
test("independent support must agree with the uncertain primary, never override it or vote", () => {
  const conflict = routeSupportingModels(weak, [{ ...proposal("a", positive), independent: true }, { ...proposal("b", positive), independent: true }]);
  assert.equal(conflict.label, "unclear");
  assert.equal(conflict.reason, "primary_support_disagreement");
  const agreement = routeSupportingModels(weak, [{ ...proposal("a", negative), independent: true }]);
  assert.equal(agreement.label, "negative");
  assert.equal(agreement.origin, "supporting");
  assert.equal(routeSupportingModels(positive, [{ ...proposal("a", negative), independent: true }]).origin, "builtin");
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
