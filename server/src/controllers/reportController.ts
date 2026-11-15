import type { Response } from "express";
import { reportService } from "../services/reportService.js";
import { profileService } from "../services/authService.js";
import {
  sentimentService,
  type SentimentAnalysis,
} from "../services/sentimentService.js";
import { toReportCode } from "../utils/toReportCode.js";
import { backgroundTasks } from "../services/backgroundTasks.js";
import { reportSubmissionService } from "../services/reportSubmissionService.js";
import { supabaseAdmin } from "../config/supabaseAdmin.js";
import { buildBlotterUpdates } from "../utils/blotterFields.js";
import { credibilityFailure } from "./credibilityController.js";
import { decodeFeedCursor } from "../utils/feedCursor.js";
import { commentSentimentJobs } from "../services/commentSentimentJobs.js";
import { adminAnalysisJobs } from "../services/adminAnalysisJobs.js";
import { analysisSnapshots } from "../services/analysisSnapshots.js";

type AuthRequest = import("express").Request & { user?: { id: string }; token?: string };

const sentimentResponse = (analysis: SentimentAnalysis | null | undefined) => ({
  sentiment: analysis?.label ?? null,
  sentiment_status: analysis?.status ?? "unavailable",
  sentiment_confidence: analysis?.confidence ?? 0,
  sentiment_language: analysis?.language ?? "unknown",
  sentiment_provider: analysis?.provider ?? "none",
  sentiment_model: analysis?.model ?? "none",
  sentiment_error: analysis?.error_code ?? "",
  sentiment_analyzed_at: analysis?.analyzed_at ?? null,
});

