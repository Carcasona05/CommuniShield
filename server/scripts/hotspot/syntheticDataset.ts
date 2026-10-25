import { createHash } from "node:crypto";
import boundaries from "../../src/data/argaoBarangayBoundaries.json" with { type: "json" };
import { barangaysAtCoordinates, deriveBarangay } from "../../src/utils/argaoLocation.js";
import type { HotspotReport } from "../../src/services/hotspotClusteringService.js";

export const GENERATOR_VERSION = "synthetic-hotspots-v1";
export const DEFAULT_SEED = 20261021;
export const DEFAULT_AS_OF = "2026-10-21T12:00:00.000Z";
export const boundarySha256 = createHash("sha256").update(JSON.stringify(boundaries)).digest("hex");
export const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export type Split = "tuning" | "holdout";
export type Coordinate = { latitude: number; longitude: number };
export type SyntheticReport = HotspotReport & {
  is_synthetic: true;
  severity: "Low" | "Medium" | "High";
  details: string;
};
export type Scenario = { id: string; split: Split; reports: SyntheticReport[] };
export type TruthLocation = {
  id: string;
  coordinates: Coordinate;
  reportIds: string[];
  cluster: string | null; // null means isolated/noise; NOT one shared noise cluster
};
export type ScenarioTruth = {
  scenarioId: string;
  split: Split;
  description: string;
  locations: TruthLocation[];
  excluded: { reportId: string; reason: string }[];
  expectedClusterCount: number;
};
export type Dataset = {
  metadata: {
    schemaVersion: 1;
    generatorVersion: string;
    seed: number;
    asOf: string;
    dataMode: "synthetic";
    boundarySha256: string;
    windowDays: 30;
    sampling: string;
    limitation: string;
  };
  scenarios: Scenario[];
};
export type GroundTruth = { schemaVersion: 1; datasetSha256: string; scenarios: ScenarioTruth[] };

