import { supabaseAdmin } from "../config/supabaseAdmin.js";
import { modelRegistryEnabled, supportingModelsEnabled } from "./sentimentModelRegistry.js";

export const sentimentTrainingService = {
  async status() {
    // Never probe the lease-checked mutation RPC: legacy deployments treat
    // unknown actions as invalid worker leases and flood database error logs.
    // Capabilities come first: they decide whether the training_mode column exists.
    const capabilities = await supabaseAdmin.rpc("sentiment_training_capabilities", {});
    const independentAdmission = capabilities.data?.independent_admission === true && !capabilities.error;
    const freshCandidates = capabilities.data?.fresh_candidates === true && !capabilities.error;
    const state = await supabaseAdmin.from("sentiment_model_state").select("generation, data_revision, active_job_id, previous_job_id, updated_at").eq("id", 1).single();
    const jobs = await supabaseAdmin.from("sentiment_training_jobs").select(`id, status, created_at, available_at, started_at, finished_at, lease_until, data_revision, base_generation, base_job_id, metrics, error, datasets:snapshot->datasets${freshCandidates ? ", training_mode" : ""}${capabilities.data?.language_scoped_training === true ? ', training_languages' : ''}`).order("created_at", { ascending: false }).limit(10);
    if (state.error || jobs.error) return { data: null, error: state.error || jobs.error };
    const summary = independentAdmission ? await supabaseAdmin.rpc("sentiment_training_pool_summary", {}) : null;
    if (summary?.error) return { data: null, error: summary.error };
    return { data: { state: state.data, jobs: jobs.data, registryEnabled: modelRegistryEnabled(),
      automaticUpdates: false,
      supportingServingEnabled: supportingModelsEnabled(),
      supportingPool: capabilities.data?.supporting_pool === true && !capabilities.error,
      freshCandidates,
      independentAdmission,
      manualTraining: capabilities.data?.manual_training === true,
      manualEnable: capabilities.data?.manual_enable === true,
      languageScopedTraining: capabilities.data?.language_scoped_training === true,
      poolSummary: summary?.data || null,
      continuedTraining: capabilities.data?.continued_training === true && !capabilities.error }, error: null };
  },
  async action(actor: string, action: string, jobId: string | null, generation: number | null, mode = "continue", datasetIds?: string[]) {
    if (action !== "queue") return { data: null, error: { code: "22023", message: "Built-in models are permanent. Manage supporting models instead." } };
    if (mode !== "continue" && mode !== "fresh") return { data: null, error: { code: "22023", message: 'Training mode must be "continue" or "fresh".' } };
    const capabilities = await supabaseAdmin.rpc("sentiment_training_capabilities", {});
    if (capabilities.error || capabilities.data?.supporting_pool !== true) return { data: null, error: { code: "22023", message: "Apply sentiment_supporting_pool.sql before queueing supporting-model training." } };
    if (capabilities.data?.independent_admission !== true) return { data: null, error: { code: "22023", message: "Apply sentiment_independent_admission.sql before queueing training under the new independent-quality workflow." } };
    if (capabilities.data?.language_scoped_training !== true) return {data:null,error:{code:'22023',message:'Apply sentiment_language_scoped_training.sql before queueing language-specific training.'}};
    const freshSupported = capabilities.data?.fresh_candidates === true;
    if (datasetIds !== undefined && capabilities.data?.language_scoped_training !== true) return {data:null,error:{code:'22023',message:'Apply sentiment_language_scoped_training.sql before selecting datasets.'}};
    if (mode === "fresh" && !freshSupported) return { data: null, error: { code: "22023", message: "Apply sentiment_fresh_candidates.sql before queueing a fresh challenger. Built-in models are unchanged." } };
    const args: Record<string, unknown> = { p_actor: actor, p_action: action, p_job: jobId, p_generation: generation };
    // Pre-migration deployments expose the four-argument function; only send the
    // mode payload where the fresh-candidates migration advertises support.
    if (freshSupported) args.p_payload = { mode, ...(datasetIds ? {dataset_ids:datasetIds} : {}) };
    return await supabaseAdmin.rpc("manage_sentiment_training", args);
  },
};
