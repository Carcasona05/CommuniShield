import type { Response } from "express";
import { supabaseAdmin } from "../config/supabaseAdmin.js";
import { profileService } from "../services/authService.js";

type AuthRequest = import("express").Request & { user?: { id: string } };

const ALLOWED_AI_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.1-pro",
  "gemini-3.0-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash",
];

const DEFAULT_SETTINGS: Record<string, string> = {
  map_auto_map_verified: "true",
  map_cluster_overlay: "true",
  map_heatmap_overlay: "true",
  map_default_zoom: "13",
  map_center: "Argao, Cebu",
  notification_email: "true",
  notification_push: "false",
  ai_model_version: "gemini-3.6-flash",
  ai_api_endpoint: "",
  ai_scoring_enabled: "true",
  ai_high_threshold: "85",
  ai_medium_threshold: "60",
  ai_model_name: "gemini-3.6-flash",
  ai_temperature: "0.1",
  ai_timeout: "30000",
  sentiment_local_model_enabled: "true",
  sentiment_gemini_enabled: "true",
  sentiment_cebuano_mode: "gemini",
};

const BOOLEAN_KEYS = [
  "map_auto_map_verified",
  "map_cluster_overlay",
  "map_heatmap_overlay",
  "notification_email",
  "notification_push",
  "ai_scoring_enabled",
  "sentiment_local_model_enabled",
  "sentiment_gemini_enabled",
] as const;

const normalizeModelName = (rawValue: string): string | null => {
  const value = rawValue.replace(/^models\//, "");
  const isValid = ALLOWED_AI_MODELS.some(
    (m) => value === m || value.startsWith(m + "-")
  );
  return isValid ? value : null;
};

export const validateSetting = (
  key: string,
  rawValue: unknown
): { value: string } | { error: string } => {
  const value = String(rawValue ?? "").trim();

  if ((BOOLEAN_KEYS as readonly string[]).includes(key)) {
    if (!["true", "false"].includes(value)) {
      return { error: `${key} must be true or false` };
    }
    return { value };
  }

  switch (key) {
    case "sentiment_cebuano_mode":
      if (value === "local") return { value: "gemini" };
      if (!["gemini", "disabled"].includes(value)) {
        return {
          error: "sentiment_cebuano_mode must be gemini or disabled",
        };
      }
      return { value };
    case "ai_model_name":
    case "ai_model_version": {
      const model = normalizeModelName(value);
      if (!model) {
        return {
          error: `Invalid model "${value}". Allowed: ${ALLOWED_AI_MODELS.join(", ")}`,
        };
      }
      return { value: model };
    }
    case "ai_high_threshold":
    case "ai_medium_threshold": {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
        return { error: `${key} must be an integer between 0 and 100` };
      }
      return { value: String(parsed) };
    }
    case "ai_temperature": {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
        return { error: "ai_temperature must be a number between 0 and 1" };
      }
      return { value: String(parsed) };
    }
    case "ai_timeout": {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1000 || parsed > 120000) {
        return {
          error: "ai_timeout must be an integer between 1000 and 120000",
        };
      }
      return { value: String(parsed) };
    }
    case "map_default_zoom": {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) {
        return { error: "map_default_zoom must be an integer between 1 and 20" };
      }
      return { value: String(parsed) };
    }
    case "map_center": {
      if (!value || value.length > 200) {
        return { error: "map_center must be 1 to 200 characters" };
      }
      return { value };
    }
    case "ai_api_endpoint": {
      if (value) {
        let url: URL;
        try {
          url = new URL(value);
        } catch {
          return { error: "ai_api_endpoint must be a valid URL" };
        }
        if (url.protocol !== "https:" && url.protocol !== "http:") {
          return { error: "ai_api_endpoint must use http or https" };
        }
      }
      return { value };
    }
    default:
      return { value };
  }
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

    const merged: Record<string, string> = { ...DEFAULT_SETTINGS };
    (data || []).forEach((row) => {
      if (row.key in merged) merged[row.key] = row.value;
    });

    const modelName = merged.ai_model_name;
    if (modelName) {
      const normalized = normalizeModelName(modelName);
      merged.ai_model_name = normalized ?? DEFAULT_SETTINGS.ai_model_name ?? "gemini-3.6-flash";
    }
    const modelVersion = merged.ai_model_version;
    if (modelVersion) {
      const normalized = normalizeModelName(modelVersion);
      merged.ai_model_version = normalized ?? DEFAULT_SETTINGS.ai_model_version ?? "gemini-3.6-flash";
    }

    for (const key of BOOLEAN_KEYS) {
      const current = merged[key];
      if (!current || !["true", "false"].includes(current)) {
        merged[key] = DEFAULT_SETTINGS[key] ?? "true";
      }
    }

    const cebuanoMode = merged.sentiment_cebuano_mode;
    if (!cebuanoMode || !["gemini", "local", "disabled"].includes(cebuanoMode)) {
      merged.sentiment_cebuano_mode = DEFAULT_SETTINGS.sentiment_cebuano_mode ?? "gemini";
    } else if (cebuanoMode === "local") {
      merged.sentiment_cebuano_mode = "gemini";
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

    const normalizedRows: Array<{ key: string; value: string }> = [];
    for (const [key, rawValue] of entries) {
      const result = validateSetting(key, rawValue);
      if ("error" in result) {
        return res.status(400).json({ error: result.error });
      }
      normalizedRows.push({ key, value: result.value });
    }

    const touchesThresholds = normalizedRows.some(
      (row) =>
        row.key === "ai_high_threshold" || row.key === "ai_medium_threshold"
    );
    if (touchesThresholds) {
      const { data: existing, error: readError } = await supabaseAdmin
        .from("system_settings")
        .select("key, value")
        .in("key", ["ai_high_threshold", "ai_medium_threshold"]);
      if (readError) {
        return res.status(500).json({ error: readError.message });
      }
      const current: Record<string, string> = {
        ai_high_threshold: DEFAULT_SETTINGS.ai_high_threshold ?? "85",
        ai_medium_threshold: DEFAULT_SETTINGS.ai_medium_threshold ?? "60",
      };
      for (const row of existing || []) {
        if (row.key in current) current[row.key] = row.value;
      }
      for (const row of normalizedRows) {
        current[row.key] = row.value;
      }
      const high = Number(current.ai_high_threshold);
      const medium = Number(current.ai_medium_threshold);
      if (!Number.isFinite(high) || !Number.isFinite(medium) || high <= medium) {
        return res.status(400).json({
          error: "ai_high_threshold must be greater than ai_medium_threshold",
        });
      }
    }

    const { error } = await supabaseAdmin
      .from("system_settings")
      .upsert(normalizedRows, { onConflict: "key" });

    if (error) return res.status(500).json({ error: error.message });

    res.json({ message: "System settings updated successfully" });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};