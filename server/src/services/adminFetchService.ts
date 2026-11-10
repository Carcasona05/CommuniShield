import { supabaseAdmin } from "../config/supabaseAdmin.js";
import { reportService } from "./reportService.js";

// Counts run in the database, independently of the twelve-row activity feed.
// A failed count is never replaced with a plausible but incorrect zero.
export async function loadAdminOverview(options: { superAdmin: boolean; dayStart: string; dayEnd: string }) {
  const countReports = () => supabaseAdmin.from("reports").select("id", { count: "exact", head: true }).neq("status", "Archived");
  const [recent, total, pending, verified, rejected, hotspots] = await Promise.all([
    reportService.getAdminDashboard({ limit: 12, mode: "list" }),
    countReports(), countReports().eq("status", "Pending Review"),
    countReports().or("is_verified.eq.true,status.eq.Resolved"), countReports().eq("status", "Rejected"),
    supabaseAdmin.from("reports").select("id, report_credibility_analysis!inner(severity)", { count: "exact", head: true })
      .not("status", "in", "(Rejected,Archived)").in("report_credibility_analysis.severity", ["High", "Critical"]),
  ]);
  if (recent.error || !recent.data) throw new Error(recent.error || "Recent reports unavailable");
  for (const result of [total, pending, verified, rejected, hotspots]) {
    if (result.error || result.count == null) throw new Error(result.error?.message || "Dashboard counts unavailable");
  }
  const dashboard = {
    summary: { total: total.count!, pending: pending.count!, verified: verified.count!, rejected: rejected.count!, hotspots: hotspots.count! },
    reports: recent.data.reports.map(({ id, incident_type, location, ai_score, sentiment, sentiment_status, status, is_verified, source, created_at }) =>
      ({ id, incident_type, location, ai_score, sentiment, sentiment_status, status, is_verified, source, created_at })),
  };
  if (!options.superAdmin) return dashboard;
  const profileCount = () => supabaseAdmin.from("profiles").select("id", { count: "exact", head: true });
  const [activeAdmins, admins, superAdmins, disabled, logsToday, logs] = await Promise.all([
    profileCount().eq("role", "admin").eq("status", "Active"), profileCount().eq("role", "admin"),
    profileCount().eq("role", "super_admin"), profileCount().eq("status", "Disabled").in("role", ["admin", "super_admin"]),
    supabaseAdmin.from("audit_logs").select("id", { count: "exact", head: true }).gte("created_at", options.dayStart).lt("created_at", options.dayEnd),
    reportService.listAuditLogs(undefined, { limit: 5 }),
  ]);
  for (const result of [activeAdmins, admins, superAdmins, disabled, logsToday]) {
    if (result.error || result.count == null) throw new Error(result.error?.message || "Management counts unavailable");
  }
  if (logs.error) throw new Error(logs.error);
  return { ...dashboard, management: { activeAdmins: activeAdmins.count!, admins: admins.count!, superAdmins: superAdmins.count!,
    disabled: disabled.count!, logsToday: logsToday.count! }, logs: logs.data || [] };
}

export function mapReportPayload(report: NonNullable<Awaited<ReturnType<typeof reportService.getAdminDashboard>>["data"]>["reports"][number]) {
  const { id, latitude, longitude, location, barangay, created_at, status, is_verified, incident_type, incident_category, ai_score, severity } = report;
  return { id, latitude, longitude, location, barangay, created_at, status, is_verified, incident_type, incident_category, ai_score, severity };
}
