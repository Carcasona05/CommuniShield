import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { supabaseAdmin } from "../config/supabaseAdmin.js";
import { builtinDirectory } from "./supportingModelService.js";
import { supportingModelsEnabled } from "./sentimentModelRegistry.js";
import { builtinModelHashes } from "./supportingModelRegistry.js";
import { validIndependentPolicy } from "./supportingModelRouting.js";

const languages = ["cebuano", "english", "filipino"];
const score = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
type ClassMetric = { precision?: number; recall?: number; f1?: number; support?: number };
type RecordedMetrics = { macro_f1?: number; accuracy?: number; per_label?: Record<string, ClassMetric>; per_class?: Record<string, ClassMetric> };
export function benchmarkMetrics(raw?: RecordedMetrics) {
  const classes = raw?.per_label || raw?.per_class;
  const rows = ["negative", "neutral", "positive"].map(label => classes?.[label]);
  const average = (field: "precision" | "recall") => rows.every(row => score(row?.[field]) !== null)
    ? rows.reduce((sum, row) => sum + row![field]!, 0) / 3 : null;
  // Support policies record per-class recall/support, from which accuracy is
  // sum(true positives) / total support. No validation metrics are substituted.
  const supportsValid = rows.every(row => typeof row?.support === "number" && Number.isFinite(row.support) && row.support >= 0 && score(row.recall) !== null);
  const total = supportsValid ? rows.reduce((sum, row) => sum + row!.support!, 0) : 0;
  const accuracy = score(raw?.accuracy) ?? (total > 0 ? rows.reduce((sum, row) => sum + row!.recall! * row!.support!, 0) / total : null);
  return { macroF1: score(raw?.macro_f1), accuracy, precision: average("precision"), recall: average("recall") };
}
export const sentimentTestStatusDependencies = {
  directory: builtinDirectory,
  readFile,
  async settings() {
    const result = await supabaseAdmin.from("system_settings").select("key,value").in("key", ["sentiment_local_model_enabled", "sentiment_gemini_enabled", "sentiment_cebuano_mode", "ai_model_name"]);
    if (result.error) throw new Error("Settings unavailable");
    return Object.fromEntries((result.data || []).map(row => [row.key, row.value]));
  },
  async supports() {
    return supabaseAdmin.from("sentiment_supporting_models").select("id,name,status,routing_policy").neq("status", "deleted").order("id").limit(20);
  },
};

export async function getSentimentTestModels() {
  const directory = sentimentTestStatusDependencies.directory();
  const [settings, pool] = await Promise.all([sentimentTestStatusDependencies.settings(), sentimentTestStatusDependencies.supports()]);
  const localEnabled = settings.sentiment_local_model_enabled === undefined || ["true", "1"].includes(settings.sentiment_local_model_enabled);
  const builtinMetrics: Record<string, ReturnType<typeof benchmarkMetrics>> = Object.fromEntries(languages.map(language => [language, benchmarkMetrics()]));
  // Portable historical benchmark manifest, explicitly bound to deployed hashes.
  // This avoids relying on git-ignored training backups in a deployed backend.
  try {
    const path = fileURLToPath(new URL("../config/builtinSentimentBenchmarks.json", import.meta.url));
    const metadata = JSON.parse(await sentimentTestStatusDependencies.readFile(path, "utf8"));
    for (const language of languages) {
      try {
        const name = `sentiment_${language}.onnx`;
        const bytes = await sentimentTestStatusDependencies.readFile(join(directory, name));
        if (metadata.onnx_hashes?.[name] !== createHash("sha256").update(bytes).digest("hex")) continue;
        const model = metadata.models?.find((item: { language: string }) => item.language === language);
        builtinMetrics[language] = benchmarkMetrics(model?.test_metrics);
      } catch { /* Missing individual artifacts do not hide other languages. */ }
    }
  } catch { /* Missing manifest is not a reason to fabricate benchmarks. */ }
  // Only associate benchmark metadata with the exact deployed ONNX bytes.
  for (const folder of [directory, resolve(directory, "../../datasets/models")]) {
    try {
      const metadata = JSON.parse(await sentimentTestStatusDependencies.readFile(join(folder, "baseline_metrics.json"), "utf8"));
      for (const language of languages) {
        const name = `sentiment_${language}.onnx`;
        const deployed = await sentimentTestStatusDependencies.readFile(join(directory, name));
        const paired = await sentimentTestStatusDependencies.readFile(join(folder, name));
        const hash = createHash("sha256").update(deployed).digest("hex");
        if (hash !== createHash("sha256").update(paired).digest("hex") || (metadata.onnx_hashes?.[name] && metadata.onnx_hashes[name] !== hash)) continue;
        const model = metadata.models?.find((item: { language: string }) => item.language === language);
        if (score(model?.test_metrics?.macro_f1) !== null) builtinMetrics[language] = benchmarkMetrics(model.test_metrics);
      }
    } catch { /* Missing/old metadata is unavailable, never an invented score. */ }
  }
  let hashes: Record<string, string> = {};
  try { hashes = await builtinModelHashes(directory); } catch { /* Report supports as unverified. */ }
  const models = [{
    id: "builtin", name: "Built-in models", source: "builtin", status: localEnabled ? "active" : "disabled",
    metrics: languages.map(language => ({ language, ...builtinMetrics[language] })),
    note: "Historical held-out test metrics, matched to the deployed model fingerprint. Precision and recall are macro averages across three sentiment classes; these are not sentence confidence scores.",
  }, ...(pool.data || []).map(row => {
    const policy = row.routing_policy;
    const verified = validIndependentPolicy(policy) && Object.keys(hashes).length === 4 && Object.entries(hashes).every(([name, hash]) => policy?.builtin_hashes?.[name] === hash);
    return {
      id: row.id, name: row.name || "Supporting model", source: "supporting",
      status: row.status !== "enabled" ? "disabled" : !verified ? "unverified" : supportingModelsEnabled() && localEnabled ? "active" : "disabled",
      metrics: Object.keys(policy?.languages || {}).map(language => ({ language, ...benchmarkMetrics(policy?.independent_test?.languages?.[language]?.metrics) })),
      note: "Recorded held-out test metrics for qualified languages. Precision/recall are macro averages; accuracy is derived from class support and recall when not recorded directly.",
    };
  }), {
    id: "gemini", name: settings.ai_model_name || process.env.GEMINI_SENTIMENT_MODEL || "gemini-2.5-flash", source: "gemini",
    status: !process.env.GEMINI_API_KEY?.trim() ? "not configured" : ["true", "1"].includes(settings.sentiment_gemini_enabled) ? "active" : "disabled",
    metrics: [], note: "No local held-out macro-F1 benchmark is recorded for Gemini. Active means configured and enabled, not a live API health check.",
  }];
  return { models, warning: pool.error ? "Supporting-model status is temporarily unavailable." : null };
}
