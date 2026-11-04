import type { Request, Response, NextFunction } from "express";
import type { User } from "@supabase/supabase-js";
import { profileService } from "../services/authService.js";
import { profileCompletionService } from "../services/profileCompletionService.js";
type AuthRequest = Request & { user?: User };

export const getProfileCompletion = async (req: AuthRequest, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  try {
    const { data: profile, error } = await profileService.getProfile(req.user.id);
    if (error || !profile) return res.status(503).json({ error: "Could not verify profile details." });
    const result = await profileCompletionService.check(req.user.id, profile, req.user.email);
    if (result.error || !result.data) return res.status(503).json({ error: result.error });
    return res.json(result.data);
  } catch { return res.status(503).json({ error: "Could not verify profile details." }); }
};

export const requireCompleteUserProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  try {
    const { data: profile, error } = await profileService.getProfile(req.user.id);
    if (error || !profile) return res.status(503).json({ error: "Could not verify profile details. Please try again." });
    const result = await profileCompletionService.check(req.user.id, profile, req.user.email);
    if (result.error || !result.data) return res.status(503).json({ error: result.error });
    if (!result.data.complete) return res.status(403).json({ code: "PROFILE_INCOMPLETE",
      error: "Complete your profile before posting or commenting.", missing: result.data.missing });
    next();
  } catch { return res.status(503).json({ error: "Could not verify profile details. Please try again." }); }
};

export const setProfileLocation = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  const { latitude, longitude, permissionGranted, address: rawAddress } = req.body || {};
  const address = typeof rawAddress === "string" ? rawAddress.trim() : "";
  if (!address || address.length > 500) return res.status(400).json({ error: "Enter your address (up to 500 characters)." });
  if (permissionGranted !== true || typeof latitude !== "number" || typeof longitude !== "number" ||
    !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return res.status(400).json({ error: "Location permission and valid device coordinates are required." });
  }
  try {
    const { data: profile, error } = await profileService.getProfile(req.user.id);
    if (error || !profile) return res.status(503).json({ error: "Could not verify your profile." });
    const saved = await profileCompletionService.saveLocation(req.user.id, latitude, longitude, address);
    if (saved.error) return res.status(503).json({ error: saved.error });
    return res.json({ location: address, locationConfirmed: true });
  } catch { return res.status(503).json({ error: "Could not save your address. Please try again." }); }
};
