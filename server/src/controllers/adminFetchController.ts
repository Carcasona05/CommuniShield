import type { Request, Response } from "express";
import { profileService } from "../services/authService.js";
import { reportService } from "../services/reportService.js";
import { loadAdminOverview, mapReportPayload } from "../services/adminFetchService.js";
import { loadValidationGroups } from "../services/validationGroupsService.js";
import { decodeBrowseCursor, loadAdminBrowsePage } from "../services/adminBrowseService.js";
import { distributionRange, loadSentimentDistribution, type DistributionPeriod } from "../services/sentimentDistributionService.js";
import { analysisSnapshots } from "../services/analysisSnapshots.js";

type AuthRequest = Request & { user?: { id: string } };
async function adminProfile(req: AuthRequest, res: Response) {
  if (!req.user?.id) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const { data: profile, error } = await profileService.getProfile(req.user.id);
  if (error) { res.status(500).json({ error: "Unable to verify administrator access" }); return null; }
  if (!profile || !["admin", "super_admin"].includes(profile.role)) { res.status(403).json({ error: "Admin access only" }); return null; }
  return profile;
}
const timing = (res: Response, start: number) => res.setHeader("Server-Timing", `admin-data;dur=${Date.now() - start}`);

export async function getSentimentDistribution(req: AuthRequest, res: Response) {
  const start = Date.now();
  try {
    const profile = await adminProfile(req, res);
    if (!profile) return;
    const period = req.query.period === undefined ? "today" : req.query.period;
    // Accept the current rolling window and cached clients' calendar-month value.
    if (typeof period !== "string" || !["today", "7d", "30d", "month", "all"].includes(period)) return res.status(400).json({ error: "Invalid sentiment distribution period" });
    const cached = await analysisSnapshots.read(JSON.stringify([req.user!.id, profile.role, "sentiment-series-v2", period, distributionRange("today").day]),
      () => loadSentimentDistribution(period as DistributionPeriod));
    timing(res, start);
    return res.json({ ...cached.value, snapshot: cached.snapshot });
  } catch { return res.status(503).json({ error: "Sentiment distribution unavailable. Please retry." }); }
}

// Separate frontend queries/filters, shared authoritative subject aggregation.
export const getSentimentOverview = getSentimentDistribution;

export async function getAdminBrowsePage(req: AuthRequest, res: Response) {
  const start = Date.now();
  try {
    if (!await adminProfile(req, res)) return;
    const keys = ["view", "page", "pageSize", "from", "to", "status", "kind", "actorRole", "focusReport", "exportAll", "cursor", "sort"];
    if (keys.some(key => req.query[key] !== undefined && typeof req.query[key] !== "string")) return res.status(400).json({ error: "Invalid browsing filters" });
    const value = (key: string) => typeof req.query[key] === "string" ? req.query[key].trim() : "";
    const view = value("view"), page = Number(value("page") || 1), pageSize = Number(value("pageSize") || 10);
    if (!["records", "logs", "archived"].includes(view) || !Number.isSafeInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50 ||
      ["from", "to"].some(key => value(key) && !Number.isFinite(Date.parse(value(key)))) ||
      (value("from") && value("to") && Date.parse(value("from")) > Date.parse(value("to"))) ||
      (value("kind") && !["Incident", "Announcement", "Activity", "Blotter"].includes(value("kind"))) ||
      (value("actorRole") && !["user", "admin", "super_admin", "system"].includes(value("actorRole"))) ||
      (value("focusReport") && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value("focusReport"))) ||
      (value("exportAll") && value("exportAll") !== "1") ||
      (value("sort") && !["status-priority-v1", "status-priority-v2"].includes(value("sort")))) return res.status(400).json({ error: "Invalid pagination or record filters" });
    const fields: Record<string, string> = {};
    for (const key of ["from", "to", "status", "kind", "actorRole", "focusReport"]) if (value(key)) fields[key] = value(key);
    let cursor;
    try { if (value("cursor")) cursor = decodeBrowseCursor(value("cursor")); } catch { return res.status(400).json({ error: "Invalid record cursor" }); }
    const data = await loadAdminBrowsePage({ ...fields, ...(cursor ? { cursor } : {}), view: view as "records" | "logs" | "archived", page, pageSize, exportAll: value("exportAll") === "1" });
    timing(res, start);
    return res.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Records unavailable. Please retry.";
    return res.status(503).json({ error: /migration|Export exceeds/.test(message) ? message : "Records unavailable. Please retry." });
  }
}

