import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import { supabaseAdmin } from "./config/supabaseAdmin.js";
import { sentimentTrainingService } from "./services/sentimentTrainingService.js";

for (const installed of [false, true]) {
  test(`training status reads exact selection only when its migration is installed (${installed})`, async t => {
    const columns: string[] = [];
    const receipt = [{ id: "dataset-a", version: 1 }];
    const query = {
      select(value: string) { columns.push(value); return this; },
      eq() { return this; }, order() { return this; },
      single: async () => ({ data: { generation: 1 }, error: null }),
      limit: async () => ({ data: [{ id: "job", ...(installed ? { selected_dataset_versions: receipt } : {}) }], error: null }),
    };
    t.mock.method(supabaseAdmin, "from", () => query as never);
    const calls: string[] = [];
    t.mock.method(supabaseAdmin, "rpc", (async (name: string) => {
      calls.push(name);
      if (name === "sentiment_training_capabilities") return { data: { independent_admission: true, language_scoped_training: true }, error: null };
      if (name === "sentiment_training_pool_summary") return { data: { queueSummaryVersion: 1, ...(installed ? { datasetSelectionVersion: 1 } : {}) }, error: null };
      if (name === "get_sentiment_training_progress") return { data: [], error: null };
      throw new Error(`Unexpected RPC: ${name}`);
    }) as never);
    const result = await sentimentTrainingService.status();
    assert.equal(result.error, null);
    assert.equal(columns.some(value => value.includes("selected_dataset_versions")), installed);
    assert.deepEqual(result.data?.jobs[0]?.selected_dataset_versions, installed ? receipt : undefined);
    assert.ok(!calls.includes("sentiment_training_worker"), "status must never claim or mutate a job");
  });
}
