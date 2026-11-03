import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { supabaseAdmin } from "../config/supabaseAdmin.js";
import { modelRegistryEnabled, prepareModelBundle } from "./sentimentModelRegistry.js";
import { builtinModelHashes, invalidateSupportingRegistry } from "./supportingModelRegistry.js";
import { validRule, validIndependentPolicy } from "./supportingModelRouting.js";

export function builtinDirectory() {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve([process.env.SENTIMENT_MODEL_DIR?.trim(), join(here, "../../models"), join(here, "../../../datasets/models")]
    .filter((p): p is string => Boolean(p)).find((p) => existsSync(join(p, "sentiment_english.onnx"))) || join(here, "../../models"));
}
export const supportingModelService = {
  async list(page: number) {
    const [models, settings, state, enabled] = await Promise.all([
      supabaseAdmin.from("sentiment_supporting_models").select("id,name,status,routing_policy,metrics,datasets,use_count,last_used_at,created_at,updated_at", { count: "exact" })
        .neq("status", "deleted").order("created_at", { ascending: false }).order("id").range((page - 1) * 10, page * 10 - 1),
      supabaseAdmin.from("sentiment_supporting_settings").select("max_enabled").eq("id", 1).single(),
      supabaseAdmin.from("sentiment_model_state").select("generation").eq("id", 1).single(),
      supabaseAdmin.from("sentiment_supporting_models").select("id", { count: "exact", head: true }).eq("status", "enabled"),
    ]);
    const error = models.error || settings.error || state.error || enabled.error;
    if (error) return { data: null, error };
    return { data: { models: models.data, total: models.count, maxEnabled: settings.data.max_enabled,
      enabledCount: enabled.count, generation: state.data.generation }, error: null };
  },
  async action(actor: string, action: string, id: string | null, generation: number, limit?: number) {
    const payload: { limit?: number; builtin_hashes?: { [key: string]: string } } = {};
    if (action === "set_limit" && limit !== undefined) payload.limit = limit;
    if (action === "enable") {
      if (!modelRegistryEnabled()) return { data: null, error: { code: "22023", message: "Enable the model registry before enabling supporting models." } };
      const { data: row, error } = await supabaseAdmin.from("sentiment_supporting_models").select("artifact_manifest,status,routing_policy,metrics").eq("id", id).single();
      if (error) return { data: null, error };
      payload.builtin_hashes = await builtinModelHashes(builtinDirectory());
      const policy = row.routing_policy;
      const verified = validIndependentPolicy(policy) || (policy?.version === 1 && policy?.passed === true && policy?.cascade_test?.passed === true);
      if (row.status !== "disabled" || row.metrics?.passed !== true || !verified ||
          !policy.languages || !Object.values(policy.languages).length || !Object.values(policy.languages).every(validRule) ||
          Object.entries(payload.builtin_hashes).some(([name, hash]) => policy.builtin_hashes?.[name] !== hash)) {
        return { data: null, error: { code: "22023", message: "Model or fallback policy is unverified for this built-in version." } };
      }
      if (policy.scope_version === 1) {
        const manifest = row.artifact_manifest as { languages?: unknown };
        const expected = Object.keys(policy.languages).sort();
        if (!Array.isArray(manifest?.languages) || JSON.stringify([...manifest.languages].sort()) !== JSON.stringify(expected)) {
          return { data: null, error: { code: '22023', message: 'Bundle languages do not match qualified languages.' } };
        }
      }
      await prepareModelBundle(id!, row.artifact_manifest);
    }
    const result = await supabaseAdmin.rpc("manage_sentiment_supporting_model", {
      p_actor: actor, p_action: action, p_model: id, p_generation: generation, p_payload: payload,
    });
    if (!result.error) invalidateSupportingRegistry();
    return result;
  },
};
