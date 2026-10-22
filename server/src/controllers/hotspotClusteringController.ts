import type { Request, Response } from "express";
import { profileService } from "../services/authService.js";
import { reportService } from "../services/reportService.js";
import { clusterHotspots } from "../services/hotspotClusteringService.js";
import { summarizeHotspotEvidence } from "../services/hotspotSentimentService.js";

type AuthRequest = Request & { user?: { id: string } };

export async function getHotspotClusters(req: AuthRequest, res: Response) {
  if (!req.user?.id) return res.status(401).json({ error: "Unauthorized" });
  const { data: profile } = await profileService.getProfile(req.user.id);
  if (!profile || !["admin", "super_admin"].includes(profile.role)) return res.status(403).json({ error: "Admin access only" });
  const period = typeof req.query.period === "string" ? req.query.period : "30d";
  const windows: Record<string, number | null> = { all: null, "24h": 1, "7d": 7, "30d": 30 };
  if (!Object.hasOwn(windows, period)) return res.status(400).json({ error: "Invalid period." });
  const category = typeof req.query.category === "string" ? req.query.category : "";
  const incidentType = typeof req.query.incidentType === "string" ? req.query.incidentType : "";
  try {
    const { data, error } = await reportService.getAdminDashboard();
    if (error || !data) return res.status(500).json({ error: error || "No report data" });
    const now = Date.now();
    const windowDays = windows[period]!;
    const spatial = clusterHotspots(data.reports, { windowDays, category, incidentType, now });
    const byId = new Map(data.reports.map((report) => [report.id, report]));
    const clustering = { ...spatial, clusters: spatial.clusters.map((cluster) => ({
      ...cluster,
      evidence: summarizeHotspotEvidence(cluster.reportIds.map((id) => byId.get(id)!).filter(Boolean), { now, windowDays }),
    })) };
    // Keep the source reports for map/details/filter options in the same
    // response snapshot as memberships. Never persist into dashboard cache.
    return res.json({ reports: data.reports, clustering });
  } catch {
    return res.status(500).json({ error: "Unable to compute hotspot clusters." });
  }
}
