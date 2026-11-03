import type { Request, Response } from "express";
import type { User } from "@supabase/supabase-js";

// Identity and device verification, including the disabled-account check, are
// performed by authenticate. Reuse that lookup instead of fetching /profile.
export const getSession = (req: Request & { user?: User; token?: string }, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  if (!req.user || !req.token) return res.status(401).json({ error: "Unauthorized" });
  const session = res.locals.verifiedSession;
  if (!session || session.userId !== req.user.id || !["user", "admin", "super_admin"].includes(session.role)) {
    return res.status(503).json({ error: "Account verification is temporarily unavailable." });
  }
  return res.json({ userId: session.userId, role: session.role });
};
