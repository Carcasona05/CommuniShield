import type { Response } from "express";
import { aiService } from "../services/aiService.js";
import { reportService } from "../services/reportService.js";
import { profileService } from "../services/authService.js";

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
      ollama_connected: status.connected,
      model: status.model,
      error: status.error,
      config: {
        ollama_url: config.ollama_url,
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
      details: `AI credibility analysis completed for report ${reportId}. Score: ${result?.ai_score ?? "N/A"}, Severity: ${result?.severity ?? "N/A"}.`,
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

    const { error } = await import("../config/supabaseAdmin.js").then(m => m.supabaseAdmin
      .from("app_settings")
      .upsert({ ai_credibility_enabled: enabled }, { onConflict: "id" })
    );

    if (error) return res.status(500).json({ error: error.message });

    res.json({ message: `AI analysis ${enabled ? "enabled" : "disabled"}`, ai_enabled: enabled });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};