export const validateReport = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

  const { data: profile } = await profileService.getProfile(user.id);
  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    return res.status(403).json({ error: "Admin access only" });
  }

  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "Report id required" });
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return res.status(400).json({ error: "Invalid report id" });

  const { status, is_verified } = req.body ?? {};
  const isArchive = status === "Archived";
  const forceUnverified = isArchive || status === "Rejected" || status === "Marked Fake";
  if (is_verified !== undefined && typeof is_verified !== "boolean") return res.status(400).json({ error: "Verification must be true or false." });

  if (status !== undefined && typeof status !== "string") return res.status(400).json({ error: "Invalid report status" });
  if (status === undefined && is_verified === undefined) return res.status(400).json({ error: "Status or verification required" });
  const started = Date.now();
  try {
    const saved = await adminAnalysisJobs.saveStatus(String(id), user.id, profile.fullname || "Admin", status, forceUnverified ? false : is_verified);
    if (saved.jobId) {
      analysisSnapshots.invalidate();
      backgroundTasks.schedule("status follow-up", () => adminAnalysisJobs.drain(1));
    }
    res.setHeader("Server-Timing", `status-save;dur=${Date.now() - started}`);
    return res.json({ message: "Report validated", ...saved, followup: saved.jobId ? "queued" : "not_required" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Status could not be saved";
    return res.status(/Invalid|not found/.test(message) ? 400 : 503).json({ error: message });
  }
};

export const createReport = async (req: AuthRequest, res: Response) => {
  try {
    return await createReportImpl(req, res);
  } catch (error) {
    console.error("Create report failed:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const createReportImpl = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

  const { data: profile } = await profileService.getProfile(user.id);
  const userRole = profile?.role === "super_admin" ? "super_admin" : profile?.role === "admin" ? "admin" : "user";

  const result = await reportService.createReport(user.id, {
    ...req.body,
    role: userRole,
    ...(userRole === "user" ? { status: "Pending Review", is_verified: false } : {}),
  });

  if (result.error) {
    const failure = credibilityFailure(result.error);
    return res.status(failure?.status || 400).json(failure || { error: result.error });
  }
  const createdReport = result.data;
  const reportId = createdReport?.id;
  if (!createdReport || !reportId) {
    return res.status(500).json({ error: "Failed to create report" });
  }

  const coordinate = (value: unknown) =>
    (typeof value === "number" || typeof value === "string" && value.trim() !== "") && Number.isFinite(Number(value)) ? Number(value) : null;
  const submitted = {
    ownerId: user.id, reportId,
    incidentCategory: String(req.body?.incident_category || ""),
    incidentType: String(req.body?.incident_type || ""),
    location: createdReport.location || String(req.body?.location || ""),
    details: String(req.body?.details || ""),
    latitude: coordinate(req.body?.latitude), longitude: coordinate(req.body?.longitude),
  };
  // Persist first. Register background work BEFORE sending HTTP 201; none of
  // the AI/geographic notification/credibility work delays the submit button.
  backgroundTasks.schedule(`report-submission:${reportId}`, () => reportSubmissionService.process(submitted));

  res.status(201).json({
    message: "Report submitted successfully",
    report_id: reportId,
    analysis: {
      credibility: "pending",
      ...sentimentResponse(null),
      sentiment_status: "pending",
    },
  });
};

export const getReports = async (req: AuthRequest, res: Response) => {
  const period = req.query.period ?? "24h";
  if (period !== "24h" && period !== "7d") return res.status(400).json({ error: "Report period must be 24h or 7d." });
  const now = Date.now();
  const window = { from: new Date(now - (period === "7d" ? 7 * 24 : 24) * 60 * 60 * 1000).toISOString(), to: new Date(now).toISOString() };
  try {
    if (!req.user?.id) return res.status(401).json({ error: "Unauthorized" });
    const cursor = decodeFeedCursor(req.query.cursor);
    const status = typeof req.query.status === "string" && req.query.status !== "All Status" ? req.query.status : undefined;
    const source = req.query.source ?? "All";
    if (!["All", "User", "Admin"].includes(String(source))) return res.status(400).json({ error: "Invalid feed source" });
    const [{ data, error }, safety] = await Promise.all([
      reportService.listFeedPage(req.user.id, { ...window, ...(status ? { status } : {}), source: String(source), cursor }),
      !cursor ? supabaseAdmin.rpc("feed_safety_reports", { p_from: window.from, p_to: window.to }) : Promise.resolve(null),
    ]);
    if (error) return res.status(500).json({ error });
    // Safety metadata is not restricted to the first ten posts or status/source filters.
    res.json({ ...data, ...(safety ? { safetyReports: safety.data || [], safetyUnavailable: Boolean(safety.error) } : {}) });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid pagination cursor") return res.status(400).json({ error: error.message });
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getMyReports = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

  try {
    const cursor = decodeFeedCursor(req.query.cursor);
    const status = typeof req.query.status === "string" && req.query.status !== "All Status" ? req.query.status : undefined;
    const { data, error } = await reportService.listFeedPage(user.id, { userId: user.id, ...(status ? { status } : {}), cursor });
    if (error) return res.status(500).json({ error });
    res.json(data);
  } catch (error) {
    res.status(error instanceof Error && error.message === "Invalid pagination cursor" ? 400 : 500).json({ error: error instanceof Error ? error.message : "Could not load reports" });
  }
};

export const getReport = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Report id required" });

    const { data, error } = await reportService.getReportById(
      req.user?.id,
      String(id)
    );

    if (error) return res.status(500).json({ error });
    if (!data) return res.status(404).json({ error: "Report not found" });

    res.json({ report: data });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateReport = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "Report id required" });

  const { data: profile } = await profileService.getProfile(user.id);
  const adminScope = !!profile && ["admin", "super_admin"].includes(profile.role);

  const result = await reportService.updateReport(user.id, String(id), req.body ?? {}, {
    adminScope,
  });

  if (result.error) return res.status(400).json({ error: result.error });

  const sentiment = await sentimentService
    .analyze("report", String(id))
    .catch((error) => {
      console.error("Report sentiment refresh failed:", error);
      return null;
    });

  res.json({
    message: "Report updated successfully",
    report_id: result.data,
    ...sentimentResponse(sentiment),
  });
};

export const deleteReport = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "Report id required" });

  const { data: profile } = await profileService.getProfile(user.id);
  const adminScope = !!profile && ["admin", "super_admin"].includes(profile.role);

  const result = await reportService.deleteReport(user.id, String(id), { adminScope });

  if (result.error) return res.status(400).json({ error: result.error });

  await reportService.insertAuditLog({
    actorId: user.id,
    actorName: profile?.fullname || "Admin",
    actionType: "Report Deleted",
    title: "Report deleted",
    details: `Report ${toReportCode(result.data)} was deleted by ${profile?.fullname || "admin"}.`,
    reportId: result.data ?? null,
  }).catch(() => {});

  res.json({ message: "Report deleted successfully" });
};

