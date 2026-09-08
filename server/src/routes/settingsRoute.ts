import express from "express";
import {
  getSettings,
  updateSettings,
} from "../controllers/settingsController.js";
import { authenticate } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/admin/settings", authenticate, getSettings);
router.put("/admin/settings", authenticate, updateSettings);

export default router;