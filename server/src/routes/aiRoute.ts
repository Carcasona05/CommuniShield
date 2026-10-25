import express from "express";
import {
  getAIStatus,
  analyzeReport,
  batchAnalyzeReports,
  toggleAI,
  reanalyzeSentiment,
  reanalyzeAllSentiment,
} from "../controllers/aiController.js";
import { authenticate, requireRole } from "../middlewares/authMiddleware.js";
import { previewDataset, submitDataset, listDatasets, getDataset, editDatasetSample, reviewDataset, exportDataset } from "../controllers/sentimentDatasetController.js";
import { getSentimentTraining, manageSentimentTraining } from "../controllers/sentimentTrainingController.js";
import { listSupportingModels, manageSupportingModel } from "../controllers/supportingModelController.js";

const router = express.Router();

const adminOnly = requireRole(["admin", "super_admin"]);
const superAdminOnly = requireRole(["super_admin"]);

router.get("/sentiment/training", authenticate, adminOnly, getSentimentTraining);
router.post("/sentiment/training", authenticate, superAdminOnly, manageSentimentTraining);
router.get("/sentiment/supporting-models", authenticate, adminOnly, listSupportingModels);
router.post("/sentiment/supporting-models", authenticate, superAdminOnly, manageSupportingModel);

router.get("/sentiment/datasets", authenticate, adminOnly, listDatasets);
router.post("/sentiment/datasets/preview", authenticate, adminOnly, previewDataset);
router.post("/sentiment/datasets", authenticate, adminOnly, submitDataset);
router.get("/sentiment/datasets/:id", authenticate, adminOnly, getDataset);
router.patch("/sentiment/datasets/:id/samples/:sampleId", authenticate, adminOnly, editDatasetSample);
// The transaction also enforces that approval/rejection is super-admin only;
// admins can archive their own pending submission using this endpoint.
router.post("/sentiment/datasets/:id/review", authenticate, adminOnly, reviewDataset);
router.get("/sentiment/datasets/:id/export", authenticate, superAdminOnly, exportDataset);

router.get("/ai/status", authenticate, adminOnly, getAIStatus);
router.post("/ai/analyze/:id", authenticate, adminOnly, analyzeReport);
router.post("/ai/batch-analyze", authenticate, adminOnly, batchAnalyzeReports);
router.put("/ai/toggle", authenticate, superAdminOnly, toggleAI);
router.post("/ai/sentiment/reanalyze/:type/:id", authenticate, adminOnly, reanalyzeSentiment);
router.post("/ai/sentiment/reanalyze", authenticate, adminOnly, reanalyzeSentiment);
router.post("/ai/sentiment/reanalyze-all", authenticate, adminOnly, reanalyzeAllSentiment);

export default router;
