/** Resumable real-service reanalysis of this private test batch, with two workers.
 * node --import tsx scripts/seed/reanalyzePrivateTest.ts [--limit=1]
 * Checkpoint is local metadata, not fabricated database analysis.
 */
import "dotenv/config";
import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { supabaseAdmin as db } from "../../src/config/supabaseAdmin.js";
import { aiService } from "../../src/services/aiService.js";
import { sentimentService } from "../../src/services/sentimentService.js";

const checkpointPath = fileURLToPath(new URL("../../../artifacts/private-test-analysis/progress.json", import.meta.url));
type Outcome = { status: string; severity?: string; provider?: string; error?: string; at: string };
type Progress = { startedAt: string; updatedAt: string; total: number; results: Record<string, Outcome> };
const checkpoint: Progress = existsSync(checkpointPath)
  ? JSON.parse(readFileSync(checkpointPath, "utf8"))
  : { startedAt: new Date().toISOString(), updatedAt: "", total: 0, results: {} };
function save() {
  checkpoint.updatedAt = new Date().toISOString();
  mkdirSync(fileURLToPath(new URL("../../../artifacts/private-test-analysis/", import.meta.url)), { recursive: true });
  writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));
}
function summary() {
  const outcomes = Object.values(checkpoint.results);
  console.log(JSON.stringify({ total: checkpoint.total, succeeded: outcomes.filter(r => r.status === "succeeded").length,
    failed: outcomes.filter(r => r.status !== "succeeded").length,
    high: outcomes.filter(r => r.severity === "High").length,
    critical: outcomes.filter(r => r.severity === "Critical").length }));
}
async function main() {
  const commentsOnly = process.argv.includes("--comments-only");
  if (!commentsOnly && !await aiService.isEnabled()) throw new Error("AI scoring is disabled in system settings; no settings were changed.");
  const { data: reports, error: reportError } = await db.from("reports")
    .select("id,location,latitude,longitude,details,incident_types(name,incident_categories(name))")
    .gte("id", "7e571022-0000-4000-8001-000000000001")
    .lte("id", "7e571022-0000-4000-8001-000000000760").order("id").limit(1000);
  if (reportError) throw reportError;
  const { data: comments, error: commentError } = await db.from("report_comments").select("id")
    .gte("id", "7e571022-0000-4000-8002-000000000001")
    .lte("id", "7e571022-0000-4000-8002-000000000700").order("id").limit(1000);
  if (commentError) throw commentError;
  const tasks: Array<{ key: string; run: () => Promise<Outcome> }> = [];
  let geminiQuotaBlocked = false;
  // Prioritize the newly added risk scenarios, then the original posts.
  const prioritized = [...(reports || [])].sort((a, b) => Number(b.id.slice(-12)) - Number(a.id.slice(-12)));
  for (const report of prioritized) {
    tasks.push({ key: `credibility:${report.id}`, run: async () => {
      const type = report.incident_types as unknown as { name: string; incident_categories: { name: string } };
      const result = await aiService.analyzeReport(report.id, {
        incident_category: type.incident_categories.name, incident_type: type.name,
        details: report.details || "", location: report.location || "",
        latitude: report.latitude, longitude: report.longitude,
      });
      return { status: result.status, ...(result.status === "succeeded" ? { severity: result.severity } : { error: result.credibility_review }), at: new Date().toISOString() };
    } });
    tasks.push({ key: `report:${report.id}`, run: async () => {
      const result = await sentimentService.analyze("report", report.id, { force: true, localOnly: geminiQuotaBlocked });
      return { status: result.status, error: result.error_code || "", at: new Date().toISOString() };
    } });
  }
  for (const comment of comments || []) tasks.push({ key: `comment:${comment.id}`, run: async () => {
    const result = await sentimentService.analyze("comment", comment.id, { force: true, localOnly: true });
    return { status: result.status, provider: result.provider, error: result.error_code || "", at: new Date().toISOString() };
  } });
  checkpoint.total = tasks.length;
  const limitArg = process.argv.find(a => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;
  const pending = tasks.filter(task => {
    if (commentsOnly && !task.key.startsWith("comment:")) return false;
    const previous = checkpoint.results[task.key];
    return previous?.status !== "succeeded" || (task.key.startsWith("comment:") && previous.provider !== "local");
  }).slice(0, limit);
  console.log(`Found ${reports?.length || 0} reports, ${comments?.length || 0} comments; ${pending.length} analysis tasks to run (two workers).`);
  save();
  let index = 0;
  let finished = 0;
  async function worker() {
    while (index < pending.length) {
      const task = pending[index++]!;
      // Do not churn through every model/report after a quota exhaustion response.
      // Leave credibility tasks pending for the next run; sentiment can run locally.
      if (geminiQuotaBlocked && task.key.startsWith("credibility:")) continue;
      try { checkpoint.results[task.key] = await task.run(); }
      catch (error) { checkpoint.results[task.key] = { status: "failed", error: error instanceof Error ? error.message : String(error), at: new Date().toISOString() }; }
      const outcome = checkpoint.results[task.key]!;
      if (!geminiQuotaBlocked && /429|RESOURCE_EXHAUSTED|quota exceeded/i.test(outcome.error || "")) {
        geminiQuotaBlocked = true;
        console.log("Gemini quota exhausted: deferring remaining credibility tasks; continuing sentiment locally. No system settings changed.");
      }
      save();
      finished++;
      if (finished % 10 === 0 || checkpoint.results[task.key]?.status !== "succeeded") summary();
    }
  }
  await Promise.all([worker(), worker()]);
  summary();
  if (geminiQuotaBlocked) console.log("Credibility analysis remains incomplete until Gemini quota is available. Resume with this same command later.");
  console.log(`Progress saved to ${checkpointPath}. Rerun to retry unsuccessful tasks without repeating successes.`);
}
main().catch(error => { console.error(error.message || error); process.exitCode = 1; });
