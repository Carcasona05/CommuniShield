import type { Request, Response } from "express";
import type { User } from "@supabase/supabase-js";
import { sentimentDatasetService as service } from "../services/sentimentDatasetService.js";
import { DatasetInputError, readDatasetInput, samplesToCsv } from "../services/sentimentDatasetValidation.js";

type AuthRequest = Request & { user?: User };
const uuid = (id: unknown) => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const validVersion = (version: unknown) => Number.isInteger(version) && Number(version) > 0;
function databaseError(res: Response, error: { code?: string; message?: string }) {
  if (error.code === "23505") return res.status(409).json({ error: "An example was submitted by another admin or has conflicting labels. Preview again." });
  if (error.code === "40001") return res.status(409).json({ error: "Dataset changed. Refresh and try again." });
  if (error.code === "42501") return res.status(403).json({ error: "You do not have permission for this dataset action." });
  if (error.code === "P0002") return res.status(404).json({ error: "Dataset or example not found." });
  if (["22023", "23514"].includes(error.code || "")) return res.status(400).json({ error: error.code === "22023" ? error.message : "Invalid dataset values." });
  console.error("Sentiment dataset database error:", error.code, error.message);
  return res.status(500).json({ error: "Dataset storage is unavailable. Ensure the sentiment_datasets migration has been applied." });
}
function failure(res: Response, error: unknown) {
  if (error instanceof DatasetInputError) return res.status(400).json({ error: error.message });
  console.error("Sentiment dataset request failed:", error instanceof Error ? error.message : "Unknown error");
  return res.status(500).json({ error: "Could not complete the dataset request." });
}

export const previewDataset = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  try {
    const { data, error } = await service.preview(readDatasetInput(req.body));
    if (error) return databaseError(res, error);
    return res.json({ rows: data, validCount: data!.filter((row) => row.status === "valid").length });
  } catch (error) { return failure(res, error); }
};

export const submitDataset = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  try {
    const { name, source } = req.body || {};
    if (typeof name !== "string" || !name.trim() || name.trim().length > 120 || !["manual", "csv"].includes(source)) throw new DatasetInputError("Provide a dataset name (1–120 characters) and manual or csv source.");
    if (name.includes("\0")) throw new DatasetInputError("Dataset name contains unsupported characters.");
    if (req.body.privacy_reviewed !== true) throw new DatasetInputError("Confirm the examples were reviewed for sensitive information and permitted use.");
    const { data, error } = await service.preview(readDatasetInput(req.body));
    if (error) return databaseError(res, error);
    if (data!.some((row) => row.status !== "valid")) return res.status(409).json({ error: "Only valid, non-duplicate examples can be submitted. Preview again.", rows: data });
    const result = await service.mutate(req.user.id, "submit", { name: name.trim(), source, privacy_reviewed: true, rows: data!.map(({ text, language, label, text_key }) => ({ text, language, label, text_key })) });
    if (result.error) return databaseError(res, result.error);
    return res.status(201).json({ ...result.data, message: "Dataset submitted for approval. The active models are unchanged." });
  } catch (error) { return failure(res, error); }
};

export const listDatasets = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  try {
    const status = String(req.query.status || "all");
    const page = Number(req.query.page || 1);
    if (!["all", "pending", "approved", "rejected", "archived"].includes(status) || !Number.isInteger(page) || page < 1 || page > 100000) throw new DatasetInputError("Invalid dataset status or page.");
    const { data, error, count } = await service.list(status, page);
    if (error) return databaseError(res, error);
    return res.json({ datasets: data, total: count || 0, page, viewerId: req.user.id });
  } catch (error) { return failure(res, error); }
};

export const getDataset = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  try {
    const page = Number(req.query.page || 1);
    if (!uuid(req.params.id) || !Number.isInteger(page) || page < 1 || page > 40) throw new DatasetInputError("Invalid dataset ID or sample page.");
    const { data, error } = await service.detail(String(req.params.id), page);
    if (error) return databaseError(res, error);
    if (!data) return res.status(404).json({ error: "Dataset not found." });
    return res.json(data);
  } catch (error) { return failure(res, error); }
};

export const editDatasetSample = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  try {
    if (!uuid(req.params.id) || !uuid(req.params.sampleId) || !validVersion(req.body?.version)) throw new DatasetInputError("Provide valid IDs and the current dataset version.");
    const sample = req.body?.sample;
    const { data, error } = await service.preview(readDatasetInput({ rows: [sample] }), String(req.params.sampleId));
    if (error) return databaseError(res, error);
    if (data![0]!.status !== "valid") return res.status(400).json({ error: data![0]!.message });
    const { text, language, label, text_key } = data![0]!;
    const result = await service.mutate(req.user.id, "edit", { dataset_id: req.params.id, sample_id: req.params.sampleId, version: req.body.version, sample: { text, language, label, text_key } });
    if (result.error) return databaseError(res, result.error);
    return res.json({ message: "Pending example updated. History preserved." });
  } catch (error) { return failure(res, error); }
};

export const reviewDataset = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  try {
    const { action, version, note = "" } = req.body || {};
    if (!uuid(req.params.id) || !["approve", "reject", "archive"].includes(action) || !validVersion(version) || typeof note !== "string" || note.length > 1000 || note.includes("\0") || (action === "reject" && !note.trim())) throw new DatasetInputError("Provide an action, current version, and a rejection reason when rejecting (maximum 1,000 characters).");
    if (action === "approve" && !await service.trainingReady()) return res.status(503).json({ error: "Apply sentiment_training_jobs.sql before approval so automatic retraining can be queued safely." });
    const result = await service.mutate(req.user.id, action, { dataset_id: req.params.id, version, note: note.trim() });
    if (result.error) return databaseError(res, result.error);
    return res.json({ message: action === "approve" ? "Approved. Automatic retraining queued; keep the Python worker running. Activation remains a separate super-admin action." : "Dataset status updated. History preserved." });
  } catch (error) { return failure(res, error); }
};

export const exportDataset = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  try {
    if (!uuid(req.params.id)) throw new DatasetInputError("Invalid dataset ID.");
    const format = String(req.query.format || "csv");
    if (!["csv", "json"].includes(format)) throw new DatasetInputError("Export format must be csv or json.");
    const { data, error } = await service.export(req.user.id, String(req.params.id), format);
    if (error) return databaseError(res, error);
    if (!data) return res.status(409).json({ error: "Only approved datasets can be exported for training." });
    if (format === "json") {
      res.setHeader("Content-Disposition", `attachment; filename="sentiment-${req.params.id}.json"`);
      return res.json(data);
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="sentiment-${req.params.id}.csv"`);
    return res.send(samplesToCsv(data.samples));
  } catch (error) { return failure(res, error); }
};
