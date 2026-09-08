import express from "express";
import { uploadImage } from "../controllers/uploadController.js";
import { authenticate } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/upload/image", authenticate, uploadImage);

export default router;