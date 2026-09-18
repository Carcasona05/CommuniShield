import type { Response } from "express";
import { supabaseAdmin } from "../config/supabaseAdmin.js";
import { profileService } from "../services/authService.js";

type AuthRequest = import("express").Request & { user?: { id: string } };

const ALLOWED_AI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
];

const DEFAULT_SETTINGS: Record<string, string> = {
  map_auto_map_verified: "true",
  map_cluster_overlay: "true",
  map_heatmap_overlay: "true",
  map_default_zoom: "13",
  map_center: "Argao, Cebu",
  notification_email: "true",
  notification_push: "false",
  ai_model_version: "gemini-1.5-flash",
  ai_api_endpoint: "",
  ai_scoring_enabled: "true",
  ai_high_threshold: "85",
  ai_medium_threshold: "60",
  ai_model_name: "gemini-1.5-flash",
  ai_temperature: "0.1",
  ai_timeout: "30000",
};

export const getSettings = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

    const { data: profile } = await profileService.getProfile(user.id);
    if (!profile || !["admin", "super_admin"].includes(profile.role)) {
      return res.status(403).json({ error: "Admin access only" });
    }

    const { data, error } = await supabaseAdmin
      .from("system_settings")
      .select("key, value");

    if (error) return res.status(500).json({ error: error.message });

    const merged = { ...DEFAULT_SETTINGS };
    (data || []).forEach((row) => {
      if (row.key in merged) merged[row.key] = row.value;
    });

    if (merged.ai_model_name) {
      const isValid = ALLOWED_AI_MODELS.some(
        (m) => merged.ai_model_name === m || merged.ai_model_name.startsWith(m + "-")
      );
      if (!isValid) merged.ai_model_name = DEFAULT_SETTINGS.ai_model_name;
    }

    res.json({ settings: merged });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateSettings = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

    const { data: profile } = await profileService.getProfile(user.id);
    if (!profile || profile.role !== "super_admin") {
      return res.status(403).json({
        error: "Only super admin can update system settings",
      });
    }

    const body = (req.body?.settings as Record<string, unknown>) ?? {};
    const entries = Object.entries(body).filter(([key]) =>
      Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)
    );

    if (entries.length === 0) {
      return res.status(400).json({ error: "No valid settings provided" });
    }

    for (const [key, value] of entries) {
      if (key === "ai_model_name") {
        const v = String(value);
        const isValid = ALLOWED_AI_MODELS.some((m) => v === m || v.startsWith(m + "-"));
        if (!isValid) {
          return res.status(400).json({
            error: `Invalid model "${v}". Allowed: ${ALLOWED_AI_MODELS.join(", ")}`,
          });
        }
      }

      const { error } = await supabaseAdmin
        .from("system_settings")
        .upsert(
          { key, value: String(value) },
          { onConflict: "key" }
        );

      if (error) return res.status(500).json({ error: error.message });
    }

    res.json({ message: "System settings updated successfully" });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};