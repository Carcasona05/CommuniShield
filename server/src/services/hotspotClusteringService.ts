import { barangaysAtCoordinates, deriveBarangay, hasReportCoordinates } from "../utils/argaoLocation.js";

export type HotspotReport = {
  id: string;
  latitude?: unknown;
  longitude?: unknown;
  location?: string | null;
  barangay?: string | null;
  created_at?: string | null;
  status?: string | null;
  incident_category?: string | null;
  incident_type?: string | null;
};

type Options = {
  epsMeters?: number;
  minLocations?: number;
  windowDays?: number | null;
  category?: string;
  incidentType?: string;
  now?: number;
};

type Pin = { latitude: number; longitude: number; reports: HotspotReport[] };
const excludedStatuses = new Set(["rejected", "archived", "marked fake", "fake", "resolved"]);
const radians = (degrees: number) => degrees * Math.PI / 180;

export function distanceMeters(a: Pick<Pin, "latitude" | "longitude">, b: Pick<Pin, "latitude" | "longitude">) {
  const term = Math.sin(radians(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) *
    Math.sin(radians(b.longitude - a.longitude) / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, term)));
}

/** DBSCAN on distinct numeric coordinates. Counts are retained as descriptive
 * weights only, NEVER as DBSCAN sample weights: one repeated pin cannot be core.
 * This is descriptive clustering of synthetic reports, not a risk forecast.
 */
export function clusterHotspots(reports: HotspotReport[], options: Options = {}) {
  const epsMeters = options.epsMeters ?? 300;
  const minLocations = options.minLocations ?? 4;
  const windowDays = options.windowDays === undefined ? 30 : options.windowDays;
  const now = options.now ?? Date.now();
  if (!Number.isFinite(epsMeters) || epsMeters <= 0 || epsMeters > 5000) throw new Error("epsMeters must be between 0 and 5000.");
  if (!Number.isInteger(minLocations) || minLocations < 2 || minLocations > 100) throw new Error("minLocations must be an integer between 2 and 100.");
  if (windowDays !== null && (!Number.isFinite(windowDays) || windowDays <= 0 || windowDays > 365)) throw new Error("windowDays must be null or between 0 and 365.");
  const start = windowDays === null ? -Infinity : now - windowDays * 86400000;
  const pins = new Map<string, Pin>();
  const seenIds = new Set<string>();
  const excluded = { duplicateIds: 0, inactive: 0, date: 0, filters: 0, invalidCoordinates: 0, outsideBoundary: 0 };
  for (const report of reports) {
    if (seenIds.has(report.id)) { excluded.duplicateIds++; continue; }
    seenIds.add(report.id);
    if (excludedStatuses.has(String(report.status || "").trim().toLowerCase())) { excluded.inactive++; continue; }
    const time = Date.parse(report.created_at || "");
    if (!Number.isFinite(time) || time < start || time > now) { excluded.date++; continue; }
    if ((options.category && report.incident_category !== options.category) ||
        (options.incidentType && report.incident_type !== options.incidentType)) { excluded.filters++; continue; }
    if (!hasReportCoordinates(report)) { excluded.invalidCoordinates++; continue; }
    if (!barangaysAtCoordinates(report.latitude, report.longitude).length) { excluded.outsideBoundary++; continue; }
    const latitude = Number(report.latitude);
    const longitude = Number(report.longitude);
    // Canonicalize numeric representations ("9.8800" equals 9.88), without
    // rounding nearby but genuinely distinct locations into one point.
    const key = `${latitude},${longitude}`;
    if (!pins.has(key)) pins.set(key, { latitude, longitude, reports: [] });
    pins.get(key)!.reports.push(report);
  }
  const points = [...pins.values()].sort((a, b) => a.latitude - b.latitude || a.longitude - b.longitude);
  const labels: (number | undefined)[] = Array(points.length).fill(undefined);
  const neighbours = (index: number) => points.flatMap((point, j) => distanceMeters(points[index]!, point) <= epsMeters ? [j] : []);
  let nextLabel = 0;
  for (let i = 0; i < points.length; i++) {
    if (labels[i] !== undefined) continue;
    const nearby = neighbours(i);
    if (nearby.length < minLocations) { labels[i] = -1; continue; }
    const label = nextLabel++;
    labels[i] = label;
    const queue = [...nearby];
    const queued = new Set(queue);
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const j = queue[cursor]!;
      if (labels[j] === -1) labels[j] = label; // prior noise may be a border point
      if (labels[j] !== undefined) continue;
      labels[j] = label;
      const more = neighbours(j);
      if (more.length >= minLocations) {
        for (const k of more) if (!queued.has(k)) { queued.add(k); queue.push(k); }
      }
    }
  }
  const clusters = Array.from({ length: nextLabel }, (_, label) => {
    const members = points.filter((_, i) => labels[i] === label);
    const rows = members.flatMap((pin) => pin.reports);
    // Unweighted spatial center: repeated pins do not drag the hotspot center.
    const center = {
      latitude: members.reduce((sum, point) => sum + point.latitude, 0) / members.length,
      longitude: members.reduce((sum, point) => sum + point.longitude, 0) / members.length,
    };
    const barangays = [...new Set(rows.map((row) => deriveBarangay(row.location || "", row)).filter(Boolean))].sort();
    const dates = rows.map((row) => row.created_at!).sort((a, b) => Date.parse(a) - Date.parse(b));
    return {
      key: `cluster-${label + 1}`,
      location: barangays.join(" / ") || "Barangay not determined",
      barangays,
      center,
      radiusMeters: Math.max(...members.map((point) => distanceMeters(center, point))),
      reportIds: rows.map((row) => row.id).sort(),
      reportCount: rows.length,
      uniqueLocationCount: members.length,
      firstReportAt: dates[0],
      latestReportAt: dates.at(-1),
    };
  }).sort((a, b) => b.reportCount - a.reportCount || a.key.localeCompare(b.key));
  const noise = points.filter((_, i) => labels[i] === -1);
  const eligibleReportCount = points.reduce((sum, point) => sum + point.reports.length, 0);
  return {
    method: "DBSCAN",
    dataMode: "synthetic",
    notice: "Synthetic test data — demonstrates clustering, not real-world danger or forecast accuracy.",
    generatedAt: new Date(now).toISOString(),
    parameters: { epsMeters, minLocations, windowDays, duplicatePolicy: "distinct-location-density-report-count-weights" },
    summary: {
      eligibleReportCount,
      uniqueLocationCount: points.length,
      repeatedPinReports: eligibleReportCount - points.length,
      clusteredReportCount: clusters.reduce((sum, cluster) => sum + cluster.reportCount, 0),
      noiseLocationCount: noise.length,
      excluded,
    },
    clusters,
    noiseReportIds: noise.flatMap((point) => point.reports.map((row) => row.id)).sort(),
  };
}
