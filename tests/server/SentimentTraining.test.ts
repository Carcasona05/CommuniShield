import "../helpers/serverEnvironment.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Request, Response } from "express";
import type { User } from "@supabase/supabase-js";
import { getActiveModelBundle, MODEL_FILES, modelRegistryDependencies as deps, prepareModelBundle, validateManifest } from "../../server/src/services/sentimentModelRegistry.js";
import { getSentimentTraining, manageSentimentTraining } from "../../server/src/controllers/sentimentTrainingController.js";
import { sentimentTrainingService as service } from "../../server/src/services/sentimentTrainingService.js";
import { supabaseAdmin } from "../../server/src/config/supabaseAdmin.js";

const jobId = randomUUID();
function setEnv(t: TestContext, key: string, value: string) {
  const previous = process.env[key];
  process.env[key] = value;
  t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
}
const manifest = (id: string, bytes: Buffer) => ({ files: Object.fromEntries(MODEL_FILES.map((name) => [name, { path: `${id}/${jobId}/${name}`, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }])) });
async function temporary() {
  const root = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Temp", "opencode") : tmpdir();
  return mkdtemp(join(root, "sentiment-model-test-"));
}
const request = (body = {}) => ({ user: { id: jobId } as User, body }) as unknown as Request & { user: User };
const response = () => {
  const result = { code: 200, body: undefined as unknown };
  const res = { status(code: number) { result.code = code; return res; }, json(body: unknown) { result.body = body; return res; } } as Response;
  return { result, res };
};

test("model manifests reject missing checksums, oversized files, and path traversal", () => {
  const valid = manifest(jobId, Buffer.from("model"));
  assert.equal(validateManifest(jobId, valid).files[MODEL_FILES[0]]!.size, 5);
  for (const bad of [null, {}, { files: { ...valid.files, [MODEL_FILES[0]]: { ...valid.files[MODEL_FILES[0]], path: "../../model.onnx" } } }, { files: { ...valid.files, [MODEL_FILES[0]]: { ...valid.files[MODEL_FILES[0]], sha256: "" } } }, { files: { ...valid.files, [MODEL_FILES[0]]: { ...valid.files[MODEL_FILES[0]], size: 104857601 } } }]) assert.throws(() => validateManifest(jobId, bad));
});
test('scoped bundles require exactly the qualified language files and preserve checksums',()=>{
  const original=manifest(jobId,Buffer.from('model'));
  const scoped={languages:['cebuano'],files:Object.fromEntries(Object.entries(original.files).filter(([name])=>name==='language_id.onnx'||name==='sentiment_cebuano.onnx'))};
  assert.deepEqual(validateManifest(jobId,scoped).languages,['cebuano']);
  assert.throws(()=>validateManifest(jobId,{...scoped,languages:['english']}));
  assert.throws(()=>validateManifest(jobId,{...scoped,languages:[]}));
  assert.throws(()=>validateManifest(jobId,{...scoped,languages:['cebuano','cebuano']}));
  assert.throws(()=>validateManifest(jobId,{...scoped,files:original.files}));
});

test("versioned downloads verify every file, run ONNX checks, and deduplicate concurrent requests", async (t) => {
  const directory = await temporary();
  setEnv(t, "SENTIMENT_MODEL_CACHE_DIR", directory);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bytes = Buffer.from("candidate-model");
  const download = t.mock.method(deps, "download", async () => bytes);
  const smoke = t.mock.method(deps, "smokeTest", async () => {});
  const id = randomUUID();
  const bundles = await Promise.all([prepareModelBundle(id, manifest(id, bytes)), prepareModelBundle(id, manifest(id, bytes))]);
  assert.deepEqual(bundles[0], bundles[1]);
  assert.equal(download.mock.callCount(), 4); assert.equal(smoke.mock.callCount(), 4);
  for (const filename of MODEL_FILES) assert.deepEqual(await readFile(join(bundles[0]!.directory, filename)), bytes);
});

test("checksum failures never publish a bundle and failed downloads can be retried", async (t) => {
  const directory = await temporary();
  setEnv(t, "SENTIMENT_MODEL_CACHE_DIR", directory);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bytes = Buffer.from("expected");
  const download = t.mock.method(deps, "download", async () => Buffer.from("wrong"));
  t.mock.method(deps, "smokeTest", async () => {});
  const id = randomUUID();
  await assert.rejects(prepareModelBundle(id, manifest(id, bytes)), /checksum/);
  download.mock.restore();
  t.mock.method(deps, "download", async () => bytes);
  assert.ok((await prepareModelBundle(id, manifest(id, bytes))).version.startsWith(id));
});

