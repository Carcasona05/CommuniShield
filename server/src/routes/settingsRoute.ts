import express from "express";
import {
  getSettings,
  updateSettings,
} from "../controllers/settingsController.js";
import { authenticate, requireRole } from "../middlewares/authMiddleware.js";

const router = express.Router();
const adminOnly = requireRole(["admin", "super_admin"]);
const superAdminOnly = requireRole(["super_admin"]);

router.get("/admin/settings", authenticate, adminOnly, getSettings);
router.put("/admin/settings", authenticate, superAdminOnly, updateSettings);

export default router;