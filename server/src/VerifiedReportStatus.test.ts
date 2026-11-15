import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import { adminAnalysisJobs } from "./services/adminAnalysisJobs.js";
import { supabaseAdmin } from "./config/supabaseAdmin.js";
import { notificationService } from "./services/notificationService.js";
import { reportService } from "./services/reportService.js";
import { buildRiskOutlook } from "./services/riskOutlookService.js";
import { summarizeHotspotEvidence } from "./services/hotspotSentimentService.js";
import { clusterHotspots } from "./services/hotspotClusteringService.js";

for (const status of ["Verified", "Resolved"]) {
  test(`${status} notifications retain the actual status even though both are confirmed`, async t => {
    t.mock.method(supabaseAdmin, "from", (() => {
      const builder = { select() { return this; }, eq() { return this; },
        async maybeSingle() { return { data: { status, is_verified: true }, error: null }; } };
      return builder;
    }) as never);
    const owner = t.mock.method(notificationService, "createNotification", (async () => ({ error: null })) as never);
    const admins = t.mock.method(notificationService, "notifyAllAdmins", (async () => ({ error: null })) as never);
    const nearby = t.mock.method(notificationService, "notifyNearbyUsers", (async () => ({ error: null })) as never);
    t.mock.method(reportService, "getReportSeverity", async () => "High");
    t.mock.method(reportService, "getReportCoords", async () => ({ data: { latitude: 9.88, longitude: 123.59 }, error: null }));
    await adminAnalysisJobs.perform({ id: "job", kind: "status_followup", subject_id: "report", report_id: "report", lease_token: "lease", attempts: 1,
      payload: { ownerId: "owner", status, verified: true, actorName: "Ada" } });
    assert.match(owner.mock.calls[0]!.arguments[0].title, new RegExp(status.toLowerCase(), "i"));
    assert.match(admins.mock.calls[0]!.arguments[0].message, new RegExp(status));
    assert.match(nearby.mock.calls[0]!.arguments[0].title, new RegExp(status));
    if (status === "Resolved") assert.doesNotMatch(nearby.mock.calls[0]!.arguments[0].message || "", /verified/);
  });
}

test("Verified history and evidence are eligible without being treated as resolved", () => {
  const now = Date.parse("2026-11-15T12:00:00Z");
  const rows = Array.from({ length: 160 }, (_, index) => ({ id: `report-${index}`, status: "Verified", is_verified: true,
    created_at: new Date(now - (index + 1) * 86400000).toISOString(), location: "Lamacan, Argao", latitude: 9.8784487, longitude: 123.5950192 }));
  const forecast = buildRiskOutlook(rows, { now, barangay: "Lamacan" });
  assert.equal(forecast.status, "available");
  assert.equal(forecast.stats.reports, 160);
  const evidence = summarizeHotspotEvidence(rows.slice(0, 3), { now, windowDays: 30 });
  assert.equal(evidence.verification.verified, 3);
  const spatial = clusterHotspots(rows.slice(0, 3), { now });
  assert.equal(spatial.summary.excluded.inactive, 0);
});
