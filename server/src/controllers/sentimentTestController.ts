import type { Request, Response } from "express";
import { sentimentService } from "../services/sentimentService.js";
import { getSentimentTestModels } from "../services/sentimentTestStatus.js";

export async function sentimentTestStatus(_req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  try { return res.json({ allowed: true, ...await getSentimentTestModels() }); }
  catch { return res.status(503).json({ error: "Model status is temporarily unavailable." }); }
}

type AuthRequest = Request & { user?: { id: string } };
const windows = new Map<string, { start: number; count: number; active: boolean }>();
const WINDOW_MS = 60_000;
export const sentimentTestDependencies = { testText: sentimentService.testText, now: () => Date.now() };

export async function testSentiment(req: AuthRequest, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  const text = req.body?.text;
  const context = req.body?.context;
  if (typeof text !== "string" || !text.trim() || text.length > 2000 ||
      (context !== undefined && (typeof context !== "string" || context.length > 600))) {
    return res.status(400).json({ error: "Enter 1–2,000 characters of text and at most 600 characters of context." });
  }
  const now = sentimentTestDependencies.now();
  for (const [id, window] of windows) if (!window.active && now - window.start >= WINDOW_MS) windows.delete(id);
  let window = windows.get(req.user.id);
  if (window?.active || (window && now - window.start < WINDOW_MS && window.count >= 5)) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "Please wait before testing again. Limit: five tests per minute, one at a time." });
  }
  if (!window || now - window.start >= WINDOW_MS) {
    window = { start: now, count: 0, active: false };
    windows.set(req.user.id, window);
  }
  window.count++;
  window.active = true;
  try {
    const result = await sentimentTestDependencies.testText(text.trim(), context?.trim() || undefined);
    // Never return upstream error bodies, prompts, credentials, or storage paths.
    if (result.errorCode) return res.status(503).json({ error: "No sentiment provider could complete this test. Check server configuration and try again." });
    return res.json({ prediction: result.prediction, saved: false });
  } catch {
    return res.status(503).json({ error: "The sentiment test could not complete. Please try again." });
  } finally {
    window.active = false;
  }
}
