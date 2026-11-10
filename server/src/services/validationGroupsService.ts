import { reportService } from "./reportService.js";

type RawReport = NonNullable<Awaited<ReturnType<typeof reportService.getAdminDashboard>>["data"]>["reports"][number];
export function validationReport(report: RawReport, timeZone: string, details = false) {
  const date = new Date(report.created_at || "");
  return {
    id: report.id, title: `${report.incident_type || "Incident"} in ${report.barangay || "Argao"}`,
    category: report.incident_category || "", type: report.incident_type || "", location: report.location || "", barangay: report.barangay || "",
    details: details ? report.details : "", status: report.status || "Pending Review", aiScore: report.ai_score ?? 0, severity: report.severity || "Medium",
    sentiment: report.sentiment, sentiment_status: report.sentiment_status, hasCredibilityReview: Boolean(report.credibility_review),
    credibilityReview: details ? report.credibility_review : "", submittedBy: report.reporter_name || report.poster_name || "Anonymous User",
    submittedRole: report.source === "Admin" ? "Admin" : "User", createdAt: report.created_at, is_verified: report.is_verified,
    submittedAt: Number.isNaN(date.getTime()) ? "" : `${date.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric", timeZone })} • ${date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone })}`,
  };
}
type ValidationReport = ReturnType<typeof validationReport>;
type Group = {
  id: string; title: string; category: string; type: string; barangay: string; location: string; status: string;
  aiScore: number; severity: string; sentiment: string | null; submittedAt: string; reports: ValidationReport[];
  reportCount: number; userCount: number; adminCount: number; highestAiScore: number; statusSummary: Record<string, number>;
};

// Preserve the existing compilation rule: same category/type/barangay/status,
// with calendar dates at most one day from the first (newest) group member.
// Pagination happens AFTER compilation, so bulk actions never see half a group.
export function compileValidationGroups(reports: ValidationReport[]) {
  const groups = new Map<string, Group & { anchor: number }>();
  const byBase = new Map<string, (Group & { anchor: number })[]>();
  const rank: Record<string, number> = { Low: 1, Medium: 2, High: 3, Critical: 4 };
  for (const report of reports) {
    const base = `${report.category}-${report.type}-${report.barangay}-${report.status}`.toLowerCase();
    const day = Date.parse(report.submittedAt.split("•")[0]!.trim());
    const existing = byBase.get(base) || [];
    let group = existing.find(item => Number.isFinite(day) && Number.isFinite(item.anchor) && Math.abs(day - item.anchor) <= 86400000);
    if (!group) {
      const id = existing.length ? `${base}-${existing.length}` : base;
      group = { id, title: `${report.type} in ${report.barangay}`, category: report.category, type: report.type, barangay: report.barangay,
        location: report.location, status: report.status, aiScore: report.aiScore, severity: report.severity, sentiment: report.sentiment,
        submittedAt: report.submittedAt, reports: [], anchor: day, reportCount: 0, userCount: 0, adminCount: 0, highestAiScore: 0, statusSummary: {} };
      groups.set(id, group); existing.push(group); byBase.set(base, existing);
    }
    group.reports.push(report);
    group.reportCount++;
    group.userCount += report.submittedRole === "User" ? 1 : 0;
    group.adminCount += report.submittedRole === "Admin" ? 1 : 0;
    group.aiScore = Math.max(group.aiScore, report.aiScore);
    group.highestAiScore = group.aiScore;
    if ((rank[report.severity] || 0) > (rank[group.severity] || 0)) group.severity = report.severity;
    group.statusSummary[report.status] = (group.statusSummary[report.status] || 0) + 1;
  }
  return [...groups.values()].map(item => {
    const group: Partial<typeof item> = { ...item };
    delete group.anchor;
    return group as Group;
  });
}

export type ValidationFilters = { status?: string; category?: string; barangay?: string; incidentType?: string; from?: string; to?: string;
  view?: string; timeZone: string; page: number; pageSize: number; exportAll?: boolean; focusReport?: string };
export async function loadValidationGroups(filters: ValidationFilters) {
  const { data, error } = await reportService.getAdminDashboard({
    ...(filters.status ? { status: filters.status } : {}), ...(filters.from ? { from: filters.from } : {}), ...(filters.to ? { to: filters.to } : {}),
    ...(filters.exportAll ? {} : { mode: "list" as const }), includeComments: false, includeImages: false, allPages: true,
  });
  if (error || !data) throw new Error(error || "Validation data unavailable");
  const selected = data.reports.filter(report => report.status !== "Archived" && (!filters.category || report.incident_category.toLowerCase().includes(filters.category.toLowerCase())) &&
    (!filters.barangay || report.barangay?.toLowerCase() === filters.barangay.toLowerCase()));
  const reports = selected.map(report => validationReport(report, filters.timeZone, Boolean(filters.exportAll)));
  const groups = compileValidationGroups(reports);
  const filtered = groups.filter(group => (!filters.incidentType || group.type === filters.incidentType) &&
    (filters.view !== "clustered" || group.reportCount >= 2) &&
    (filters.view !== "credibility" || group.reports.some(report => report.aiScore > 0 || report.hasCredibilityReview)));
  const page = Math.min(filters.page, Math.max(1, Math.ceil(filtered.length / filters.pageSize)));
  return { groups: filters.exportAll ? filtered : filtered.slice((page - 1) * filters.pageSize, page * filters.pageSize),
    page, pageSize: filters.pageSize, totalGroups: filtered.length, hasMore: page * filters.pageSize < filtered.length,
    focusedGroup: filters.focusReport ? groups.find(group => group.reports.some(report => report.id === filters.focusReport)) || null : null,
    stats: { totalReports: reports.length, compiledIncidents: groups.filter(group => group.reportCount > 1).length,
      pending: reports.filter(report => report.status === "Pending Review").length, verifying: reports.filter(report => report.status === "Under Verification").length,
      resolved: reports.filter(report => report.status === "Resolved").length, rejected: reports.filter(report => report.status === "Rejected").length } };
}
