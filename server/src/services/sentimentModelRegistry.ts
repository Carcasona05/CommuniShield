import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { InferenceSession, Tensor } from "onnxruntime-node";
import { supabaseAdmin } from "../config/supabaseAdmin.js";

export const MODEL_FILES = ["sentiment_english.onnx", "sentiment_filipino.onnx", "sentiment_cebuano.onnx", "language_id.onnx"] as const;
type ModelFile = { path: string; sha256: string; size: number };
export type ModelManifest = { files: Record<string, ModelFile> };
export type ModelBundle = { version: string; directory: string };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const modelRegistryEnabled = () => process.env.SENTIMENT_MODEL_REGISTRY_ENABLED === "true";

export function validateManifest(jobId: string, manifest: unknown): ModelManifest {
  if (!uuid.test(jobId) || !manifest || typeof manifest !== "object") throw new Error("Invalid model manifest");
  const files = (manifest as ModelManifest).files;
  for (const name of MODEL_FILES) {
    const file = files?.[name];
    const parts = typeof file?.path === "string" ? file.path.split("/") : [];
    if (!file || parts.length !== 3 || parts[0] !== jobId || !uuid.test(parts[1] || "") || parts[2] !== name || !/^[a-f0-9]{64}$/.test(file.sha256 || "") || !Number.isInteger(file.size) || file.size < 1 || file.size > 104857600) throw new Error("Invalid model file metadata");
  }
  return { files };
}

export const modelRegistryDependencies = {
  now: () => Date.now(),
  async readActive(): Promise<{ jobId: string; manifest: unknown } | null> {
    const { data: state, error } = await supabaseAdmin.from("sentiment_model_state").select("active_job_id").eq("id", 1).single();
    if (error) throw new Error("Model registry unavailable");
    if (!state.active_job_id) return null;
    const { data: job, error: jobError } = await supabaseAdmin.from("sentiment_training_jobs").select("artifact_manifest, status").eq("id", state.active_job_id).single();
    if (jobError || job.status !== "ready") throw new Error("Active model bundle unavailable");
    return { jobId: state.active_job_id, manifest: job.artifact_manifest };
  },
  async download(path: string) {
    const { data, error } = await supabaseAdmin.storage.from("sentiment-models").download(path);
    if (error || !data) throw new Error("Could not download model artifact");
    return Buffer.from(await data.arrayBuffer());
  },
  async smokeTest(path: string) {
    const session = await InferenceSession.create(path);
    try {
      const output = await session.run({ text: new Tensor("string", ["Community safety report"], [1, 1]) });
      const probabilities = output.probabilities?.data;
      if (!probabilities || probabilities.length !== 3 || Array.from(probabilities, Number).some((value) => !Number.isFinite(value))) throw new Error("Invalid ONNX model output");
    } finally { await session.release(); }
  },
};

// Materialize immutable, checksummed artifacts in writable local/serverless temp
// storage. A complete bundle is returned only after every file passes validation.
const materializing = new Map<string, Promise<ModelBundle>>();
export async function prepareModelBundle(jobId: string, rawManifest: unknown): Promise<ModelBundle> {
  const manifest = validateManifest(jobId, rawManifest);
  const fingerprint = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
  const version = `${jobId}-${fingerprint.slice(0, 12)}`;
  const cached = materializing.get(version);
  if (cached) return cached;
  const work = (async () => {
    const directory = join(process.env.SENTIMENT_MODEL_CACHE_DIR || join(tmpdir(), "communishield-models"), version);
    await mkdir(directory, { recursive: true });
    for (const name of MODEL_FILES) {
      const file = manifest.files[name]!;
      const target = join(directory, name);
      let bytes: Buffer | undefined;
      try { bytes = await readFile(target); } catch { /* Download on a cache miss. */ }
      if (!bytes || bytes.length !== file.size || createHash("sha256").update(bytes).digest("hex") !== file.sha256) {
        bytes = await modelRegistryDependencies.download(file.path);
        if (bytes.length !== file.size || createHash("sha256").update(bytes).digest("hex") !== file.sha256) throw new Error("Model artifact checksum mismatch");
        const temporary = `${target}.download`;
        await writeFile(temporary, bytes);
        await modelRegistryDependencies.smokeTest(temporary);
        await rename(temporary, target);
      } else await modelRegistryDependencies.smokeTest(target);
    }
    return { version, directory };
  })();
  materializing.set(version, work);
  try { return await work; } catch (error) { materializing.delete(version); throw error; }
}

let lastCheck = 0;
let current: ModelBundle | null = null;
let refresh: Promise<ModelBundle> | null = null;
export async function getActiveModelBundle(baselineDirectory: string): Promise<ModelBundle> {
  const baseline = { version: "bundled", directory: baselineDirectory };
  if (!modelRegistryEnabled()) return baseline;
  if (current && modelRegistryDependencies.now() - lastCheck < 30000) return current;
  if (refresh) return refresh;
  refresh = (async () => {
    try {
      const active = await modelRegistryDependencies.readActive();
      current = active ? await prepareModelBundle(active.jobId, active.manifest) : baseline;
    } catch (error) {
      // Never replace a working model with a failed/partial download.
      console.error("Sentiment model refresh failed:", error instanceof Error ? error.message : "Unknown error");
      current ||= baseline;
    }
    lastCheck = modelRegistryDependencies.now();
    return current!;
  })();
  try { return await refresh; } finally { refresh = null; }
}
