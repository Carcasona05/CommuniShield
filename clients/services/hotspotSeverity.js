export const DEFAULT_HOTSPOT_SEVERITY = "High & Critical";
export const HOTSPOT_SEVERITY_OPTIONS = [
  { label: "High & Critical", value: DEFAULT_HOTSPOT_SEVERITY },
  { label: "All severities", value: "All" },
  { label: "Critical", value: "Critical" },
  { label: "High", value: "High" },
  { label: "Medium", value: "Medium" },
  { label: "Low", value: "Low" },
  { label: "Not rated", value: "Unknown" },
];

export function hotspotReportSeverity(report) {
  if (report?.ai_score == null || typeof report.ai_score === "string" && !report.ai_score.trim() || !Number.isFinite(Number(report.ai_score))) return "Unknown";
  const value = String(report.severity || "").trim().toLowerCase();
  if (value === "moderate") return "Medium";
  return ["Critical", "High", "Medium", "Low"].find(level => level.toLowerCase() === value) || "Unknown";
}

export function matchesHotspotSeverity(report, filter) {
  if (filter === "All") return true;
  const severity = hotspotReportSeverity(report);
  return filter === DEFAULT_HOTSPOT_SEVERITY ? severity === "High" || severity === "Critical" : severity === filter;
}
