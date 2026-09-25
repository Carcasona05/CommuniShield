import express from "express";
import {
  createReport,
  getReports,
  getReport,
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
import { authenticate, requireRole } from "../middlewares/authMiddleware.js";

const router = express.Router();
const adminOnly = requireRole(["admin", "super_admin"]);

router.get("/reports", authenticate, getReports);
router.get("/reports/mine", authenticate, getMyReports);
router.get("/reports/:id", authenticate, getReport);
router.get("/reports/:id/comments", authenticate, getComments);
router.post("/reports/:id/comments", authenticate, addComment);
router.post("/reports/:id/like", authenticate, toggleLike);
router.post("/reports/:id/status", authenticate, adminOnly, validateReport);
router.post("/reports", authenticate, createReport);
router.put("/reports/:id", authenticate, updateReport);
router.delete("/reports/:id", authenticate, deleteReport);
router.get("/incidents/options", authenticate, getIncidentOptions);
router.get("/admin/posts", authenticate, adminOnly, getAdminPosts);
router.get("/admin/dashboard", authenticate, adminOnly, getAdminDashboard);
router.get("/admin/analytics", authenticate, adminOnly, getAdminAnalytics);
router.post("/admin/announcements", authenticate, adminOnly, createAdminAnnouncement);
router.get("/admin/logs", authenticate, adminOnly, getAdminLogs);

export default router;