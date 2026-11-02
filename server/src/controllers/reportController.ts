import type { Response } from "express";
import { reportService } from "../services/reportService.js";
import { profileService } from "../services/authService.js";
import { notificationService } from "../services/notificationService.js";
import { credibilityService } from "../services/credibilityService.js";
import { aiService } from "../services/aiService.js";
import {
  sentimentService,
  type SentimentAnalysis,
} from "../services/sentimentService.js";
import { toReportCode } from "../utils/toReportCode.js";
import { backgroundTasks } from "../services/backgroundTasks.js";
import { reportSubmissionService } from "../services/reportSubmissionService.js";
import { supabaseAdmin } from "../config/supabaseAdmin.js";
import { buildBlotterUpdates } from "../utils/blotterFields.js";

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

  const { status, is_verified } = req.body ?? {};
  const isArchive = status === "Archived";

  const result = await reportService.validateReport(String(id), {
    status,
    // Archived reports are never verified; force the flag off with the status.
    is_verified: isArchive ? false : is_verified,
  });

  if (result.error) return res.status(400).json({ error: result.error });

  if (result.data?.ownerId) {
    const prev = result.data;
    const newStatus = status ?? prev.previousStatus ?? "Pending Review";
    const verified = isArchive
      ? false
      : is_verified ?? prev.previousVerified ?? false;

    if (newStatus === "Rejected") {
      await credibilityService
        .addPoints(
          result.data.ownerId,
          "report_rejected",
          "Report rejected after review",
          result.data.id
        )
        .catch(() => {});
    }

    if (verified) {
      await credibilityService
        .addPoints(
          result.data.ownerId,
          "report_verified",
          "Report verified by admin",
          result.data.id
        )
        .catch(() => {});
    }

    if (newStatus === "Marked Fake") {
      await credibilityService
        .addPoints(
          result.data.ownerId,
          "report_marked_fake",
          "Report marked as fake",
          result.data.id
        )
        .catch(() => {});
    }

    await notificationService.createNotification({
      userId: result.data.ownerId,
      type: "report_status",
      title: verified
        ? "Your report was verified"
        : isArchive
          ? "Your report was archived"
          : `Your report is now "${newStatus}"`,
      message: verified
        ? "Your report has been reviewed and marked as VERIFIED by the admin."
        : isArchive
          ? "The admin moved this report to archived reports, so it is no longer shown in active feeds."
          : `The admin updated your report. Current status: "${newStatus}".`,
      reportId: result.data.id,
      location: result.data.location,
      isVerified: verified,
    });

    const auditActionType = verified
      ? "Report Verified"
      : newStatus === "Rejected"
        ? "Report Rejected"
        : newStatus === "Marked Fake"
          ? "Report Rejected"
          : newStatus === "Archived"
            ? "Report Archived"
            : newStatus === "Mapped"
              ? "Report Mapped"
              : "Report Verified";

    await reportService.insertAuditLog({
      actorId: user.id,
      actorName: profile?.fullname || "Admin",
      actionType: auditActionType,
      title: verified
        ? `Report verified: ${result.data.incidentType}`
        : newStatus === "Archived"
          ? `Report archived: ${result.data.incidentType}`
          : `Report status updated: ${result.data.incidentType}`,
      details: verified
        ? `Report ${toReportCode(result.data.id)} was reviewed and verified by ${profile?.fullname || "admin"}.`
        : newStatus === "Archived"
          ? `Report ${toReportCode(result.data.id)} was moved to archived reports by ${profile?.fullname || "admin"}.`
          : `Report ${toReportCode(result.data.id)} status changed from "${result.data.previousStatus}" to "${newStatus}" by ${profile?.fullname || "admin"}.`,
      reportId: result.data.id,
      oldValue: result.data.previousStatus,
      newValue: isArchive ? "Archived" : verified ? "Verified" : newStatus,
    }).catch(() => {});

    // Archiving is quiet housekeeping: no broadcast to other admins.
    if (!isArchive) {
      const reportSeverity = await reportService.getReportSeverity(result.data.id);
      const statusPriority = severityToPriority(reportSeverity);

      await notificationService
        .notifyAllAdmins({
          type: "log",
          reportId: result.data.id,
          title: verified
            ? `Report verified: ${toReportCode(result.data.id)}`
            : `Report status changed to "${newStatus}"`,
          message: `${profile?.fullname || "Admin"} updated ${toReportCode(result.data.id)} to "${verified ? "Verified" : newStatus}".`,
          priority: statusPriority,
          excludeUserId: user.id,
        })
        .catch(() => {});
    }

    if (verified || newStatus === "Resolved") {
      const { data: coords } = await reportService.getReportCoords(
        result.data.id
      );

      await notificationService
        .notifyNearbyUsers({
          reportId: result.data.id,
          latitude: coords?.latitude ?? null,
          longitude: coords?.longitude ?? null,
          title: verified
            ? "Verified incident near you"
            : "Resolved incident near you",
          message: `An incident report near you was ${
            verified ? "verified" : "resolved"
          } by the admin.`,
          level: "High",
          excludeUserId: result.data.ownerId,
        })
        .catch(() => {});
    }

    // Re-analyze with AI when report is verified (to update credibility assessment)
    if (verified && result.data.id) {
      const { data: fullReport } = await import("../config/supabaseAdmin.js").then(m => m.supabaseAdmin
        .from("reports")
        .select(`
          id,
          location,
          latitude,
          longitude,
          details,
          incident_type_id,
          incident_types!inner (
            name,
            incident_categories!inner (name)
          )
        `)
        .eq("id", result.data.id)
        .maybeSingle());

      if (fullReport) {
        const typeData = fullReport.incident_types as unknown as {
          name: string;
          incident_categories: { name: string };
        };

        const [credibility, sentiment] = await Promise.all([
          aiService.analyzeReport(result.data.id, {
            incident_category: typeData.incident_categories.name,
            incident_type: typeData.name,
            location: fullReport.location || "",
            details: fullReport.details || "",
            latitude: fullReport.latitude,
            longitude: fullReport.longitude,
          }).catch((error) => {
            console.error("Credibility re-analysis failed:", error);
            return null;
          }),
          sentimentService.analyze("report", result.data.id, { force: true }).catch((error) => {
            console.error("Sentiment re-analysis failed:", error);
            return null;
          }),
        ]);
        if (credibility || sentiment) {
          await reportService.insertAuditLog({
            actorId: user.id,
            actorName: profile?.fullname || "Admin",
            actionType: "AI Analysis Completed",
            title: `Report analysis refreshed: ${typeData.name}`,
            details: `Credibility and sentiment analysis refreshed for report ${toReportCode(result.data.id)}.`,
            reportId: result.data.id,
            newValue: `Sentiment: ${sentiment?.label ?? "unclear"} (${sentiment?.status ?? "unavailable"})`,
          }).catch(() => {});
        }
      }
    }
  }

  res.json({
    message: "Report validated",
    status,
    is_verified: is_verified ?? false,
  });
};

