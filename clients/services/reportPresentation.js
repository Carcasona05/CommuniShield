export function normalizeReportStatus(value, verified = false) {
  const current = String(value || "").trim().toLowerCase();
  if (current.includes("fake")) return "Marked Fake";
  if (current.includes("under")) return "Under Verification";
  if (current.includes("resolved")) return "Resolved";
  if (current.includes("reject")) return "Rejected";
  if (current.includes("archive")) return "Archived";
  if (current === "verified") return "Resolved";
  if (current.includes("pending")) return "Pending Review";
  return verified ? "Resolved" : "Pending Review";
}

// Feed cards use camelCase while GET /reports/:id returns database field names.
export function mergeReportDetails(previous, report) {
  if (!report || String(report.id) !== String(previous?.id)) return previous;
  return {
    ...previous, ...report,
    userName: report.poster_name ?? previous.userName,
    datePosted: report.created_at ?? previous.datePosted,
    incidentCategory: report.incident_category ?? previous.incidentCategory,
    incidentType: report.incident_type ?? previous.incidentType,
    verified: report.is_verified ?? previous.verified,
    isLiked: report.is_liked ?? previous.isLiked,
    status: normalizeReportStatus(report.status ?? previous.status, report.is_verified ?? previous.verified),
  };
}