export async function getAdminOverview(req: AuthRequest, res: Response) {
  const start = Date.now();
  try {
    const profile = await adminProfile(req, res);
    if (!profile) return;
    const now = new Date();
    const startValue = req.query.dayStart ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
    if (typeof startValue !== "string" || !Number.isFinite(Date.parse(startValue))) return res.status(400).json({ error: "Invalid dashboard day range" });
    const endValue = req.query.dayEnd ?? new Date(Date.parse(startValue) + 86400000).toISOString();
    if (typeof startValue !== "string" || typeof endValue !== "string" || !Number.isFinite(Date.parse(startValue)) || !Number.isFinite(Date.parse(endValue)) ||
      Date.parse(endValue) <= Date.parse(startValue) || Date.parse(endValue) - Date.parse(startValue) > 90000000) {
      return res.status(400).json({ error: "Invalid dashboard day range" });
    }
    const data = await loadAdminOverview({ superAdmin: profile.role === "super_admin", dayStart: startValue, dayEnd: endValue });
    timing(res, start);
    return res.json(data);
  } catch {
    return res.status(503).json({ error: "Dashboard data unavailable. Please retry." });
  }
}

export async function getValidationGroups(req: AuthRequest, res: Response) {
  const start = Date.now();
  try {
    if (!await adminProfile(req, res)) return;
    const allowed = ["page", "pageSize", "status", "category", "barangay", "incidentType", "from", "to", "view", "timeZone", "exportAll", "focusReport"];
    if (allowed.some(key => req.query[key] !== undefined && typeof req.query[key] !== "string")) return res.status(400).json({ error: "Invalid validation filters" });
    const value = (key: string) => typeof req.query[key] === "string" ? req.query[key].trim() : "";
    const page = Number(value("page") || 1), pageSize = Number(value("pageSize") || 10);
    const timeZone = value("timeZone") || "UTC";
    try { new Intl.DateTimeFormat("en-US", { timeZone }); } catch { return res.status(400).json({ error: "Invalid time zone" }); }
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50 ||
      ["from", "to"].some(key => value(key) && !Number.isFinite(Date.parse(value(key)))) ||
      (value("from") && value("to") && Date.parse(value("from")) > Date.parse(value("to")))) {
      return res.status(400).json({ error: "Invalid pagination or date range" });
    }
    const filters: Record<string, string> = {};
    for (const key of ["status", "category", "barangay", "incidentType", "from", "to", "view", "focusReport"]) if (value(key)) filters[key] = value(key);
    const result = await loadValidationGroups({ ...filters, page, pageSize, timeZone, exportAll: value("exportAll") === "1" });
    timing(res, start);
    return res.json(result);
  } catch {
    return res.status(503).json({ error: "Complete validation data unavailable. Please retry." });
  }
}

export async function getAdminMapReports(req: AuthRequest, res: Response) {
  const start = Date.now();
  try {
    if (!await adminProfile(req, res)) return;
    const { data, error } = await reportService.getAdminDashboard({ mode: "map", allPages: true });
    if (error || !data) return res.status(503).json({ error: error || "Map data unavailable" });
    timing(res, start);
    return res.json({ reports: data.reports.map(mapReportPayload), complete: true });
  } catch {
    return res.status(500).json({ error: "Map data unavailable. Please retry." });
  }
}

export async function getAdminReportDetails(req: AuthRequest, res: Response) {
  try {
    if (!await adminProfile(req, res)) return;
    const ids = typeof req.query.ids === "string" ? req.query.ids.split(",") : [];
    if (!ids.length || ids.length > 50 || ids.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
      return res.status(400).json({ error: "Between 1 and 50 valid report IDs are required" });
    }
    const { data, error } = await reportService.getAdminDashboard({ ids: [...new Set(ids)], includeArchived: true });
    if (error || !data) return res.status(503).json({ error: error || "Report details unavailable" });
    return res.json({ reports: data.reports });
  } catch {
    return res.status(500).json({ error: "Report details unavailable. Please retry." });
  }
}
