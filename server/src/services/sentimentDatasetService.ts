import { supabaseAdmin } from "../config/supabaseAdmin.js";
import { validateDatasetRows } from "./sentimentDatasetValidation.js";

export const sentimentDatasetService = {
  async trainingReady() {
    const { data, error } = await supabaseAdmin.from("sentiment_model_state").select("id").eq("id", 1).maybeSingle();
    return !error && Boolean(data);
  },
  async preview(rows: unknown[], excludeId?: string) {
    const normalized = validateDatasetRows(rows);
    const keys = [...new Set(normalized.filter((row) => row.status === "valid").map((row) => row.text_key))];
    const existing: { text_key: string; label: string }[] = [];
    for (let i = 0; i < keys.length; i += 100) {
      let query = supabaseAdmin.from("sentiment_training_samples").select("text_key, label").eq("active", true).in("text_key", keys.slice(i, i + 100));
      if (excludeId) query = query.neq("id", excludeId);
      const { data, error } = await query;
      if (error) return { data: null, error };
      existing.push(...(data || []));
    }
    return { data: validateDatasetRows(rows, existing), error: null };
  },
  async list(status: string, page: number) {
    let query = supabaseAdmin.from("sentiment_datasets").select("*, sentiment_training_samples(count)", { count: "exact" });
    if (status !== "all") query = query.eq("status", status);
    return await query.order("created_at", { ascending: false }).range((page - 1) * 10, page * 10 - 1);
  },
  async detail(id: string, page: number) {
    const batch = await supabaseAdmin.from("sentiment_datasets").select("*").eq("id", id).maybeSingle();
    if (batch.error || !batch.data) return { data: null, error: batch.error };
    const samples = await supabaseAdmin.from("sentiment_training_samples").select("id, text, language, label", { count: "exact" }).eq("dataset_id", id).order("id").range((page - 1) * 25, page * 25 - 1);
    const events = await supabaseAdmin.from("sentiment_dataset_events").select("*").eq("dataset_id", id).order("created_at", { ascending: false }).limit(100);
    if (samples.error || events.error) return { data: null, error: samples.error || events.error };
    return { data: { dataset: batch.data, samples: samples.data, sampleCount: samples.count || 0, events: events.data }, error: null };
  },
  async mutate(actor: string, action: string, payload: Record<string, unknown>) {
    return await supabaseAdmin.rpc("manage_sentiment_dataset", { p_actor: actor, p_action: action, p_payload: payload });
  },
  async export(actor: string, id: string, format: string) {
    const { data: batch, error } = await supabaseAdmin.from("sentiment_datasets").select("status, version").eq("id", id).maybeSingle();
    if (error || !batch || batch.status !== "approved") return { data: null, error, unavailable: true };
    return await this.mutate(actor, "export", { dataset_id: id, version: batch.version, format });
  },
};
