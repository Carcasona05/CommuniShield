import express from "express";
import {
  createReport,
  getReports,
  getMyReports,
  updateReport,
  deleteReport,
  addComment,
  getComments,
  toggleLike,
  validateReport,
  getIncidentOptions,
  getAdminPosts,
  getAdminDashboard,
  getAdminAnalytics,
  createAdminAnnouncement,
  getAdminLogs,
} from "../controllers/reportController.js";
import { authenticate } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/reports", authenticate, getReports);
router.get("/reports/mine", authenticate, getMyReports);
router.get("/reports/:id/comments", authenticate, getComments);
router.post("/reports/:id/comments", authenticate, addComment);
router.post("/reports/:id/like", authenticate, toggleLike);
router.post("/reports/:id/status", authenticate, validateReport);
router.post("/reports", authenticate, createReport);
router.put("/reports/:id", authenticate, updateReport);
router.delete("/reports/:id", authenticate, deleteReport);
router.get("/incidents/options", authenticate, getIncidentOptions);
router.get("/admin/posts", authenticate, getAdminPosts);
router.get("/admin/dashboard", authenticate, getAdminDashboard);
router.get("/admin/analytics", authenticate, getAdminAnalytics);
router.post("/admin/announcements", authenticate, createAdminAnnouncement);
router.get("/admin/logs", authenticate, getAdminLogs);

export default router;