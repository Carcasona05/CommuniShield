import type { Request, Response, NextFunction } from "express";

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction, // eslint-disable-line @typescript-eslint/no-unused-vars
) => {
  console.error("[Error]", err.message);
  res.status(500).json({ error: "Internal server error" });
};
