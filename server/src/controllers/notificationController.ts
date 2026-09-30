import type { Response } from "express";
import { notificationService } from "../services/notificationService.js";
import { profileService } from "../services/authService.js";

type AuthRequest = import("express").Request & {
  user?: { id: string };
  token?: string;
};

export const markAdminNotificationRead = async (
  req: AuthRequest,
  res: Response
) => {
  const user = req.user;
  if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

  const { data: profile } = await profileService.getProfile(user.id);
  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    return res.status(403).json({ error: "Admin access only" });
  }

  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "Notification id required" });

  const { error } = await notificationService.markAdminRead(String(id));

  if (error) return res.status(500).json({ error });

  res.json({ message: "Notification marked as read" });
};

export const markAdminAllNotificationsRead = async (
  req: AuthRequest,
  res: Response
) => {
  const user = req.user;
  if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

  const { data: profile } = await profileService.getProfile(user.id);
  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    return res.status(403).json({ error: "Admin access only" });
  }

  const { error } = await notificationService.markAdminAllRead(user.id);

  if (error) return res.status(500).json({ error });

  res.json({ message: "All notifications marked as read" });
};

export const getAdminNotifications = async (
  req: AuthRequest,
  res: Response
) => {
  const user = req.user;
  if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

  const { data: profile } = await profileService.getProfile(user.id);
  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    return res.status(403).json({ error: "Admin access only" });
  }

  const limitRaw = Number(req.query.limit);
  const offsetRaw = Number(req.query.offset);
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(Math.trunc(limitRaw), 50)
      : 10;
  const offset =
    Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.trunc(offsetRaw) : 0;

  const { data, error } = await notificationService.listAdminNotifications(
    user.id,
    limit,
    offset
  );

  if (error) return res.status(500).json({ error });

  res.json({ ...data });
};

export const getNotifications = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

  const { data, error } = await notificationService.listUserNotifications(
    user.id
  );

  if (error) return res.status(500).json({ error });

  res.json({ ...data });
};

export const getLoginActivities = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

  const { data, error } = await notificationService.listLoginActivities(
    user.id
  );

  if (error) return res.status(500).json({ error });

  res.json({ activities: data });
};

export const markNotificationRead = async (
  req: AuthRequest,
  res: Response
) => {
  const user = req.user;
  if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "Notification id required" });

  const { error } = await notificationService.markRead(user.id, String(id));

  if (error) return res.status(500).json({ error });

  res.json({ message: "Notification marked as read" });
};

export const markAllNotificationsRead = async (
  req: AuthRequest,
  res: Response
) => {
  const user = req.user;
  if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

  const { error } = await notificationService.markAllRead(user.id);

  if (error) return res.status(500).json({ error });

  res.json({ message: "All notifications marked as read" });
};