test("actual ONNX smoke checks support writable-cache filenames", async (t) => {
  const directory = await temporary();
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "candidate.onnx.download");
  await writeFile(path, await readFile(new URL("../../server/models/sentiment_english.onnx", import.meta.url)));
  await deps.smokeTest(path);
});

test("legacy registry pointers can never replace the permanent built-in primary", async (t) => {
  const directory = await temporary();
  setEnv(t, "SENTIMENT_MODEL_CACHE_DIR", directory);
  setEnv(t, "SENTIMENT_MODEL_REGISTRY_ENABLED", "true");
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bytes = Buffer.from("good-model");
  const id = randomUUID();
  let active: { jobId: string; manifest: unknown } | null = null;
  const read = t.mock.method(deps, "readActive", async () => active);
  const download = t.mock.method(deps, "download", async () => bytes);
  t.mock.method(deps, "smokeTest", async () => {});
  assert.equal((await getActiveModelBundle("baseline")).version, "bundled");
  active = { jobId: id, manifest: manifest(id, bytes) };
  const loaded = await getActiveModelBundle("baseline");
  assert.equal(loaded.version, "bundled");
  const brokenId = randomUUID();
  active = { jobId: brokenId, manifest: manifest(brokenId, Buffer.from("different")) };
  assert.deepEqual(await getActiveModelBundle("baseline"), loaded);
  assert.equal(download.mock.callCount(), 0);
  assert.equal(read.mock.callCount(), 0);
  active = null;
  assert.equal((await getActiveModelBundle("baseline")).version, "bundled");
});

test("training handlers reject unauthenticated and malformed actions", async (t) => {
  for (const handler of [getSentimentTraining, manageSentimentTraining]) {
    const { res, result } = response(); await handler({} as Request, res); assert.equal(result.code, 401);
  }
  const action = t.mock.method(service, "action", async () => { throw new Error("must not run"); });
  for (const body of [{}, { action: "activate", jobId }, { action: "activate", jobId: "../file", generation: 1 }, { action: "rollback", generation: -1 }, { action: "train-shell-command" }, { action: "queue", mode: "replace-built-in" }, { action: "queue", mode: 7 }, {action:'queue',datasetIds:[]}, {action:'queue',datasetIds:['../private']}, {action:'queue',datasetIds:'all'}]) {
    const { res, result } = response(); await manageSentimentTraining(request(body), res); assert.equal(result.code, 400);
  }
  assert.equal(action.mock.callCount(), 0);
});

test("queue forwards mode under independent admission and never silently falls back to comparative training", async (t) => {
  const calls: { name: string; args: Record<string, unknown> | undefined }[] = [];
  let capabilities: { data: Record<string, unknown> | null; error: unknown } = { data: { supporting_pool: true, fresh_candidates: true, independent_admission: true, language_scoped_training:true }, error: null };
  t.mock.method(supabaseAdmin, "rpc", (async (name: string, args?: Record<string, unknown>) => {
    calls.push({ name, args });
    if (name === "sentiment_training_capabilities") return capabilities;
    return { data: { job_id: jobId }, error: null };
  }) as unknown as typeof supabaseAdmin.rpc);

  const fresh = await service.action(jobId, "queue", null, null, "fresh");
  assert.equal(fresh.error, null);
  const manage = calls.filter((call) => call.name === "manage_sentiment_training");
  assert.equal(manage.length, 1);
  assert.deepEqual(manage[0]!.args!.p_payload, { mode: "fresh" });

  calls.length = 0;
  const continued = await service.action(jobId, "queue", null, null, "continue");
  assert.equal(continued.error, null);
  assert.deepEqual(calls.find((call) => call.name === "manage_sentiment_training")!.args!.p_payload, { mode: "continue" });
  calls.length=0;
  await service.action(jobId,'queue',null,null,'fresh',[jobId]);
  assert.deepEqual(calls.find(call=>call.name==='manage_sentiment_training')!.args!.p_payload,{mode:'fresh',dataset_ids:[jobId]});

  calls.length = 0;
  capabilities = { data: { supporting_pool: true }, error: null };
  const blocked = await service.action(jobId, "queue", null, null, "fresh");
  assert.equal(blocked.error?.code, "22023");
  assert.match(blocked.error!.message, /sentiment_independent_admission\.sql/);
  assert.equal(calls.filter((call) => call.name === "manage_sentiment_training").length, 0,
    "a fresh request must never fall back to continued training on un-migrated deployments");

  calls.length = 0;
  const legacyQueue = await service.action(jobId, "queue", null, null, "continue");
  assert.equal(legacyQueue.error?.code, "22023");
  assert.equal(calls.filter((call) => call.name === "manage_sentiment_training").length, 0,
    "the new service must not queue legacy comparative training before the migration");

  calls.length = 0;
  const invalid = await service.action(jobId, "queue", null, null, "replace-built-in");
  assert.equal(invalid.error?.code, "22023");
  assert.equal(calls.length, 0, "an invalid mode is rejected before touching the database");
});

