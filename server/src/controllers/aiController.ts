import type { Response } from "express";
import { aiService } from "../services/aiService.js";
import { reportService } from "../services/reportService.js";
import { profileService } from "../services/authService.js";
import { sentimentService, type SentimentSubjectType } from "../services/sentimentService.js";
import { supabaseAdmin } from "../config/supabaseAdmin.js";
import { toReportCode } from "../utils/toReportCode.js";

type AuthRequest = import("express").Request & { user?: { id: string } };

export const getAIStatus = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

    const { data: profile } = await import("../services/authService.js").then(m => m.profileService.getProfile(user.id));
    if (!profile || !["admin", "super_admin"].includes(profile.role)) {
      return res.status(403).json({ error: "Admin access only" });
    }

    const status = await aiService.testConnection();
    const enabled = await aiService.isEnabled();
    const config = await aiService.getConfig();

    res.json({
      ai_enabled: enabled,
      gemini_connected: status.connected,
      model: status.model,
      error: status.error,
      config: {
        model_name: config.model_name,
        temperature: config.temperature,
        timeout_ms: config.timeout_ms,
      },
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const analyzeReport = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Report id required" });
    const reportId = String(id);

    const { error: coordError } = await reportService.getReportCoords(reportId);
    if (coordError) return res.status(404).json({ error: "Report not found" });

    // Fetch full report data
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
      .eq("id", reportId)
      .maybeSingle());

    if (!fullReport) return res.status(404).json({ error: "Report not found" });

    const typeData = fullReport.incident_types as unknown as {
      name: string;
      incident_categories: { name: string };
    };

    const result = await aiService.analyzeReport(reportId, {
      incident_category: typeData.incident_categories.name,
      incident_type: typeData.name,
      location: fullReport.location || "",
      details: fullReport.details || "",
      latitude: fullReport.latitude,
      longitude: fullReport.longitude,
    });

    const { data: profile } = await profileService.getProfile(user.id);

    await reportService.insertAuditLog({
      actorId: user.id,
      actorName: profile?.fullname || "Admin",
      actionType: "AI Analysis Completed",
      title: `AI analysis: ${typeData.name}`,
      details: `AI credibility analysis completed for report ${toReportCode(reportId)}. Score: ${result?.ai_score ?? "N/A"}, Severity: ${result?.severity ?? "N/A"}.`,
      reportId,
      newValue: result?.ai_score != null ? `Score: ${result.ai_score}` : null,
    }).catch(() => {});

    res.json({ analysis: result });
  } catch (error) {
    console.error("AI analysis error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const batchAnalyzeReports = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

    const { data: profile } = await import("../services/authService.js").then(m => m.profileService.getProfile(user.id));
    if (!profile || !["admin", "super_admin"].includes(profile.role)) {
      return res.status(403).json({ error: "Admin access only" });
    }

    const { report_ids } = req.body ?? {};
    if (!Array.isArray(report_ids) || report_ids.length === 0) {
      return res.status(400).json({ error: "report_ids array required" });
    }

    const results = await aiService.analyzeReports(report_ids);
    res.json({ analyses: results });
  } catch (error) {
    console.error("Batch AI analysis error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const isAdminRole = (role: string | undefined): boolean =>
  role === "admin" || role === "super_admin";

const sentimentIds = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return [...new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0))];
  }
  return typeof value === "string" && value.length > 0 ? [value] : [];
};

type SentimentSnapshot = {
  label: string | null;
  status: string | null;
  confidence: number | null;
};

const confidencePct = (confidence: number | null): number | null => {
  if (confidence == null || !Number.isFinite(confidence)) return null;
  return confidence <= 1 ? Math.round(confidence * 100) : Math.round(confidence);
};

