import express from "express";
import { getNearbyFacilities } from "../controllers/facilityController.js";
import { authenticate } from "../middlewares/authMiddleware.js";
import { adapt } from "../utils/adapt.js";

const router = express.Router();

router.get("/facilities/nearby", authenticate, adapt(getNearbyFacilities));

export default router;