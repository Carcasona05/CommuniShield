import type { Request, Response } from "express";
import type { User } from "@supabase/supabase-js";
import { notificationPreferencesService, type NotificationPreferences } from "../services/notificationPreferencesService.js";

type AuthRequest = Request & { user?: User };

export const getNotificationPreferences = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  const { data, error } = await notificationPreferencesService.get(req.user.id);
  if (error) return res.status(500).json({ error: "Could not load notification preferences." });
  return res.json(data);
};

export const updateNotificationPreferences = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  const body = req.body;
  const keys = ["notifications_enabled", "crime_alerts_enabled"];
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length === 0 ||
      Object.entries(body).some(([key, value]) => !keys.includes(key) || typeof value !== "boolean")) {
    return res.status(400).json({ error: "Provide boolean notification preferences only." });
  }
  const { data, error } = await notificationPreferencesService.update(
    req.user.id, body as Partial<NotificationPreferences>
  );
  if (error) return res.status(500).json({ error: "Could not save notification preferences." });
  return res.json(data);
};
