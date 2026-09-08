import type { Response } from "express";
import { facilityService } from "../services/facilityService.js";

type AuthRequest = import("express").Request & {
  user?: { id: string };
  token?: string;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const getNearbyFacilities = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({
      error: "Valid lat and lng query parameters are required",
    });
  }

  const radius = clamp(Number(req.query.radius) || 5000, 1000, 15000);

  try {
    const result = await facilityService.getNearby(lat, lng, radius);
    res.json({ facilities: result.data });
  } catch (err) {
    res.status(502).json({
      error: "Could not fetch nearby facilities",
      detail: err instanceof Error ? err.message : "Unknown error",
    });
  }
};