export const createReport = async (req: AuthRequest, res: Response) => {
  try {
    return await createReportImpl(req, res);
  } catch (error) {
    console.error("Create report failed:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const severityToPriority = (
  severity: string | null | undefined
): "Low" | "Medium" | "High" => {
  if (severity === "Critical" || severity === "High") return "High";
  if (severity === "Low") return "Low";
  return "Medium";
};

const createReportImpl = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

  const { data: profile } = await profileService.getProfile(user.id);
  const userRole = profile?.role === "super_admin" ? "super_admin" : profile?.role === "admin" ? "admin" : "user";

  const result = await reportService.createReport(user.id, {
    ...req.body,
    role: userRole,
  });

  if (result.error) return res.status(400).json({ error: result.error });
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
  try {
    const { data, error } = await reportService.listReports(req.user?.id);

    if (error) return res.status(500).json({ error });

    res.json({ reports: data });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getMyReports = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

  const { data, error } = await reportService.listMyReports(user.id);

  if (error) return res.status(500).json({ error });

  res.json({ reports: data });
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

  if (result.error) return res.status(400).json({ error: result.error });
  if (!result.data) return res.status(500).json({ error: "Failed to create comment" });

  const sentiment = await sentimentService.analyze("comment", result.data).catch((error) => {
    console.error("Comment sentiment analysis failed:", error);
    return null;
  });

  res.status(201).json({
    message: "Comment added",
    comment_id: result.data,
    ...sentimentResponse(sentiment),
  });
};

export const getComments = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const { data, error } = await reportService.listComments(String(id));

  if (error) return res.status(500).json({ error });

  res.json({ comments: data });
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

  const { data, error } = await reportService.getAdminAnalytics();

  if (error) return res.status(500).json({ error });
  if (!data) return res.status(500).json({ error: "No analytics data" });

  res.json({
    summary: data.summary,
    sentimentTrend: data.sentimentTrend,
    forecast: data.forecast,
    forecastSummary: data.forecastSummary,
  });
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
