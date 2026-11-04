import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../config/supabaseAdmin.js";

type AuthRequest = Request & { user?: { id: string } };
export function credibilityFailure(message: string) {
  if (message.includes("CREDIBILITY_SUSPENDED")) return { status: 403, code: "CREDIBILITY_RESTRICTED", error: "Posting and commenting are temporarily suspended. View the end date in Profile Details; access returns automatically when the suspension expires." };
  if (message.includes("CREDIBILITY_COMMENTS_DISABLED")) return { status: 403, code: "CREDIBILITY_RESTRICTED", error: "Commenting requires a credibility score of at least 40. View your access in Profile Details." };
  if (message.includes("CREDIBILITY_DAILY_LIMIT")) return { status: 429, code: "CREDIBILITY_DAILY_LIMIT", error: "You have reached your daily limit. Limits reset at midnight Philippine time. View your allowance in Profile Details." };
  return null;
}
export const getCredibilityAccess = async (req: AuthRequest, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  const { data, error } = await supabaseAdmin.rpc("credibility_access", { p_user: req.user.id });
  if (error || data?.policyVersion !== "timed-v1") return res.status(503).json({ error: "Timed credibility verification is unavailable. Check that the timed-suspension migration is applied." });
  return res.json(data);
};
export const requireCredibilityEditAccess = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  try {
    const { data, error } = await supabaseAdmin.rpc("credibility_access", { p_user: req.user.id });
    if (error || data?.policyVersion !== "timed-v1") return res.status(503).json({ error: "Could not verify timed credibility access. Check the database migration." });
    if (data.editAllowed !== true) return res.status(403).json({ ...credibilityFailure("CREDIBILITY_SUSPENDED"), access: data });
    next();
  } catch { return res.status(503).json({ error: "Could not verify credibility access." }); }
};
export const requireCredibilityWriteAccess = (action: "report" | "comment") => async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  try {
    const { data, error } = await supabaseAdmin.rpc("credibility_access", { p_user: req.user.id });
    if (error || data?.policyVersion !== "timed-v1") return res.status(503).json({ error: "Timed credibility verification is unavailable. Check the database migration." });
    if (data[`${action}Allowed`] !== true) {
      const failure = credibilityFailure(data.suspended ? "CREDIBILITY_SUSPENDED" : action === "comment" && data.commentLimit === 0 ? "CREDIBILITY_COMMENTS_DISABLED" : "CREDIBILITY_DAILY_LIMIT")!;
      return res.status(failure.status).json({ ...failure, access: data });
    }
    next();
  } catch { return res.status(503).json({ error: "Credibility verification is unavailable. Please try again." }); }
};
