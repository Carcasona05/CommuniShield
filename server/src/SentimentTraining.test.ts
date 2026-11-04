import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Request, Response } from "express";
import type { User } from "@supabase/supabase-js";
import { getActiveModelBundle, MODEL_FILES, modelRegistryDependencies as deps, prepareModelBundle, validateManifest } from "./services/sentimentModelRegistry.js";
import { getSentimentTraining, manageSentimentTraining } from "./controllers/sentimentTrainingController.js";
import { sentimentTrainingService as service } from "./services/sentimentTrainingService.js";

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
  await writeFile(path, await readFile(new URL("../models/sentiment_english.onnx", import.meta.url)));
  await deps.smokeTest(path);
});

test("registry refresh switches only complete models, keeps last-good on failure, and supports rollback", async (t) => {
  const directory = await temporary();
  setEnv(t, "SENTIMENT_MODEL_CACHE_DIR", directory);
  setEnv(t, "SENTIMENT_MODEL_REGISTRY_ENABLED", "true");
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bytes = Buffer.from("good-model");
  let clock = Date.now();
  const id = randomUUID();
  let active: { jobId: string; manifest: unknown } | null = null;
  t.mock.method(deps, "now", () => clock);
  t.mock.method(deps, "readActive", async () => active);
  const download = t.mock.method(deps, "download", async () => bytes);
  t.mock.method(deps, "smokeTest", async () => {});
  assert.equal((await getActiveModelBundle("baseline")).version, "bundled");
  clock += 31000; active = { jobId: id, manifest: manifest(id, bytes) };
  const loaded = await getActiveModelBundle("baseline");
  assert.ok(loaded.version.startsWith(id));
  clock += 31000;
  const brokenId = randomUUID();
  active = { jobId: brokenId, manifest: manifest(brokenId, Buffer.from("different")) };
  assert.deepEqual(await getActiveModelBundle("baseline"), loaded);
  assert.equal(download.mock.callCount(), 5);
  clock += 31000; active = null;
  assert.equal((await getActiveModelBundle("baseline")).version, "bundled");
});

test("training handlers reject unauthenticated and malformed actions", async (t) => {
  for (const handler of [getSentimentTraining, manageSentimentTraining]) {
    const { res, result } = response(); await handler({} as Request, res); assert.equal(result.code, 401);
  }
  const action = t.mock.method(service, "action", async () => { throw new Error("must not run"); });
  for (const body of [{}, { action: "activate", jobId }, { action: "activate", jobId: "../file", generation: 1 }, { action: "rollback", generation: -1 }, { action: "train-shell-command" }]) {
    const { res, result } = response(); await manageSentimentTraining(request(body), res); assert.equal(result.code, 400);
  }
  assert.equal(action.mock.callCount(), 0);
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
