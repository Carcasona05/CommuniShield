import express from "express";
import {
  getNotifications,
  getLoginActivities,
  markNotificationRead,
  getAdminNotifications,
  markAdminNotificationRead,
} from "../controllers/notificationController.js";
import { authenticate } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/notifications", authenticate, getNotifications);
router.get("/notifications/login-activity", authenticate, getLoginActivities);
router.patch("/notifications/:id/read", authenticate, markNotificationRead);
router.get("/admin/notifications", authenticate, getAdminNotifications);
router.patch("/admin/notifications/:id/read", authenticate, markAdminNotificationRead);

export default router;