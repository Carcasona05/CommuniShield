/** Read-only audit. No training, activation, reanalysis, or Gemini requests.
 * From server/: node --import tsx scripts/diagnostics/auditSentiment.ts
 */
import "dotenv/config";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { InferenceSession, Tensor } from "onnxruntime-node";
import { supabaseAdmin as db } from "../../src/config/supabaseAdmin.js";
import { MODEL_FILES, modelRegistryEnabled, prepareModelBundle, supportingModelsEnabled } from "../../src/services/sentimentModelRegistry.js";
import { builtinModelHashes, supportingProposals } from "../../src/services/supportingModelRegistry.js";
import { ranked, routeSupportingModels, validIndependentPolicy, type Scores } from "../../src/services/supportingModelRouting.js";

type Analysis = { id: string; subject_type: string; subject_id: string; label: string; status: string;
  language: string; model: string; provider: string; error_code: string; analyzed_at: string | null };
type Dataset = { id: string; name: string; status: string; version: number };
type Sample = { id: string; dataset_id: string; language: string; label: string; active: boolean };
type Subject = { id: string; status?: string };
type Json = Record<string, unknown>;
function object(value: unknown): Json { return value && typeof value === "object" ? value as Json : {}; }
function counts<T>(rows: T[], key: (row: T) => string) {
  const result: Record<string, number> = {};
  for (const row of rows) { const k = key(row); result[k] = (result[k] || 0) + 1; }
  return result;
}
async function all<T>(table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await db.from(table).select(columns).order("id").range(from, from + 499);
    if (error) throw new Error(`${table}: ${error.code}`);
    rows.push(...data as unknown as T[]);
    if (data.length < 500) return rows;
  }
}
async function probes(directory: string) {
  const sessions: InferenceSession[] = [];
  const result = [];
  const langs = ["cebuano", "english", "filipino"];
  const texts = [
    "Sige lag ulan unya baha dayon, way gibuhat ang gobyerno sa drainage",
    "Maayo nga wala ka nagpataka og pasangil.",
    "Salamat sa update!",
    "Bilib",
    "kaila man ko ani niya oh",
  ];
  try {
    const language = await InferenceSession.create(join(directory, "language_id.onnx"));
    sessions.push(language);
    const local = new Map<string, InferenceSession>();
    for (const text of texts) {
      const input = { text: new Tensor("string", [text], [1, 1]) };
      const output = await language.run(input);
      const scores = Array.from(output.probabilities!.data, Number);
      const best = scores.indexOf(Math.max(...scores));
      const languageScores = Object.fromEntries(langs.map((name, i) => [name, scores[i]]));
      if (scores[best]! < 0.5) {
        result.push({ text, language: "unknown", languageScores, status: "unavailable", reason: "language_uncertain" });
        continue;
      }
      const name = langs[best]!;
      let session = local.get(name);
      if (!session) {
        session = await InferenceSession.create(join(directory, `sentiment_${name}.onnx`));
        local.set(name, session); sessions.push(session);
      }
      const sentiment = await session.run(input);
      const values = Array.from(sentiment.probabilities!.data, Number);
      const primary: Scores = { negative: values[0]!, neutral: values[1]!, positive: values[2]! };
      const proposals = await supportingProposals(directory, name, text, primary);
      result.push({ text, language: name, languageScores,
        primary: ranked(primary), supports: proposals.map(p => ({ id: p.id, prediction: ranked(p.scores),
          requiredConfidence: p.rule.support_confidence, requiredMargin: p.rule.support_margin })),
        routed: routeSupportingModels(primary, proposals) });
    }
    return result;
  } finally { await Promise.all(sessions.map(session => session.release())); }
}
async function main() {
  const [analyses, reports, comments, datasets, samples] = await Promise.all([
    all<Analysis>("sentiment_analysis", "id,subject_type,subject_id,label,status,language,model,provider,error_code,analyzed_at"),
    all<Subject>("reports", "id,status"), all<Subject>("report_comments", "id"),
    all<Dataset>("sentiment_datasets", "id,name,status,version"),
    all<Sample>("sentiment_training_samples", "id,dataset_id,language,label,active"),
  ]);
  const seen = new Set(analyses.map(r => `${r.subject_type}:${r.subject_id}`));
  const approved = new Set(datasets.filter(d => d.status === "approved").map(d => d.id));
  const approvedSamples = samples.filter(s => s.active && approved.has(s.dataset_id));
  const unresolved = analyses.filter(a => a.label === "unclear");
  const unavailable = analyses.filter(a => a.status !== "succeeded");
  const modelDir = resolve(process.env.SENTIMENT_MODEL_DIR?.trim() || "models");
  const files = Object.fromEntries(MODEL_FILES.map(name => [name, existsSync(join(modelDir, name))]));
  const hashes = Object.values(files).every(Boolean) ? await builtinModelHashes(modelDir) : {};
  const settings = await db.from("system_settings").select("key,value")
    .in("key", ["sentiment_local_model_enabled", "sentiment_gemini_enabled", "sentiment_cebuano_mode"]);
  if (settings.error) throw new Error(`settings: ${settings.error.code}`);
  const pool = await db.from("sentiment_supporting_models").select("id,status,routing_policy,artifact_manifest");
  const jobs = await db.from("sentiment_training_jobs")
    .select("id,status,created_at,finished_at,metrics,error,datasets:snapshot->datasets")
    .order("created_at", { ascending: false }).limit(10);
  const poolSummary = (pool.data || []).map(row => {
    const policy = object(row.routing_policy);
    const expected = object(policy.builtin_hashes);
    return { id: row.id, status: row.status, independentlyQualified: validIndependentPolicy(policy),
      qualifiedLanguages: Object.keys(object(policy.languages)),
      builtinHashesMatch: MODEL_FILES.every(name => expected[name] === hashes[name]) };
  });
  const report = {
    auditedAt: new Date().toISOString(), readOnly: true,
    configuration: { registryEnabled: modelRegistryEnabled(), supportingModelsEnabled: supportingModelsEnabled(),
      modelDirectory: modelDir, files, settings: settings.data },
    training: {
      datasets: datasets.map(d => ({ ...d, activeSamples: samples.filter(s => s.active && s.dataset_id === d.id).length })),
      approvedActiveSamples: approvedSamples.length,
      approvedLabelCoverage: counts(approvedSamples, s => `${s.language}:${s.label}`),
      jobsError: jobs.error?.code || null,
      recentJobs: (jobs.data || []).map(job => ({ id: job.id, status: job.status, createdAt: job.created_at,
        finishedAt: job.finished_at, error: job.error, passed: object(job.metrics).passed,
        data: object(job.metrics).data, datasets: job.datasets })),
    },
    supportingPool: { error: pool.error?.code || null, models: poolSummary },
    storedResults: {
      reports: reports.length, comments: comments.length, analyses: analyses.length,
      missingReportAnalyses: reports.filter(r => !seen.has(`report:${r.id}`)).length,
      missingNonArchivedReportAnalyses: reports.filter(r => r.status !== "Archived" && !seen.has(`report:${r.id}`)).length,
      missingCommentAnalyses: comments.filter(c => !seen.has(`comment:${c.id}`)).length,
      byTypeStatusLabel: counts(analyses, a => `${a.subject_type}:${a.status}:${a.label}`),
      unclearByModel: counts(unresolved, a => `${a.status}:${a.model}`),
      unavailableByError: counts(unavailable, a => /^[a-z_]+$/.test(a.error_code || "") ? a.error_code : a.error_code ? `${a.error_code.split(":")[0]}_error` : "no_error_code"),
      unavailableByLanguage: counts(unavailable, a => `${a.subject_type}:${a.language}:${a.status}`),
    },
    liveReadOnlyProbes: process.argv.includes("--probe") ? await probes(modelDir) : undefined,
  };
  const directory = fileURLToPath(new URL("../../../artifacts/sentiment-audits/", import.meta.url));
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `audit-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`Read-only audit saved to ${path}`);
  if (process.argv.includes("--export-pool")) {
    if (pool.error || !supportingModelsEnabled()) throw new Error("An available, enabled supporting pool is required for evaluation.");
    const models = [];
    for (const row of pool.data || []) {
      const summary = poolSummary.find(p => p.id === row.id)!;
      if (row.status !== "enabled") continue;
      if (!summary.independentlyQualified || !summary.builtinHashesMatch) throw new Error("An enabled supporting model failed compatibility checks.");
      const bundle = await prepareModelBundle(row.id, row.artifact_manifest);
      models.push({ id: row.id, directory: bundle.directory, policy: row.routing_policy });
    }
    if (!models.length) throw new Error("No qualified enabled supporting models to evaluate.");
    const snapshot = { createdAt: new Date().toISOString(), primaryDirectory: modelDir, primaryHashes: hashes, models };
    const snapshotPath = join(directory, `pool-snapshot-${Date.now()}.json`);
    writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
    console.log(`Read-only pool snapshot saved to ${snapshotPath}`);
  }
}
main().catch(error => { console.error(error.message || error); process.exitCode = 1; });
