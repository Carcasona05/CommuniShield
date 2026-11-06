import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import { supabaseAdmin } from "./config/supabaseAdmin.js";
import { reportService } from "./services/reportService.js";

test("hotspot source relations load concurrently and preserve report fields", { timeout: 2000 }, async (t) => {
  const started = new Set<string>();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  t.after(() => release());
  const relations = new Set(["profiles", "report_credibility_analysis", "sentiment_analysis", "report_comments", "report_images"]);
  const rows: Record<string, unknown[]> = {
    incident_types: [{ id: "type", name: "Theft", incident_categories: { name: "Safety" } }],
    reports: [{ id: "report", user_id: "user", incident_type_id: "type", location: "Argao", status: "Pending Review" }],
    profiles: [{ id: "user", fullname: "Reporter" }],
    report_credibility_analysis: [{ report_id: "report", severity: "High", ai_score: 75 }],
    report_images: [{ report_id: "report", image_url: "https://example.test/image.jpg" }],
  };
  const from = (table: string) => {
    const query = {
      select: () => query, in: () => query, eq: () => query, neq: () => query, order: () => query,
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => {
        if (relations.has(table)) {
          started.add(table);
          if (started.size === relations.size) release();
        }
        return (relations.has(table) ? gate : Promise.resolve()).then(() => ({ data: rows[table] || [], error: null })).then(resolve, reject);
      },
    };
    return query;
  };
  t.mock.method(supabaseAdmin, "from", from as unknown as typeof supabaseAdmin.from);
  const result = await reportService.getAdminDashboard();
  assert.equal(started.size, 5);
  assert.equal(result.error, null);
  assert.equal(result.data?.reports[0]?.reporter_name, "Reporter");
  assert.equal(result.data?.reports[0]?.severity, "High");
  assert.deepEqual(result.data?.reports[0]?.images, ["https://example.test/image.jpg"]);
});