export const addComment = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.params;
  const { content } = req.body ?? {};

  const result = await reportService.addComment(user.id, String(id), content);

  if (result.error) {
    const failure = credibilityFailure(result.error);
    return res.status(failure?.status || 400).json(failure || { error: result.error });
  }
  if (!result.data) return res.status(500).json({ error: "Failed to create comment" });

  backgroundTasks.schedule("comment sentiment", () => commentSentimentJobs.drain(1));

  res.status(201).json({
    message: "Comment added",
    comment_id: result.data,
    comment: result.comment,
    total: result.total,
    sentiment: null,
    sentiment_status: "pending",
  });
};

export const getComments = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    const result = await reportService.listComments(String(id), decodeFeedCursor(req.query.cursor));
    if (result.error) return res.status(500).json({ error: result.error });
    res.json({ comments: result.data, total: result.total, hasMore: result.hasMore, nextCursor: result.nextCursor });
  } catch (error) {
    res.status(error instanceof Error && error.message === "Invalid pagination cursor" ? 400 : 500).json({ error: error instanceof Error ? error.message : "Could not load comments" });
  }
};

export const getCommentStatuses = async (req: AuthRequest, res: Response) => {
  const ids = typeof req.query.ids === "string" ? req.query.ids.split(",") : [];
  if (!ids.length || ids.length > 10 || ids.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) return res.status(400).json({ error: "Provide up to ten comment IDs" });
  const result = await reportService.commentStatuses(String(req.params.id), ids);
  if (result.error) return res.status(500).json({ error: result.error });
  res.json({ comments: result.data });
};

export const toggleLike = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.params;

  const result = await reportService.toggleLike(user.id, String(id));

  if (result.error) return res.status(400).json({ error: result.error });

  res.json({ liked: result.data?.liked, likes: result.data?.likes });
};

export const getIncidentOptions = async (req: AuthRequest, res: Response) => {
  const { data, error } = await reportService.listIncidentOptions();

  if (error) return res.status(500).json({ error });

  res.json({ categories: data });
};

export const getAdminPosts = async (req: AuthRequest, res: Response) => {
  const { data, error } = await reportService.listAdminPosts();

  if (error) return res.status(500).json({ error });

  res.json({ posts: data });
};

