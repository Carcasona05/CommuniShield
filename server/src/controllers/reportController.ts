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

  const result = await reportService.validateReport(String(id), {
    status,
    is_verified,
  });

  if (result.error) return res.status(400).json({ error: result.error });

  if (result.data?.ownerId) {
    const prev = result.data;
    const newStatus = status ?? prev.previousStatus ?? "Pending Review";
    const verified = is_verified ?? prev.previousVerified ?? false;

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

    await notificationService.createNotification({
      userId: result.data.ownerId,
      type: "report_status",
      title: verified ? "Your report was verified" : `Your report is now "${newStatus}"`,
      message: verified
        ? "Your report has been reviewed and marked as VERIFIED by the admin."
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
          : newStatus === "Mapped"
            ? "Report Mapped"
            : "Report Verified";

    await reportService.insertAuditLog({
      actorId: user.id,
      actorName: profile?.fullname || "Admin",
      actionType: auditActionType,
      title: verified
        ? `Report verified: ${result.data.incidentType}`
        : `Report status updated: ${result.data.incidentType}`,
      details: verified
        ? `Report ${toReportCode(result.data.id)} was reviewed and verified by ${profile?.fullname || "admin"}.`
        : `Report ${toReportCode(result.data.id)} status changed from "${result.data.previousStatus}" to "${newStatus}" by ${profile?.fullname || "admin"}.`,
      reportId: result.data.id,
      oldValue: result.data.previousStatus,
      newValue: verified ? "Verified" : newStatus,
    }).catch(() => {});

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

  await credibilityService
    .addPoints(
      user.id,
      "report_submitted",
      "Report submitted",
      reportId
    )
    .catch(() => {});

  const latNum = req.body?.latitude ? Number(req.body.latitude) : null;
  const lngNum = req.body?.longitude ? Number(req.body.longitude) : null;

  await notificationService
    .notifyNearbyUsers({
      reportId,
      latitude: latNum,
      longitude: lngNum,
      title: req.body?.incident_type || "Incident report near you",
      message: `A new "${req.body?.incident_type || "incident"}" report was filed near your location.`,
      level: "Moderate",
      excludeUserId: user.id,
    })
    .catch(() => {});

  await notificationService
    .notifyAllAdmins({
      reportId,
      title: req.body?.incident_type || "New Incident Report",
      message: `A new "${req.body?.incident_type || "incident"}" report was filed at ${req.body?.location || "an unspecified location"}.`,
      priority: "High",
      excludeUserId: user.id,
    })
    .catch(() => {});

  const reportLocation = createdReport.location || req.body?.location || "";
  const analysisInput = {
    incident_category: req.body?.incident_category || "",
    incident_type: req.body?.incident_type || "",
    location: reportLocation,
    details: req.body?.details || "",
    latitude: latNum,
    longitude: lngNum,
  };
  const [credibility, sentiment] = await Promise.all([
    aiService.analyzeReport(reportId, analysisInput).catch((error) => {
      console.error("Credibility analysis failed:", error);
      return null;
    }),
    sentimentService.analyze("report", reportId).catch((error) => {
      console.error("Report sentiment analysis failed:", error);
      return null;
    }),
  ]);

  res.status(201).json({
    message: "Report submitted successfully",
    report_id: reportId,
    analysis: {
      credibility: credibility ? "succeeded" : "unavailable",
      ...sentimentResponse(sentiment),
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

  const result = await reportService.updateReport(user.id, String(id), req.body ?? {});

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

  const result = await reportService.deleteReport(user.id, String(id));

  if (result.error) return res.status(400).json({ error: result.error });

  const { data: profile } = await profileService.getProfile(user.id);

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

  res.json({ liked: result.data?.liked });
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

  const { data, error } = await reportService.getAdminDashboard();

  if (error) return res.status(500).json({ error });
  if (!data) return res.status(500).json({ error: "No dashboard data" });

  res.json({ summary: data.summary, reports: data.reports });
};

export const getAdminLogs = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

  const { data: profile } = await profileService.getProfile(user.id);
  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    return res.status(403).json({ error: "Admin access only" });
  }

  const { data, error } = await reportService.listAuditLogs();

  if (error) return res.status(500).json({ error });
  if (!data) return res.status(500).json({ error: "No log data" });

  res.json({ logs: data });
};

export const createAdminAnnouncement = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

  const { data: profile } = await profileService.getProfile(user.id);
  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    return res.status(403).json({ error: "Admin access only" });
  }

  const { type, location, details, pic_url } = req.body ?? {};

  const result = await reportService.createAnnouncement(user.id, {
    type,
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