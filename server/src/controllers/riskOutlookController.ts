import type { Request, Response } from "express";
import { profileService } from "../services/authService.js";
import { reportService } from "../services/reportService.js";
import { riskOutlookHistory } from "../services/riskOutlookHistory.js";
import { buildRiskOutlook } from "../services/riskOutlookService.js";
import { clusterHotspots } from "../services/hotspotClusteringService.js";
import { summarizeHotspotEvidence } from "../services/hotspotSentimentService.js";
import { ARGAO_BARANGAY_NAMES, canonicalBarangay, deriveBarangay, hasReportCoordinates } from "../utils/argaoLocation.js";
import { mapReportPayload } from "../services/adminFetchService.js";

type AuthRequest = Request & { user?: { id: string } };
export async function getRiskOutlook(req: AuthRequest, res: Response) {
  if (!req.user?.id) return res.status(401).json({ error: "Unauthorized" });
  const { data: profile } = await profileService.getProfile(req.user.id);
  if (!profile || !["admin", "super_admin"].includes(profile.role)) return res.status(403).json({ error: "Admin access only" });
  if (req.query.barangay !== undefined && typeof req.query.barangay !== "string") return res.status(400).json({ error: "Invalid barangay." });
  const rawBarangay = typeof req.query.barangay === "string" ? req.query.barangay.trim() : "";
  const barangay = canonicalBarangay(rawBarangay);
  if (rawBarangay && !barangay) return res.status(400).json({ error: "Invalid barangay." });
  if (req.query.view !== undefined && req.query.view !== "current") return res.status(400).json({ error: "Invalid outlook view." });
  const currentOnly = req.query.view === "current";
  try {
    const now = Date.now();
    const [dashboard, history] = await Promise.all([
      // Filter before loading relations. The current map never needs old,
      // inactive or unmapped reports, nor image attachments.
      reportService.getAdminDashboard({
        statuses: ["Pending Review", "Under Verification"],
        from: new Date(now - 30 * 86400000).toISOString(),
        to: new Date(now).toISOString(),
        mappedOnly: true,
        includeImages: false,
        mode: "evidence",
        allPages: true,
      }),
      currentOnly ? Promise.resolve({ data: null, error: null })
        : riskOutlookHistory.load(now).catch(() => ({ data: null, error: "History unavailable" })),
    ]);
    if (dashboard.error || !dashboard.data) return res.status(500).json({ error: "Current indicators unavailable" });
    const reports = dashboard.data.reports.flatMap((report) => {
      const time = Date.parse(report.created_at || "");
      if (!["pending review", "under verification"].includes(report.status.toLowerCase()) ||
        time < now - 30 * 86400000 || time > now || !Number.isFinite(time) || !hasReportCoordinates(report)) return [];
      const name = deriveBarangay(report.location, report);
      return name ? [{ ...report, barangay: name,
        severity: report.ai_score != null && Number.isFinite(Number(report.ai_score)) ? report.severity : "Unknown" }] : [];
    });
    const grouped = new Map(ARGAO_BARANGAY_NAMES.map(name => [name, reports.filter(report => report.barangay === name)]));
    // Same spatial engine/parameters as Hotspot Detection; selection does not
    // rerun DBSCAN with a different artificial boundary or sentiment weighting.
    const spatial = clusterHotspots(reports, { now });
    const summarize = (selected: typeof reports) => {
      const selectedIds = new Set(selected.map(report => report.id));
      const clusters = spatial.clusters.filter(cluster => cluster.reportIds.some(id => selectedIds.has(id)));
      const evidence = summarizeHotspotEvidence(selected, { now, windowDays: 30 });
      const severity: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0, Unknown: 0 };
      for (const report of selected) {
        const name = String(report.severity || "").toLowerCase();
        const level = name === "moderate" ? "Medium" : ["Critical", "High", "Medium", "Low"].find(value => value.toLowerCase() === name) || "Unknown";
        severity[level]!++;
      }
      return { windowDays: 30, activeReportCount: selected.length, spatialHotspotCount: clusters.length, severity, evidence, clusters,
        snapshotMayBeLimited: false,
        note: "Current active reports and intersecting DBSCAN clusters, not forecast danger. Map and barangay counts are descriptive." };
    };
    // One snapshot includes every barangay, so changing the UI filter does not
    // reload the dashboard/history or rerun DBSCAN.
    const currentByBarangay = Object.fromEntries([...grouped].map(([name, selected]) => [name, summarize(selected)]));
    const forecast = currentOnly ? { status: "not_requested" } : history.error || !history.data ? {
      status: "unavailable", reasons: ["Complete forecast history could not be loaded; no estimate is shown."], dataMode: "synthetic",
    } : buildRiskOutlook(history.data, { now, ...(barangay ? { barangay } : {}) });
    return res.json({ asOf: new Date(now).toISOString(), dataMode: "synthetic", scope: barangay || "All Barangays", reports: reports.map(mapReportPayload),
      current: barangay ? currentByBarangay[barangay] : summarize(reports), currentByBarangay,
      forecast });
  } catch {
    return res.status(500).json({ error: "Unable to compute risk outlook" });
  }
}
