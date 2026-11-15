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
  ai_model_version: "gemini-3.6-flash",
  ai_scoring_enabled: "true",
  ai_model_name: "gemini-3.6-flash",
  ai_temperature: "0.1",
  ai_timeout: "30000",
  sentiment_local_model_enabled: "true",
  sentiment_gemini_enabled: "false",
  sentiment_cebuano_mode: "local",
};

const BOOLEAN_KEYS = [
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
      if (!["gemini", "local", "disabled"].includes(value)) {
        return {
          error: "sentiment_cebuano_mode must be gemini, local, or disabled",
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
    case "ai_api_endpoint":
      return { error: "Custom AI API endpoints are no longer supported" };
    default:
      return { error: "Unsupported system setting" };
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
      merged.sentiment_cebuano_mode = DEFAULT_SETTINGS.sentiment_cebuano_mode ?? "local";
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

    const { error } = await supabaseAdmin
      .from("system_settings")
      .upsert(normalizedRows, { onConflict: "key" });

    if (error) return res.status(500).json({ error: error.message });

    res.json({ message: "System settings updated successfully" });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};
