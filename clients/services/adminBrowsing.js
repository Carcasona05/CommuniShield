export const validBrowsePage = data => Array.isArray(data?.items) && Number.isFinite(data?.total) && typeof data?.hasMore === "boolean" && data?.stats && typeof data.stats === "object";
export const actorRoleValue = value => ({ Admin: "admin", "Super Admin": "super_admin", User: "user" }[value] || undefined);
export function localDateBoundary(value, end = false) {
  if (!value) return undefined;
  const date = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00"}`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}
export function recordFilters({ from, to, status, reportType, postBy }) {
  return { view: "records", sort: "status-priority-v1", ...(localDateBoundary(from) ? { from: localDateBoundary(from) } : {}),
    ...(localDateBoundary(to, true) ? { to: localDateBoundary(to, true) } : {}),
    ...(status && status !== "All" ? { status } : {}), ...(reportType && reportType !== "All" ? { kind: reportType } : {}),
    ...(actorRoleValue(postBy) ? { actorRole: actorRoleValue(postBy) } : {}) };
}
export function logDateFilters(option, now = new Date()) {
  if (option === "All Time") return {};
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (option === "Last 7 Days") start.setDate(start.getDate() - 6);
  if (option === "Last 30 Days") start.setDate(start.getDate() - 29);
  if (option === "This Month") start.setDate(1);
  const result = { from: start.toISOString() };
  if (option === "This Month") result.to = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, -1).toISOString();
  return result;
}
export const localBlotterRecord = item => ({ ...item, kind: "Blotter", reportType: "Blotter", status: "",
  title: `${item.incident_type || "Blotter report"} • ${item.location || "Location unspecified"}`,
  incidentType: item.incident_type, incidentDateTime: item.incident_datetime, complainantName: item.complainant_name,
  complainantAge: item.complainant_age, complainantContact: item.complainant_contact, actionTaken: item.action_taken,
  reportedBy: item.reported_by, blotterOfficer: item.blotter_officer, dateReported: item.date_reported, dateRecorded: item.date_recorded,
  location: item.location || "", severity: "Medium", details: item.incident_description || "", actor: item.reported_by || "Admin", actorRole: "admin" });
export const matchesRecordFilters = (record, filters) => (!filters.from || Date.parse(record.created_at) >= Date.parse(filters.from)) &&
  (!filters.to || Date.parse(record.created_at) <= Date.parse(filters.to)) && (!filters.status || record.status === filters.status) &&
  (!filters.kind || record.kind === filters.kind) && (!filters.actorRole || record.actorRole === filters.actorRole);
const fraction = value => String(value).match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/)?.[1]?.padEnd(9, "0") || "000000000";
const statusRank = record => record.kind === "Incident"
  ? ({ "Pending Review": 0, "Under Verification": 1, Verified: 2, Resolved: 3, Rejected: 4, "Marked Fake": 5 }[record.status] ?? 6) : 7;
const severityRank = record => record.kind === "Incident"
  ? ({ Critical: 0, High: 1, Medium: 2, Low: 3 }[record.severity] ?? 4) : 4;
export function compareRecords(a, b) {
  const priority = statusRank(a) - statusRank(b) || severityRank(a) - severityRank(b);
  if (priority) return priority;
  const direction = a.kind === "Incident" ? 1 : -1;
  return direction * ((Date.parse(a.created_at) - Date.parse(b.created_at) || 0) ||
    fraction(a.created_at).localeCompare(fraction(b.created_at))) ||
    String(a.kind).localeCompare(String(b.kind)) || String(b.id).localeCompare(String(a.id));
}
