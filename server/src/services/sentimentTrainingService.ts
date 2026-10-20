import { supabaseAdmin } from "../config/supabaseAdmin.js";
import { modelRegistryEnabled, prepareModelBundle } from "./sentimentModelRegistry.js";

export const sentimentTrainingService = {
  async status() {
    const state = await supabaseAdmin.from("sentiment_model_state").select("generation, data_revision, active_job_id, previous_job_id, updated_at").eq("id", 1).single();
    const jobs = await supabaseAdmin.from("sentiment_training_jobs").select("id, status, created_at, available_at, started_at, finished_at, lease_until, data_revision, base_generation, base_job_id, metrics, error, datasets:snapshot->datasets").order("created_at", { ascending: false }).limit(10);
    if (state.error || jobs.error) return { data: null, error: state.error || jobs.error };
    return { data: { state: state.data, jobs: jobs.data, registryEnabled: modelRegistryEnabled() }, error: null };
  },
  async action(actor: string, action: string, jobId: string | null, generation: number | null) {
    if (action === "activate" || action === "rollback") {
      if (!modelRegistryEnabled()) return { data: null, error: { code: "22023", message: "Enable SENTIMENT_MODEL_REGISTRY_ENABLED on the backend before activation or rollback." } };
      let target = jobId;
      if (action === "rollback") {
        const state = await supabaseAdmin.from("sentiment_model_state").select("previous_job_id").eq("id", 1).single();
        if (state.error) return { data: null, error: state.error };
        target = state.data.previous_job_id;
      }
      if (target) {
        const job = await supabaseAdmin.from("sentiment_training_jobs").select("status, artifact_manifest").eq("id", target).single();
        if (job.error || job.data?.status !== "ready") return { data: null, error: { code: "22023", message: "Candidate artifacts are not ready." } };
        await prepareModelBundle(target, job.data.artifact_manifest);
      }
    }
    return await supabaseAdmin.rpc("manage_sentiment_training", { p_actor: actor, p_action: action, p_job: jobId, p_generation: generation });
  },
};
