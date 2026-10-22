import type { Request, Response } from "express";
import { profileService } from "../services/authService.js";
import { reportService } from "../services/reportService.js";
import { riskOutlookHistory } from "../services/riskOutlookHistory.js";
import { buildRiskOutlook } from "../services/riskOutlookService.js";
import { clusterHotspots } from "../services/hotspotClusteringService.js";
import { summarizeHotspotEvidence } from "../services/hotspotSentimentService.js";
import { canonicalBarangay, deriveBarangay, hasReportCoordinates } from "../utils/argaoLocation.js";

type AuthRequest = Request & { user?: { id: string } };
export async function getRiskOutlook(req: AuthRequest, res: Response) {
  if (!req.user?.id) return res.status(401).json({ error: "Unauthorized" });
  const { data: profile } = await profileService.getProfile(req.user.id);
  if (!profile || !["admin", "super_admin"].includes(profile.role)) return res.status(403).json({ error: "Admin access only" });
  if (req.query.barangay !== undefined && typeof req.query.barangay !== "string") return res.status(400).json({ error: "Invalid barangay." });
  const rawBarangay = typeof req.query.barangay === "string" ? req.query.barangay.trim() : "";
  const barangay = canonicalBarangay(rawBarangay);
  if (rawBarangay && !barangay) return res.status(400).json({ error: "Invalid barangay." });
  try {
    const now = Date.now();
    const [dashboard, history] = await Promise.all([
      reportService.getAdminDashboard(),
      riskOutlookHistory.load(now).catch(() => ({ data: null, error: "History unavailable" })),
    ]);
    if (dashboard.error || !dashboard.data) return res.status(500).json({ error: "Current indicators unavailable" });
    const reports = dashboard.data.reports.filter((report) => {
      const time = Date.parse(report.created_at || "");
      return ["pending review", "under verification"].includes(report.status.toLowerCase()) &&
        time >= now - 30 * 86400000 && time <= now && hasReportCoordinates(report) && Boolean(deriveBarangay(report.location, report));
    }).map((report) => ({ ...report, severity: report.ai_score != null && Number.isFinite(Number(report.ai_score)) ? report.severity : "Unknown" }));
    const selected = reports.filter((report) => !barangay || deriveBarangay(report.location, report) === barangay);
    const selectedIds = new Set(selected.map((report) => report.id));
    // Same spatial engine/parameters as Hotspot Detection; selection does not
    // rerun DBSCAN with a different artificial boundary or sentiment weighting.
    const spatial = clusterHotspots(reports, { now });
    const clusters = spatial.clusters.filter((cluster) => cluster.reportIds.some((id) => selectedIds.has(id)));
    const evidence = summarizeHotspotEvidence(selected, { now, windowDays: 30 });
    const severity: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0, Unknown: 0 };
    for (const report of selected) {
      const name = String(report.severity || "").toLowerCase();
      const level = name === "moderate" ? "Medium" : ["Critical", "High", "Medium", "Low"].find((value) => value.toLowerCase() === name) || "Unknown";
      severity[level]!++;
    }
    const forecast = history.error || !history.data ? {
      status: "unavailable", reasons: ["Complete forecast history could not be loaded; no estimate is shown."], dataMode: "synthetic",
    } : buildRiskOutlook(history.data, { now, ...(barangay ? { barangay } : {}) });
    return res.json({ asOf: new Date(now).toISOString(), dataMode: "synthetic", scope: barangay || "All Barangays", reports,
      current: { windowDays: 30, activeReportCount: selected.length, spatialHotspotCount: clusters.length, severity, evidence, clusters,
        snapshotMayBeLimited: dashboard.data.reports.length >= 1000,
        note: "Current active reports and intersecting DBSCAN clusters, not forecast danger. Map and barangay counts are descriptive." },
      forecast });
  } catch {
    return res.status(500).json({ error: "Unable to compute risk outlook" });
  }
}
