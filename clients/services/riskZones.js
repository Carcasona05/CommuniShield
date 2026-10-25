import { normalizeSeverity } from "./safetyTips.js";

export const RISK_ZONE_LIMIT = 5;
const severityRank = { Unknown: 0, Low: 1, Medium: 2, High: 3, Critical: 4 };

export const isActiveRiskReport = (report) => !["rejected", "marked fake", "fake", "archived", "resolved"].includes(
  String(report?.status || "").trim().toLowerCase()
);

export function buildRiskZones(reports, limit = RISK_ZONE_LIMIT) {
  const grouped = new Map();
  for (const report of reports.filter(isActiveRiskReport)) {
    const location = String(report.barangay || report.barangay_name || String(report.location || "").split(",")[0] || "Unspecified location").trim() || "Unspecified location";
    const key = location.toLowerCase();
    const zone = grouped.get(key) || { location, count: 0, severity: "Unknown" };
    zone.count++;
    const severity = normalizeSeverity(report.severity);
    if (severityRank[severity] > severityRank[zone.severity]) zone.severity = severity;
    grouped.set(key, zone);
  }
  // Preserve report-count ranking. Use severity only to describe each zone,
  // not to present incident severity as a calibrated forecast probability.
  return [...grouped.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}
