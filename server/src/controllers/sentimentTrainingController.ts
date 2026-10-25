import type { Request, Response } from "express";
import type { User } from "@supabase/supabase-js";
import { sentimentTrainingService } from "../services/sentimentTrainingService.js";

type AuthRequest = Request & { user?: User };
export const getSentimentTraining = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  try {
    const { data, error } = await sentimentTrainingService.status();
    if (error) return res.status(503).json({ error: "Training queue unavailable. Apply the sentiment_training_jobs migration first." });
    return res.json(data);
  } catch { return res.status(503).json({ error: "Could not load training status." }); }
};

export const manageSentimentTraining = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  const { action, jobId = null, generation = null, mode = "continue", datasetIds } = req.body || {};
  if (!["queue", "activate", "rollback"].includes(action) || (action !== "queue" && (!Number.isSafeInteger(generation) || generation < 0)) ||
    (action === "activate" && (typeof jobId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(jobId)))) {
    return res.status(400).json({ error: "Provide a valid training action, candidate ID, and current model generation." });
  }
  if (typeof mode !== "string" || !["continue", "fresh"].includes(mode)) {
    return res.status(400).json({ error: 'Provide a training mode of "continue" or "fresh".' });
  }
  if (datasetIds !== undefined && (!Array.isArray(datasetIds) || !datasetIds.length || datasetIds.length > 100 ||
    datasetIds.some((id: unknown) => typeof id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)))) {
    return res.status(400).json({error:'Select valid approved dataset IDs.'});
  }
  try {
    const { data, error } = await sentimentTrainingService.action(req.user.id, action, action === "activate" ? jobId : null, action === "queue" ? null : generation, mode, datasetIds);
    if (error) return res.status(error.code === "42501" ? 403 : error.code === "40001" ? 409 : error.code === "22023" ? 400 : 503).json({ error: ["22023", "40001"].includes(error.code || "") ? error.message : "Could not perform training action." });
    return res.json({ ...data, message: "Retraining queued. Keep the Python worker running. Built-in models are unchanged." });
  } catch {
    return res.status(503).json({ error: "Could not validate model artifacts. The active model is unchanged." });
  }
};
