import type { Request, Response } from "express";
import type { User } from "@supabase/supabase-js";
import { supportingModelService } from "../services/supportingModelService.js";
type AuthRequest = Request & { user?: User };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function listSupportingModels(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  const raw = req.query.page ?? "1";
  if (typeof raw !== "string" || !/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 1000) return res.status(400).json({ error: "Invalid page" });
  try {
    const result = await supportingModelService.list(Number(raw));
    if (result.error) return res.status(503).json({ error: "Supporting model pool unavailable. Apply sentiment_supporting_pool.sql first." });
    return res.json(result.data);
  } catch { return res.status(503).json({ error: "Could not load the supporting model pool." }); }
}
export async function manageSupportingModel(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  const { action, modelId = null, generation, limit } = req.body || {};
  if (!["enable", "disable", "archive", "restore", "delete", "set_limit"].includes(action) || !Number.isSafeInteger(generation) || generation < 0 ||
      (action !== "set_limit" && (typeof modelId !== "string" || !uuid.test(modelId))) ||
      (action === "set_limit" && (!Number.isInteger(limit) || limit < 1 || limit > 3))) return res.status(400).json({ error: "Provide a valid model action, ID and pool generation." });
  try {
    const result = await supportingModelService.action(req.user.id, action, action === "set_limit" ? null : modelId, generation, limit);
    if (result.error) return res.status(result.error.code === "42501" ? 403 : result.error.code === "40001" ? 409 : result.error.code === "22023" ? 400 : 503)
      .json({ error: ["40001", "22023"].includes(result.error.code || "") ? result.error.message : "Supporting model action failed." });
    return res.json({ ...result.data, message: "Supporting model pool updated. Built-in models are unchanged." });
  } catch { return res.status(503).json({ error: "Model action could not be verified. Built-in models are unchanged." }); }
}
