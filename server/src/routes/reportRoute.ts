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
  getCommentStatuses,
  toggleLike,
  validateReport,
  getIncidentOptions,
  getAdminPosts,
  getAdminDashboard,
  getAdminAnalytics,
  createAdminAnnouncement,
  getAdminLogs,
  getAdminAnnouncements,
  getAdminBlotters,
  createAdminBlotter,
  updateAdminBlotter,
  deleteAdminBlotter,
  updateAdminAnnouncement,
  deleteAdminAnnouncement,
} from "../controllers/reportController.js";
import { authenticate, requireRole } from "../middlewares/authMiddleware.js";
import { getHotspotClusters } from "../controllers/hotspotClusteringController.js";
import { getRiskOutlook } from "../controllers/riskOutlookController.js";
import { getAdminOverview, getAdminMapReports, getAdminReportDetails, getValidationGroups } from "../controllers/adminFetchController.js";
import { requireCompleteUserProfile } from "../controllers/profileCompletionController.js";
import { getCredibilityAccess, requireCredibilityEditAccess, requireCredibilityWriteAccess } from "../controllers/credibilityController.js";

const router = express.Router();
const adminOnly = requireRole(["admin", "super_admin"]);

router.get("/reports", authenticate, getReports);
router.get("/reports/mine", authenticate, getMyReports);
router.get("/reports/:id", authenticate, getReport);
router.get("/reports/:id/comments", authenticate, getComments);
router.get("/reports/:id/comment-status", authenticate, getCommentStatuses);
router.post("/reports/:id/comments", authenticate, requireCompleteUserProfile, requireCredibilityWriteAccess("comment"), addComment);
router.post("/reports/:id/like", authenticate, toggleLike);
router.post("/reports/:id/status", authenticate, adminOnly, requireCredibilityEditAccess, validateReport);
router.post("/reports", authenticate, requireCompleteUserProfile, requireCredibilityWriteAccess("report"), createReport);
router.put("/reports/:id", authenticate, requireCompleteUserProfile, requireCredibilityEditAccess, updateReport);
router.delete("/reports/:id", authenticate, deleteReport);
router.get("/incidents/options", authenticate, getIncidentOptions);
router.get("/admin/posts", authenticate, adminOnly, getAdminPosts);
router.get("/admin/announcements", authenticate, adminOnly, getAdminAnnouncements);
router.get("/admin/blotters", authenticate, adminOnly, getAdminBlotters);
router.post("/admin/blotters", authenticate, adminOnly, createAdminBlotter);
router.put("/admin/blotters/:id", authenticate, adminOnly, updateAdminBlotter);
router.delete("/admin/blotters/:id", authenticate, adminOnly, deleteAdminBlotter);
router.get("/admin/dashboard", authenticate, adminOnly, getAdminDashboard);
router.get("/admin/overview", authenticate, adminOnly, getAdminOverview);
router.get("/admin/map-reports", authenticate, adminOnly, getAdminMapReports);
router.get("/admin/report-details", authenticate, adminOnly, getAdminReportDetails);
router.get("/admin/validation-groups", authenticate, adminOnly, getValidationGroups);
router.get("/admin/clusters", authenticate, adminOnly, getHotspotClusters);
router.get("/admin/risk-outlook", authenticate, adminOnly, getRiskOutlook);
router.get("/admin/analytics", authenticate, adminOnly, getAdminAnalytics);
router.post("/admin/announcements", authenticate, adminOnly, createAdminAnnouncement);
router.put("/admin/announcements/:id", authenticate, adminOnly, updateAdminAnnouncement);
router.delete("/admin/announcements/:id", authenticate, adminOnly, deleteAdminAnnouncement);
router.get("/admin/logs", authenticate, adminOnly, getAdminLogs);
router.get("/credibility/access", authenticate, getCredibilityAccess);

export default router;
