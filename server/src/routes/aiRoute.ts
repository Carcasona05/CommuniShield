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

const router = express.Router();

const adminOnly = requireRole(["admin", "super_admin"]);
const superAdminOnly = requireRole(["super_admin"]);

router.get("/ai/status", authenticate, adminOnly, getAIStatus);
router.post("/ai/analyze/:id", authenticate, adminOnly, analyzeReport);
router.post("/ai/batch-analyze", authenticate, adminOnly, batchAnalyzeReports);
router.put("/ai/toggle", authenticate, superAdminOnly, toggleAI);
router.post("/ai/sentiment/reanalyze/:type/:id", authenticate, adminOnly, reanalyzeSentiment);
router.post("/ai/sentiment/reanalyze", authenticate, adminOnly, reanalyzeSentiment);
router.post("/ai/sentiment/reanalyze-all", authenticate, adminOnly, reanalyzeAllSentiment);

export default router;