export const getAdminDashboard = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

  const { data: profile } = await profileService.getProfile(user.id);
  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    return res.status(403).json({ error: "Admin access only" });
  }

  const query = (value: unknown) =>
    typeof value === "string" ? value.trim() : "";
  const status = query(req.query.status);
  const source = query(req.query.source).toLowerCase();
  const severity = query(req.query.severity).toLowerCase();
  const category = query(req.query.category).toLowerCase();
  const barangay = query(req.query.barangay).toLowerCase();
  const search = query(req.query.search).toLowerCase();
  const from = query(req.query.from);
  const to = query(req.query.to);
  const fromTime = from ? Date.parse(from) : Number.NaN;
  const toTime = to
    ? Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999Z` : to)
    : Number.NaN;
  const { data, error } = await reportService.getAdminDashboard({
    ...(status ? { status } : {}),
    ...(source ? { source } : {}),
    ...(Number.isFinite(fromTime)
      ? { from: new Date(fromTime).toISOString() }
      : {}),
    ...(Number.isFinite(toTime) ? { to: new Date(toTime).toISOString() } : {}),
  });

  if (error) return res.status(500).json({ error });
  if (!data) return res.status(500).json({ error: "No dashboard data" });

  const reports = data.reports.filter((report) => {
    const createdAt = Date.parse(report.created_at || "");
    if (status && report.status !== status) return false;
    if (source && String(report.source || "").toLowerCase() !== source) {
      return false;
    }
    if (severity && String(report.severity || "").toLowerCase() !== severity) {
      return false;
    }
    if (
      category &&
      !String(report.incident_category || "").toLowerCase().includes(category)
    ) {
      return false;
    }
    if (barangay) {
      const resolvedBarangay = String(report.barangay || "").toLowerCase();
      if (barangay === "__unresolved__" ? Boolean(resolvedBarangay) : resolvedBarangay !== barangay) return false;
    }
    if (Number.isFinite(fromTime) && (!Number.isFinite(createdAt) || createdAt < fromTime)) {
      return false;
    }
    if (Number.isFinite(toTime) && (!Number.isFinite(createdAt) || createdAt > toTime)) {
      return false;
    }
    if (search) {
      const searchable = [
        report.incident_type,
        report.incident_category,
        report.location,
        report.barangay,
        report.details,
        report.reporter_name,
      ]
        .join(" ")
        .toLowerCase();
      if (!searchable.includes(search)) return false;
    }
    return true;
  });

  res.json({ summary: data.summary, reports });
};

export const getAdminLogs = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

  const { data: profile } = await profileService.getProfile(user.id);
  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    return res.status(403).json({ error: "Admin access only" });
  }

  const query = (value: unknown) =>
    typeof value === "string" ? value.trim() : "";
  const actorRole =
    typeof req.query.actorRole === "string" ? req.query.actorRole : undefined;
  const from = query(req.query.from);
  const to = query(req.query.to);
  const search = query(req.query.search).toLowerCase();
  const fromTime = from ? Date.parse(from) : Number.NaN;
  const toTime = to
    ? Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999Z` : to)
    : Number.NaN;
  const { data, error } = await reportService.listAuditLogs(actorRole, {
    ...(Number.isFinite(fromTime)
      ? { from: new Date(fromTime).toISOString() }
      : {}),
    ...(Number.isFinite(toTime) ? { to: new Date(toTime).toISOString() } : {}),
  });

  if (error) return res.status(500).json({ error });
  if (!data) return res.status(500).json({ error: "No log data" });

  const logs = (data || []).filter((log) => {
    if (!search) return true;
    return [log.title, log.actor, log.actionType, log.details]
      .join(" ")
      .toLowerCase()
      .includes(search);
  });
  res.json({ logs });
};

