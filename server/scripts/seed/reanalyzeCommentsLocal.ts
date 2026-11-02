/** Reanalyze existing comments only. Never inserts comments or calls Gemini.
 * From server/: node --import tsx scripts/seed/reanalyzeCommentsLocal.ts
 * Read stored results only: add --summary (no reanalysis or database writes).
 */
import "dotenv/config";
import { supabaseAdmin as db } from "../../src/config/supabaseAdmin.js";
import { sentimentService } from "../../src/services/sentimentService.js";
import { createLocalSentimentSummary, recordLocalSentimentResult } from "./localSentimentSummary.js";

async function main() {
  console.log("Loading existing comments...");
  const ids: string[] = [];
  let lastId: string | undefined;
  while (true) {
    let query = db.from("report_comments").select("id").order("id").limit(500);
    if (lastId) query = query.gt("id", lastId);
    const { data, error } = await query;
    if (error) throw error;
    for (const row of data || []) ids.push(row.id);
    if (!data || data.length < 500) break;
    lastId = data[data.length - 1]!.id;
  }
  const summary = createLocalSentimentSummary(ids.length);
  if (process.argv.includes("--summary")) {
    const existingIds = new Set(ids);
    const seen = new Set<string>();
    for (let from = 0; ; from += 500) {
      const { data, error } = await db.from("sentiment_analysis")
        .select("subject_id,label,status,provider,model,error_code")
        .eq("subject_type", "comment").order("id").range(from, from + 499);
      if (error) throw error;
      for (const result of data || []) {
        if (!existingIds.has(result.subject_id) || seen.has(result.subject_id)) continue;
        seen.add(result.subject_id);
        recordLocalSentimentResult(summary, result);
      }
      if (!data || data.length < 500) break;
    }
    console.log("Stored comment sentiment results (read-only; no reanalysis or database writes).");
    console.log(JSON.stringify({ ...summary, missing: ids.length - seen.size }));
    return;
  }
  console.log(`Reanalyzing ${ids.length} existing comments locally (built-in + qualified supports; two workers, no Gemini).`);
  let next = 0;
  const startedAt = Date.now();
  let lastPrintedAt = 0;
  const duration = (seconds: number) => {
    const value = Math.max(0, Math.round(seconds));
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const remaining = value % 60;
    return hours ? `${hours}h ${minutes}m ${remaining}s` : `${minutes}m ${remaining}s`;
  };
  function progress(final = false) {
    const processed = summary.succeeded + summary.unavailable + summary.pending + summary.failed;
    const now = Date.now();
    if (!final && !process.stdout.isTTY && processed !== 0 && processed % 10 !== 0 && now - lastPrintedAt < 5000) return;
    lastPrintedAt = now;
    const fraction = ids.length ? processed / ids.length : 1;
    const elapsed = (now - startedAt) / 1000;
    const eta = processed ? duration(elapsed / processed * (ids.length - processed)) : "calculating...";
    const filled = Math.round(fraction * 25);
    const bar = "#".repeat(filled) + "-".repeat(25 - filled);
    const text = `[${bar}] ${(fraction * 100).toFixed(1)}% | ${processed}/${ids.length} | OK ${summary.succeeded} | Unavailable ${summary.unavailable} | Pending ${summary.pending} | Failed ${summary.failed} | Elapsed ${duration(elapsed)} | ETA ${eta}`;
    if (process.stdout.isTTY) {
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      process.stdout.write(text + (final ? "\n" : ""));
    } else {
      console.log(text);
    }
  }
  progress();
  async function worker() {
    while (next < ids.length) {
      const id = ids[next++]!;
      try {
        const result = await sentimentService.analyze("comment", id, { force: true, localOnly: true });
        const outcome = recordLocalSentimentResult(summary, result);
        if (outcome !== "succeeded") {
          if (process.stdout.isTTY) { process.stdout.clearLine(0); process.stdout.cursorTo(0); }
          console.error(`Comment ${id}: ${outcome} (${result.error_code || result.status})`);
        }
      } catch (error) {
        summary.failed++;
        if (process.stdout.isTTY) {
          process.stdout.clearLine(0);
          process.stdout.cursorTo(0);
        }
        console.error(`Comment ${id}:`, error instanceof Error ? error.message : String(error));
      }
      progress();
    }
  }
  await Promise.all([worker(), worker()]);
  progress(true);
  console.log(JSON.stringify(summary));
  if (summary.failed || summary.unavailable || summary.pending) process.exitCode = 1;
}
main().catch(error => { console.error(error.message || error); process.exitCode = 1; });
