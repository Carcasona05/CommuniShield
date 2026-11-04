import "../helpers/serverEnvironment.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { supabaseAdmin } from "../../server/src/config/supabaseAdmin.js";
import { sentimentTrainingService } from "../../server/src/services/sentimentTrainingService.js";

for (const installed of [false, true]) {
  test(`training status safely merges telemetry (migration installed=${installed})`, async t => {
    const query = {
      select() { return this; }, eq() { return this; }, order() { return this; },
      single: async () => ({ data: { generation: 1 }, error: null }),
      limit: async () => ({ data: [{ id: "job", status: "training" }], error: null }),
    };
    t.mock.method(supabaseAdmin, "from", () => query as never);
    const calls: string[] = [];
    const progress = { version: 1, completed: 2, total: 5, stage: "fitting" };
    t.mock.method(supabaseAdmin, "rpc", (async (name: string) => {
      calls.push(name);
      if (name === "sentiment_training_capabilities") return { data: {}, error: null };
      if (name === "get_sentiment_training_progress") return installed
        ? { data: [{ id: "job", progress }], error: null }
        : { data: null, error: { code: "PGRST202" } };
      throw new Error("Unexpected RPC");
    }) as never);
    const result = await sentimentTrainingService.status();
    assert.equal(result.error, null);
    assert.equal(result.data?.progressSupported, installed);
    assert.deepEqual(result.data?.jobs[0]?.progress, installed ? progress : null);
    assert.ok(!calls.includes("sentiment_training_worker"), "never probe a lease-mutating endpoint");
  });
}
