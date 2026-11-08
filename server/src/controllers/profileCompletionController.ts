import type { Request, Response, NextFunction } from "express";
import type { User } from "@supabase/supabase-js";
import { profileService } from "../services/authService.js";
import { profileCompletionService } from "../services/profileCompletionService.js";
import { parseProfileAddress } from "../services/profileAddressService.js";
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
  const address = parseProfileAddress(req.body?.address ?? req.body?.location);
  if (address.error || !address.data) return res.status(400).json({ error: address.error });
  try {
    const { data: profile, error } = await profileService.getProfile(req.user.id);
    if (error || !profile) return res.status(503).json({ error: "Could not verify your profile." });
    const saved = await profileCompletionService.saveAddress(req.user.id, address.data);
    if (saved.error) return res.status(503).json({ error: saved.error });
    return res.json({ ...address.data, addressSource: "user-provided", locationConfirmed: false });
  } catch { return res.status(503).json({ error: "Could not save your address. Please try again." }); }
};
