import type { Response } from "express";
import { uploadService } from "../services/uploadService.js";

type AuthRequest = import("express").Request & {
  user?: { id: string };
  token?: string;
};

export const uploadImage = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

  const { base64, filename, contentType } = req.body ?? {};

  if (!base64 || typeof base64 !== "string") {
    return res.status(400).json({ error: "Base64 image data is required" });
  }

  const { data, error } = await uploadService.uploadImage(
    base64,
    filename || "photo.jpg",
    contentType
  );

  if (error) return res.status(500).json({ error });
  if (!data) return res.status(500).json({ error: "Upload failed" });

  res.json({ url: data.url });
};