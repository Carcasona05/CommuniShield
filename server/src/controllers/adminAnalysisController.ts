import type { Request, Response } from "express";
import { adminAnalysisJobs } from "../services/adminAnalysisJobs.js";
import { profileService } from "../services/authService.js";
import { backgroundTasks } from "../services/backgroundTasks.js";

type AuthRequest = Request & { user?: { id: string } };
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
async function allowed(req: AuthRequest, res: Response) {
  if (!req.user?.id) { res.status(401).json({ error: "Unauthorized" }); return false; }
  const { data, error } = await profileService.getProfile(req.user.id);
  if (error) { res.status(503).json({ error: "Could not verify administrator access" }); return false; }
  if (!data || !["admin", "super_admin"].includes(data.role)) { res.status(403).json({ error: "Admin access only" }); return false; }
  return true;
}
export async function enqueueAdminAnalysis(req: AuthRequest, res: Response) {
  if (!await allowed(req, res)) return;
  const ids = req.body?.reportIds;
  if (!Array.isArray(ids) || !ids.length || ids.length > 50 || !ids.every(uuid)) return res.status(400).json({ error: "Select between 1 and 50 valid report IDs" });
  try {
    const batchId = await adminAnalysisJobs.enqueue(req.user!.id, [...new Set(ids as string[])]);
    backgroundTasks.schedule("admin analysis", () => adminAnalysisJobs.drain(1));
    return res.status(202).json({ batchId, state: "queued" });
  } catch (error) { return res.status(503).json({ error: error instanceof Error ? error.message : "Could not queue analysis" }); }
}
export async function getAdminAnalysisProgress(req: AuthRequest, res: Response) {
  if (!await allowed(req, res)) return;
  if (!uuid(req.params.id)) return res.status(400).json({ error: "Invalid analysis batch" });
  try {
    const progress = await adminAnalysisJobs.progress(req.params.id);
    if (!progress) return res.status(404).json({ error: "Analysis batch not found" });
    res.setHeader("Cache-Control", "no-store");
    if (["queued", "running"].includes(progress.state)) backgroundTasks.schedule("admin analysis recovery", () => adminAnalysisJobs.drain(1));
    return res.json(progress);
  } catch { return res.status(503).json({ error: "Analysis progress unavailable. Please retry." }); }
}

export async function getActiveAdminAnalysis(req: AuthRequest, res: Response) {
  if (!await allowed(req, res)) return;
  try {
    res.setHeader("Cache-Control", "no-store");
    return res.json({ batches: await adminAnalysisJobs.active(req.user!.id) });
  } catch { return res.status(503).json({ error: "Could not recover queued analysis. Please retry." }); }
}