const summarizeSentiment = (entries: SentimentSnapshot[]): string => {
  if (entries.length === 0) return "";
  if (entries.length === 1) {
    const entry = entries[0] ?? { label: null, status: null, confidence: null };
    const status = entry.status || "";
    const label = entry.label || "";
    if (status && status !== "succeeded") return status;
    if (label) {
      const pct = confidencePct(entry.confidence);
      return pct === null ? label : `${label} (${pct}%)`;
    }
    return status;
  }
  const counts = new Map<string, number>();
  entries.forEach((entry) => {
    const key =
      entry.status && entry.status !== "succeeded"
        ? entry.status
        : entry.label || entry.status || "unknown";
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => `${key} \u00d7 ${count}`);
  return `${entries.length} records \u00b7 ${parts.join(", ")}`;
};

const priorSentiment = async (
  subjectType: SentimentSubjectType,
  ids?: string[]
): Promise<SentimentSnapshot[]> => {
  try {
    let query = supabaseAdmin
      .from("sentiment_analysis")
      .select("label, status, confidence")
      .eq("subject_type", subjectType)
      .limit(1000);
    if (ids) query = query.in("subject_id", ids);
    const { data, error } = await query;
    if (error) return [];
    return (data || []) as SentimentSnapshot[];
  } catch {
    return [];
  }
};

export const reanalyzeSentiment = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

    const { data: profile } = await profileService.getProfile(user.id);
    if (!isAdminRole(profile?.role)) {
      return res.status(403).json({ error: "Admin access only" });
    }

    const subjectType = String(req.params.type || req.body?.subject_type || "") as SentimentSubjectType;
    if (subjectType !== "report" && subjectType !== "comment") {
      return res.status(400).json({ error: "subject_type must be report or comment" });
    }

    const ids = sentimentIds(req.params.id || req.body?.id || req.body?.ids);
    if (ids.length === 0) {
      return res.status(400).json({ error: "id or ids array required" });
    }

    const prior = await priorSentiment(subjectType, ids);
    const results = await sentimentService.analyzeMany(subjectType, ids, { force: true });
    const auditLog: {
      actorId: string;
      actorName: string;
      actionType: string;
      title: string;
      details: string;
      oldValue: string;
      newValue: string;
      reportId?: string;
    } = {
      actorId: user.id,
      actorName: profile?.fullname || "Admin",
      actionType: "AI Analysis Completed",
      title: `${subjectType} sentiment reanalysis`,
      details: `Reanalyzed ${ids.length} ${subjectType} record(s): ${toReportCode(ids[0])}.`,
      oldValue: summarizeSentiment(prior),
      newValue: summarizeSentiment(
        ids.map((id) => ({
          label: results[id]?.label ?? null,
          status: results[id]?.status ?? null,
          confidence: results[id]?.confidence ?? null,
        }))
      ),
    };
    if (subjectType === "report" && ids[0]) auditLog.reportId = ids[0];
    await reportService.insertAuditLog(auditLog).catch(() => {});

    res.json({ results });
  } catch (error) {
    console.error("Sentiment reanalysis error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const reanalyzeAllSentiment = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

    const { data: profile } = await profileService.getProfile(user.id);
    if (!isAdminRole(profile?.role)) {
      return res.status(403).json({ error: "Admin access only" });
    }

    const subjectType = String(req.body?.subject_type || "report") as SentimentSubjectType;
    if (subjectType !== "report" && subjectType !== "comment") {
      return res.status(400).json({ error: "subject_type must be report or comment" });
    }

    const table = subjectType === "report" ? "reports" : "report_comments";
    const { data: rows, error: rowsError } = await supabaseAdmin
      .from(table)
      .select("id")
      .limit(1000);
    if (rowsError) return res.status(500).json({ error: rowsError.message });

    const ids = (rows || []).map((row) => String(row.id));
    const prior = await priorSentiment(subjectType, ids);
    const results = await sentimentService.analyzeMany(subjectType, ids, { force: true });
    await reportService.insertAuditLog({
      actorId: user.id,
      actorName: profile?.fullname || "Admin",
      actionType: "AI Analysis Completed",
      title: "Sentiment reanalysis completed",
      details: `Reanalyzed ${ids.length} ${subjectType} record(s).`,
      oldValue: summarizeSentiment(prior),
      newValue: summarizeSentiment(
        ids.map((id) => ({
          label: results[id]?.label ?? null,
          status: results[id]?.status ?? null,
          confidence: results[id]?.confidence ?? null,
        }))
      ),
    }).catch(() => {});
    res.json({ results, count: ids.length });
  } catch (error) {
    console.error("Batch sentiment reanalysis error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const toggleAI = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

    const { data: profile } = await import("../services/authService.js").then(m => m.profileService.getProfile(user.id));
    if (!profile || profile.role !== "super_admin") {
      return res.status(403).json({ error: "Super admin access only" });
    }

    const { enabled } = req.body ?? {};
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled (boolean) required" });
    }

    const { error } = await supabaseAdmin
      .from("system_settings")
      .upsert(
        { key: "ai_scoring_enabled", value: String(enabled) },
        { onConflict: "key" }
      );

    if (error) return res.status(500).json({ error: error.message });

    res.json({ message: `AI analysis ${enabled ? "enabled" : "disabled"}`, ai_enabled: enabled });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};