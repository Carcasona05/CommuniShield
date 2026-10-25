import "../helpers/serverEnvironment.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, Response } from "express";
import { clusterHotspots, distanceMeters, type HotspotReport } from "../../server/src/services/hotspotClusteringService.js";
import { getHotspotClusters } from "../../server/src/controllers/hotspotClusteringController.js";
import { profileService } from "../../server/src/services/authService.js";
import { reportService } from "../../server/src/services/reportService.js";
  
const now = Date.parse("2026-10-21T12:00:00Z");
const point = (id: string, offset = 0, extra: Partial<HotspotReport> = {}): HotspotReport => ({
  id, latitude: 9.8816 + offset, longitude: 123.5953,
  created_at: "2026-10-20T12:00:00Z", status: "Pending Review",
  incident_category: "Public safety", incident_type: "Theft", ...extra,
});
const run = (rows: HotspotReport[]) => clusterHotspots(rows, { now });

test("repeated reports at a single pin never become a spatial hotspot", () => {
  const result = run(Array.from({ length: 30 }, (_, i) => point(String(i))));
  assert.equal(result.clusters.length, 0);
  assert.equal(result.summary.uniqueLocationCount, 1);
  assert.equal(result.summary.repeatedPinReports, 29);
  assert.equal(result.noiseReportIds.length, 30);
});

test("four nearby distinct pins form one cluster; duplicate weights retain every report", () => {
  const rows = [point("a"), point("b", 0.0002), point("c", 0.0004), point("d", 0.0006), point("e")];
  const result = run(rows);
  assert.equal(result.clusters.length, 1);
  const cluster = result.clusters[0]!;
  assert.equal(cluster.uniqueLocationCount, 4);
  assert.equal(cluster.reportCount, 5);
  assert.deepEqual(cluster.reportIds, ["a", "b", "c", "d", "e"]);
  assert.ok(Math.abs(cluster.center.latitude - 9.8819) < 1e-10, "center uses locations, not duplicate-weighted reports");
  assert.ok(cluster.radiusMeters > 0);
  assert.equal(result.dataMode, "synthetic");
});

test("numeric-equivalent coordinates collapse; close distinct coordinates do not", () => {
  const result = run([point("a"), point("b", 0, { latitude: "9.881600", longitude: "123.595300" }), point("c", 0.0000001)]);
  assert.equal(result.summary.uniqueLocationCount, 2);
  assert.equal(result.summary.repeatedPinReports, 1);
});

test("invalid, empty, outside-boundary, inactive, future and stale reports cannot create density", () => {
  const result = run([
    point("good"),
    point("invalid", 0, { latitude: "" }), point("null", 0, { latitude: null }),
    point("outside", 0, { latitude: 14.6, longitude: 120.98 }),
    ...["Archived", "Rejected", "Marked Fake", "Resolved"].map((status) => point(status, 0, { status })),
    point("future", 0, { created_at: "2027-01-01T00:00:00Z" }),
    point("old", 0, { created_at: "2026-01-01T00:00:00Z" }),
    point("undated", 0, { created_at: null }),
  ]);
  assert.equal(result.summary.eligibleReportCount, 1);
  assert.deepEqual(result.summary.excluded, { duplicateIds: 0, inactive: 4, date: 3, filters: 0, invalidCoordinates: 2, outsideBoundary: 1 });
});

test("category, incident type and date windows are applied before clustering", () => {
  const rows = [point("a"), point("b", 0.0001, { incident_type: "Flooding" }), point("c", 0.0002, { incident_category: "Environment" }), point("d", 0.0003, { created_at: "2026-10-01T00:00:00Z" })];
  const result = clusterHotspots(rows, { now, windowDays: 7, category: "Public safety", incidentType: "Theft" });
  assert.deepEqual(result.noiseReportIds, ["a"]);
  assert.equal(result.summary.excluded.filters, 2);
  assert.equal(result.summary.excluded.date, 1);
  assert.equal(clusterHotspots(rows, { now, windowDays: null }).summary.eligibleReportCount, 4);
});

