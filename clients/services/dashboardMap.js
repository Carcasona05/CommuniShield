import { createMapDateFilter } from "./mapDateFilter.js";
export { MAP_DATE_PERIODS as DASHBOARD_MAP_PERIODS } from "./mapDateFilter.js";

// Argao's calendar day is always UTC+8, independent of the viewer's timezone.
export function filterDashboardMapReports(reports, severity = "All", period = "All dates", now = new Date()) {
  const matchesDate = createMapDateFilter(period, now);

  return reports.filter(report => {
    const status = String(report.status || "").trim().toLowerCase();
    if (["rejected", "archived", "marked fake", "fake"].includes(status)) return false;
    // Resolved reports also belong to the app's existing verified-report group.
    if (!(report.is_verified === true || status === "verified" || status === "resolved")) return false;
    if (report.latitude == null || report.longitude == null ||
      String(report.latitude).trim() === "" || String(report.longitude).trim() === "" ||
      !Number.isFinite(Number(report.latitude)) || !Number.isFinite(Number(report.longitude))) return false;
    if (severity !== "All" && (report.severity || "Medium").toLowerCase() !== severity.toLowerCase()) return false;
    return matchesDate(report.created_at);
  });
}