test("stale generations and registry-disabled activation are surfaced safely", async (t) => {
  const mock = t.mock.method(service, "action", async () => ({ data: null, error: { code: "40001", message: "Refresh first" } }));
  const stale = response(); await manageSentimentTraining(request({ action: "activate", jobId, generation: 0 }), stale.res); assert.equal(stale.result.code, 409);
  mock.mock.restore();
  setEnv(t, "SENTIMENT_MODEL_REGISTRY_ENABLED", "false");
  const disabled = await service.action(jobId, "activate", jobId, 0);
  assert.equal(disabled.error?.code, "22023");
});

test("migration failures are visible rather than claiming training was queued", async (t) => {
  t.mock.method(service, "status", async () => ({ data: null, error: { message: "table missing" } }));
  const { res, result } = response(); await getSentimentTraining(request(), res); assert.equal(result.code, 503);
});

test("status only advertises automatic continued updates when the migration reports support", async (t) => {
  const selects: string[] = [];
  t.mock.method(supabaseAdmin, "from", ((table: string) => {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "single", "order", "limit"]) builder[method] = () => builder;
    builder.select = (query: string) => { if (table === "sentiment_training_jobs") selects.push(query); return builder; };
    builder.then = (resolve: never, reject: never) => Promise.resolve({ data: table === "sentiment_model_state"
      ? { generation: 0, active_job_id: null } : [], error: null }).then(resolve, reject);
    return builder;
  }) as unknown as typeof supabaseAdmin.from);
  const capabilities = t.mock.method(supabaseAdmin, "rpc", (async (name: string) => ({
    data: name === 'sentiment_training_pool_summary' ? { approvedExamples: 1, pendingDatasets: 2, newExamples: 1, languages: {} } :
      { continued_training: true, automatic_activation: false, supporting_pool: true, fresh_candidates: true, independent_admission: true, manual_training: true, manual_enable: true }, error: null,
  })) as unknown as typeof supabaseAdmin.rpc);
  const enabled = await service.status();
  assert.equal(enabled.data?.automaticUpdates, false);
  assert.equal(enabled.data?.supportingPool, true);
  assert.equal(enabled.data?.continuedTraining, true);
  assert.equal(enabled.data?.freshCandidates, true);
  assert.equal(enabled.data?.independentAdmission, true);
  assert.equal(enabled.data?.manualTraining, true);
  assert.equal(enabled.data?.manualEnable, true);
  assert.equal(enabled.data?.poolSummary?.approvedExamples, 1);
  assert.match(selects[0]!, /training_mode/, "fresh-capable deployments expose the queued training mode");
  assert.equal(capabilities.mock.calls[0]!.arguments[0], "sentiment_training_capabilities",
    "status must never poll the lease-checked worker RPC");
  capabilities.mock.restore();
  t.mock.method(supabaseAdmin, "rpc", (async () => ({ data: null, error: { message: "migration missing" } })) as unknown as typeof supabaseAdmin.rpc);
  const old = await service.status();
  assert.equal(old.data?.automaticUpdates, false);
  assert.equal(old.data?.continuedTraining, false);
  assert.equal(old.data?.freshCandidates, false);
  assert.doesNotMatch(selects[1]!, /training_mode/, "pre-migration deployments keep the original job query intact");
});