test("input ordering does not change memberships and duplicate ids do not inflate counts", () => {
  const rows = [point("a"), point("b", 0.0002), point("c", 0.0004), point("d", 0.0006)];
  assert.deepEqual(run(rows).clusters, run([...rows].reverse()).clusters);
  const result = run([...rows, rows[0]!]);
  assert.equal(result.clusters[0]!.reportCount, 4);
  assert.equal(result.summary.excluded.duplicateIds, 1);
});

test("DBSCAN expands density-connected chains and promotes earlier noise to border points", () => {
  const rows = Array.from({ length: 8 }, (_, i) => point(String(i), i * 0.001));
  const result = clusterHotspots(rows, { now, epsMeters: 230, minLocations: 4 });
  assert.equal(result.clusters.length, 1);
  assert.equal(result.clusters[0]!.reportCount, 8);
  assert.deepEqual(result.noiseReportIds, []);
});

test("separated dense areas stay separate while an isolated location remains noise", () => {
  const rows = [0, 0.0002, 0.0004, 0.0006].flatMap((offset, i) => [
    point(`west-${i}`, offset),
    point(`east-${i}`, offset, { longitude: 123.6059 }),
  ]);
  rows.push(point("isolated", 0, { latitude: 9.915, longitude: 123.6 }));
  const result = run(rows);
  assert.equal(result.clusters.length, 2);
  assert.deepEqual(result.clusters.map((cluster) => cluster.uniqueLocationCount), [4, 4]);
  assert.deepEqual(result.noiseReportIds, ["isolated"]);
});

test("distance uses metres and rejects invalid parameters", () => {
  assert.ok(Math.abs(distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }) - 111195) < 10);
  assert.throws(() => clusterHotspots([], { epsMeters: 0 }));
  assert.throws(() => clusterHotspots([], { minLocations: 1 }));
  assert.throws(() => clusterHotspots([], { windowDays: -1 }));
  assert.equal(run([]).clusters.length, 0);
});

const response = () => {
  const result = { status: 200, body: {} as Record<string, unknown> };
  const res = {
    status(code: number) { result.status = code; return this; },
    json(body: Record<string, unknown>) { result.body = body; return this; },
  } as unknown as Response;
  return { result, res };
};
test("cluster API requires a session and an admin role", async (t) => {
  let output = response();
  await getHotspotClusters({} as Request, output.res);
  assert.equal(output.result.status, 401);
  t.mock.method(profileService, "getProfile", async () => ({ data: { role: "user" }, error: null }));
  output = response();
  await getHotspotClusters({ user: { id: "u" } } as unknown as Request, output.res);
  assert.equal(output.result.status, 403);
});
test("cluster API validates period before reading data", async (t) => {
  t.mock.method(profileService, "getProfile", async () => ({ data: { role: "admin" }, error: null }));
  const load = t.mock.method(reportService, "getAdminDashboard", async () => { throw new Error("must not query"); });
  const { result, res } = response();
  await getHotspotClusters({ user: { id: "u" }, query: { period: "forever" } } as unknown as Request, res);
  assert.equal(result.status, 400);
  assert.equal(load.mock.callCount(), 0);
});

test("cluster API serves the source snapshot alongside computed memberships", async (t) => {
  t.mock.method(profileService, "getProfile", async () => ({ data: { role: "super_admin" }, error: null }));
  t.mock.method(reportService, "getAdminDashboard", async () => ({
    data: { reports: [], summary: {} }, error: null,
  }));
  const { result, res } = response();
  await getHotspotClusters({ user: { id: "u" }, query: { period: "all" } } as unknown as Request, res);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.reports, []);
  const clustering = result.body.clustering as ReturnType<typeof clusterHotspots>;
  assert.equal(clustering.dataMode, "synthetic");
  assert.equal(clustering.parameters.windowDays, null);
  assert.deepEqual(clustering.clusters, []);
});

test("cluster API failures are explicit, never a successful empty forecast", async (t) => {
  t.mock.method(profileService, "getProfile", async () => ({ data: { role: "admin" }, error: null }));
  t.mock.method(reportService, "getAdminDashboard", async () => { throw new Error("unavailable"); });
  const { result, res } = response();
  await getHotspotClusters({ user: { id: "u" }, query: {} } as unknown as Request, res);
  assert.equal(result.status, 500);
  assert.equal(result.body.clustering, undefined);
});