export const getAdminAnnouncements = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

  const { data: profile } = await profileService.getProfile(user.id);
  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    return res.status(403).json({ error: "Admin access only" });
  }

  const query = (value: unknown) =>
    typeof value === "string" ? value.trim() : "";
  const from = query(req.query.from);
  const to = query(req.query.to);
  const search = query(req.query.search).toLowerCase();
  const fromTime = from ? Date.parse(from) : Number.NaN;
  const toTime = to
    ? Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999Z` : to)
    : Number.NaN;
  const { data, error } = await reportService.listAdminAnnouncements({
    ...(Number.isFinite(fromTime)
      ? { from: new Date(fromTime).toISOString() }
      : {}),
    ...(Number.isFinite(toTime) ? { to: new Date(toTime).toISOString() } : {}),
  });

  if (error) return res.status(500).json({ error });
  const announcements = (data || []).filter((announcement) => {
    if (!search) return true;
    return [announcement.type, announcement.title, announcement.location, announcement.details]
      .join(" ")
      .toLowerCase()
      .includes(search);
  });
  res.json({ announcements });
};

export const createAdminAnnouncement = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

  const { data: profile } = await profileService.getProfile(user.id);
  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    return res.status(403).json({ error: "Admin access only" });
  }

  const { type, title, location, details, pic_url } = req.body ?? {};

  const result = await reportService.createAnnouncement(user.id, {
    type,
    title,
    location,
    details,
    pic_url,
  });

  if (result.error) return res.status(400).json({ error: result.error });

  await reportService.insertAuditLog({
    actorId: user.id,
    actorName: profile?.fullname || "Admin",
    actionType: "Announcement Created",
    title: "Announcement created",
    details: `A new ${type || "incident"} announcement was published by ${profile?.fullname || "admin"}.`,
  }).catch(() => {});

  res.status(201).json({ message: "Announcement published", announcement_id: result.data });
};

export const updateAdminAnnouncement = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "Announcement id required" });

  const { data: profile } = await profileService.getProfile(user.id);
  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    return res.status(403).json({ error: "Admin access only" });
  }

  const { type, title, location, details, pic_url } = req.body ?? {};
  const result = await reportService.updateAnnouncement(String(id), {
    type,
    title,
    location,
    details,
    pic_url,
  });

  if (result.error) return res.status(400).json({ error: result.error });

  await reportService.insertAuditLog({
    actorId: user.id,
    actorName: profile?.fullname || "Admin",
    actionType: "Announcement Updated",
    title: "Announcement updated",
    details: `Announcement "${title || ""}" was updated by ${profile?.fullname || "admin"}.`,
  }).catch(() => {});

  res.json({ message: "Announcement updated", announcement_id: result.data });
};

export const deleteAdminAnnouncement = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "Announcement id required" });

  const { data: profile } = await profileService.getProfile(user.id);
  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    return res.status(403).json({ error: "Admin access only" });
  }

  const result = await reportService.deleteAnnouncement(String(id));
  if (result.error) {
    const status = result.error === "Announcement not found" ? 404 : 400;
    return res.status(status).json({ error: result.error });
  }

  await reportService.insertAuditLog({
    actorId: user.id,
    actorName: profile?.fullname || "Admin",
    actionType: "Announcement Deleted",
    title: "Announcement deleted",
    details: `An announcement was deleted by ${profile?.fullname || "admin"}.`,
  }).catch(() => {});

  res.json({ message: "Announcement deleted" });
};

export const getAdminAnalytics = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

  const { data: profile } = await profileService.getProfile(user.id);
  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    return res.status(403).json({ error: "Admin access only" });
  }

  const start = Date.now();
  try {
  const cached = await analysisSnapshots.read(JSON.stringify([user.id, profile.role, "sentiment", new Date().toISOString().slice(0, 10)]), async () => {
  const { data, error } = await reportService.getAdminAnalytics();
  if (error || !data) throw new Error(error || "No analytics data");
  return {
    summary: data.summary,
    sentimentTrend: data.sentimentTrend,
    forecast: data.forecast,
    forecastSummary: data.forecastSummary,
  };
  });
  res.setHeader?.("Server-Timing", `sentiment;dur=${Date.now() - start}`);
  return res.json({ ...cached.value, snapshot: cached.snapshot });
  } catch { return res.status(503).json({ error: "Analytics unavailable. Please retry." }); }
};

export const getAdminBlotters = async (_req: AuthRequest, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from("admin_blotters")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ blotters: data || [] });
};

export const createAdminBlotter = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user?.id) return res.status(401).json({ error: "Unauthorized" });
  const built = buildBlotterUpdates(req.body ?? {}, true);
  if (built.error) return res.status(400).json({ error: built.error });

  const { data, error } = await supabaseAdmin.from("admin_blotters").insert({
    admin_id: user.id,
    ...built.updates!,
  }).select("*").single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ message: "Blotter saved", blotter: data });
};

export const updateAdminBlotter = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "Blotter id required" });

  const { data: profile } = await profileService.getProfile(user.id);
  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    return res.status(403).json({ error: "Admin access only" });
  }

  const built = buildBlotterUpdates(req.body ?? {});
  if (built.error) return res.status(400).json({ error: built.error });

  const { data, error } = await supabaseAdmin
    .from("admin_blotters")
    .update(built.updates!)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "Blotter not found" });

  await reportService.insertAuditLog({
    actorId: user.id,
    actorName: profile?.fullname || "Admin",
    actionType: "Blotter Updated",
    title: "Blotter updated",
    details: `Blotter ${data.blotter_no} was updated by ${profile?.fullname || "admin"}.`,
  }).catch(() => {});

  res.json({ message: "Blotter updated", blotter: data });
};

export const deleteAdminBlotter = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "Blotter id required" });

  const { data: profile } = await profileService.getProfile(user.id);
  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    return res.status(403).json({ error: "Admin access only" });
  }

  const { data, error } = await supabaseAdmin
    .from("admin_blotters")
    .delete()
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "Blotter not found" });

  await reportService.insertAuditLog({
    actorId: user.id,
    actorName: profile?.fullname || "Admin",
    actionType: "Blotter Deleted",
    title: "Blotter deleted",
    details: `Blotter ${data.blotter_no} was deleted by ${profile?.fullname || "admin"}.`,
  }).catch(() => {});

  res.json({ message: "Blotter deleted" });
};