// Mulberry32: fixed PRNG and per-scenario streams prevent dates, execution order,
// or adding another scenario from changing an existing scenario's random stream.
function randomStream(seed: number, label: string) {
  let state = seed >>> 0;
  for (const char of label) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let n = state;
    n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

/** Spherical offset, metres and bearing; no degree-as-metre approximation. */
export function offsetPoint(origin: Coordinate, metres: number, bearing: number): Coordinate {
  const lat = origin.latitude * Math.PI / 180;
  const lng = origin.longitude * Math.PI / 180;
  const arc = metres / 6371008.8;
  const nextLat = Math.asin(Math.sin(lat) * Math.cos(arc) + Math.cos(lat) * Math.sin(arc) * Math.cos(bearing));
  const nextLng = lng + Math.atan2(Math.sin(bearing) * Math.sin(arc) * Math.cos(lat), Math.cos(arc) - Math.sin(lat) * Math.sin(nextLat));
  return { latitude: Number((nextLat * 180 / Math.PI).toFixed(9)), longitude: Number((nextLng * 180 / Math.PI).toFixed(9)) };
}

// Generator geometry is independent of DBSCAN; expected labels come from the
// scenario design, never from clusterHotspots output or its parameter choices.
function separation(a: Coordinate, b: Coordinate) {
  const rad = Math.PI / 180;
  const term = Math.sin((b.latitude - a.latitude) * rad / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin((b.longitude - a.longitude) * rad / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.sqrt(Math.min(1, term)));
}
const allBounds = boundaries.features.map((feature) => feature.bounds);
const west = Math.min(...allBounds.map((bounds) => bounds[0]!));
const south = Math.min(...allBounds.map((bounds) => bounds[1]!));
const east = Math.max(...allBounds.map((bounds) => bounds[2]!));
const north = Math.max(...allBounds.map((bounds) => bounds[3]!));
const inside = (point: Coordinate) => barangaysAtCoordinates(point.latitude, point.longitude).length > 0;

const descriptions = {
  "dense-patch": "One planted dense area plus isolated reports. Expect one cluster.",
  "scattered": "Only geographically separated reports. Expect no clusters.",
  "repeated-pin": "Forty reports share one pin, with isolated points elsewhere. Expect no clusters.",
  "two-patches": "Two widely separated dense areas plus isolated reports. Expect two clusters.",
  "nearby-patches": "Two distinct dense areas about 650 m apart. Large neighbourhoods may incorrectly merge them.",
  "elongated-patch": "One elongated area of distinct locations; compact-radius assumptions can split it.",
  "exclusion-guards": "One valid dense area plus old, future, undated, inactive, invalid and outside-boundary decoy reports. Decoys must never contribute.",
};

export function generateSyntheticDataset(seed = DEFAULT_SEED, asOf = DEFAULT_AS_OF): { dataset: Dataset; truth: GroundTruth } {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) throw new Error("Seed must be a uint32 integer.");
  const now = Date.parse(asOf);
  if (!Number.isFinite(now)) throw new Error("asOf must be a valid timestamp.");
  const scenarios: Scenario[] = [];
  const truths: ScenarioTruth[] = [];
  for (const split of ["tuning", "holdout"] as const) {
    for (const [name, description] of Object.entries(descriptions)) {
      const id = `${split}-${name}`;
      const random = randomStream(seed, id);
      const reports: SyntheticReport[] = [];
      const locations: TruthLocation[] = [];
      const excluded: ScenarioTruth["excluded"] = [];
      const reserved: Coordinate[] = [];
      const integer = (low: number, high: number) => low + Math.floor(random() * (high - low + 1));
      const sample = (accept: (point: Coordinate) => boolean): Coordinate => {
        for (let attempt = 0; attempt < 100000; attempt++) {
          const point = { latitude: south + random() * (north - south), longitude: west + random() * (east - west) };
          if (inside(point) && accept(point)) return point;
        }
        throw new Error(`Cannot sample scenario ${id}; check geometry constraints.`);
      };
      const reserve = (radius = 250) => {
        const point = sample((candidate) => reserved.every((previous) => separation(candidate, previous) > 2500) &&
          Array.from({ length: 16 }, (_, i) => offsetPoint(candidate, radius, i * Math.PI / 8)).every(inside));
        reserved.push(point);
        return point;
      };
      const makeReport = (point: Coordinate, extra: Partial<SyntheticReport> = {}): SyntheticReport => {
        const barangay = deriveBarangay("", point);
        return {
          id: `${id}-report-${String(reports.length + 1).padStart(4, "0")}`,
          ...point,
          barangay,
          location: barangay ? `${barangay}, Argao (synthetic)` : "Synthetic coordinate-quality test",
          created_at: new Date(now - integer(1, 20 * 24) * 3600000).toISOString(),
          status: random() < 0.25 ? "Under Verification" : "Pending Review",
          incident_category: "Public Safety Incidents",
          incident_type: ["Public Disturbance", "Theft", "General Safety Concern"][integer(0, 2)]!,
          severity: ["Low", "Medium", "High"][integer(0, 2)]! as SyntheticReport["severity"],
          details: "FICTIONAL TEST RECORD — generated for spatial clustering evaluation, not an actual incident.",
          is_synthetic: true,
          ...extra,
        };
      };
      const addLocation = (point: Coordinate, cluster: string | null, copies = 1) => {
        if (!inside(point)) throw new Error(`Generated eligible point outside Argao in ${id}.`);
        const reportIds: string[] = [];
        for (let i = 0; i < copies; i++) {
          const report = makeReport(point);
          reports.push(report);
          reportIds.push(report.id);
        }
        locations.push({ id: `${id}-location-${locations.length + 1}`, coordinates: point, reportIds, cluster });
      };
      const addPatch = (cluster: string, center = reserve(), radius = integer(75, 150), count = integer(10, 16)) => {
        const seen = new Set<string>();
        for (let i = 0; i < count; i++) {
          let point: Coordinate;
          let key: string;
          let attempts = 0;
          do {
            if (++attempts > 10000) throw new Error(`Cannot sample patch ${id}.`);
            // sqrt(U) provides uniform area within the disc, not center-biased radius.
            point = offsetPoint(center, Math.sqrt(random()) * radius, random() * 2 * Math.PI);
            key = `${point.latitude},${point.longitude}`;
          } while (!inside(point) || seen.has(key));
          seen.add(key);
          addLocation(point, cluster);
        }
      };
      const addNoise = (count: number) => {
        for (let i = 0; i < count; i++) addLocation(reserve(0), null);
      };
      const addExcluded = (point: Coordinate, reason: string, extra: Partial<SyntheticReport>) => {
        const report = makeReport(point, extra);
        reports.push(report);
        excluded.push({ reportId: report.id, reason });
      };
      if (name === "dense-patch") { addPatch("A"); addNoise(8); }
      if (name === "scattered") addNoise(18);
      if (name === "repeated-pin") { addLocation(reserve(), null, 40); addNoise(8); }
      if (name === "two-patches") { addPatch("A"); addPatch("B"); addNoise(6); }
      if (name === "nearby-patches") {
        const bearing = random() * 2 * Math.PI;
        const first = sample((point) => Array.from({ length: 16 }, (_, i) => offsetPoint(point, 850, i * Math.PI / 8)).every(inside));
        const second = offsetPoint(first, 650, bearing);
        reserved.push(first, second);
        addPatch("A", first, 110, 16);
        addPatch("B", second, 110, 16);
        addNoise(4);
      }
      if (name === "elongated-patch") {
        const center = reserve(700);
        const bearing = random() * 2 * Math.PI;
        for (let i = 0; i < 15; i++) {
          const along = offsetPoint(center, i * 70 - 490, bearing);
          addLocation(offsetPoint(along, random() * 12, bearing + Math.PI / 2), "A");
        }
        addNoise(5);
      }
      if (name === "exclusion-guards") {
        addPatch("A"); addNoise(4);
        const decoys: { reason: string; extra: Partial<SyntheticReport> }[] = [
          { reason: "old", extra: { created_at: new Date(now - 60 * 86400000).toISOString() } },
          { reason: "future", extra: { created_at: new Date(now + 86400000).toISOString() } },
          { reason: "undated", extra: { created_at: null } },
          ...["Archived", "Rejected", "Marked Fake", "Resolved"].map((status) => ({ reason: status, extra: { status } })),
        ];
        for (const { reason, extra } of decoys) {
          const center = reserve();
          for (let i = 0; i < 6; i++) addExcluded(offsetPoint(center, 30 + i * 5, i), reason, extra);
        }
        const center = reserve();
        for (const latitude of [null, "", "invalid", 95]) addExcluded(center, "invalidCoordinates", { latitude });
        for (let i = 0; i < 6; i++) addExcluded({ latitude: 14.6 + i * 0.0001, longitude: 120.98 }, "outsideBoundary", {});
      }
      const expectedClusterCount = new Set(locations.map((location) => location.cluster).filter((cluster) => cluster !== null)).size;
      // Shuffle input to avoid silently relying on report insertion order.
      for (let i = reports.length - 1; i > 0; i--) {
        const j = integer(0, i);
        [reports[i], reports[j]] = [reports[j]!, reports[i]!];
      }
      scenarios.push({ id, split, reports });
      truths.push({ scenarioId: id, split, description, locations, excluded, expectedClusterCount });
    }
  }
  const dataset: Dataset = {
    metadata: {
      schemaVersion: 1, generatorVersion: GENERATOR_VERSION, seed, asOf: new Date(now).toISOString(),
      dataMode: "synthetic", boundarySha256, windowDays: 30,
      sampling: "Seeded rejection sampling inside Argao polygons; planted discs/chains, separated isolated locations, and deliberate invalid/excluded decoys. Not population- or street-weighted.",
      limitation: "Fictional test scenarios only. No police records, population-risk estimates, future-risk forecasts or evidence of operational effectiveness.",
    },
    scenarios,
  };
  return { dataset, truth: { schemaVersion: 1, datasetSha256: fingerprint(dataset), scenarios: truths } };
}
