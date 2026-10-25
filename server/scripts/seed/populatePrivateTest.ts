/** Private testing only. Fictional narratives, never verified incident records.
 * Uses existing test accounts; inserts only reports/comments, without replacing data.
 * Preview: node --import tsx scripts/seed/populatePrivateTest.ts
 * Execute: node --import tsx scripts/seed/populatePrivateTest.ts --apply
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { buildSampleModel, SEED_POSTERS, SEED_COMMENTERS } from "./sampleData.js";

config({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing Supabase server credentials.");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const apply = process.argv.includes("--apply");
const id = (kind: number, index: number) => `7e571022-0000-4000-800${kind}-${String(index + 1).padStart(12, "0")}`;

function clean(text: string): string {
  const result = text
    .replace(/^Sample report: \[SIMULATED #\d+\]\s*/i, "")
    .replace(/^Sample comment: \[SIMULATED\]\s*/i, "")
    .replace(/Dili ni tinuod nga hitabo\.|Hindi ito totoong pangyayari\.|This is not a real incident\./g, "")
    .trim();
  if (/\bsample\b|\bsimulated\b|\bsynthetic\b|prototype test/i.test(result)) {
    throw new Error("Unexpected testing label in visible content.");
  }
  return result;
}

async function main() {
  const expected = [
    ...Array.from({ length: SEED_POSTERS }, (_, i) => `poster${i + 1}@communishield.local`),
    ...Array.from({ length: SEED_COMMENTERS }, (_, i) => `commenter${i + 1}@communishield.local`),
  ];
  const accounts = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users) {
      const email = user.email?.toLowerCase();
      if (email && expected.includes(email)) accounts.set(email, user.id);
    }
    if (data.users.length < 1000) break;
  }
  const missing = expected.filter(email => !accounts.has(email));
  if (missing.length) throw new Error(`Missing existing accounts: ${missing.join(", ")}`);
  const { data: profiles, error: profileError } = await db.from("profiles")
    .select("id,user_name,fullname,role,status").in("id", [...accounts.values()]);
  if (profileError) throw profileError;
  const profileMap = new Map((profiles || []).map(p => [p.id, p]));
  for (const [email, userId] of accounts) {
    const profile = profileMap.get(userId);
    if (!profile || profile.role !== "user" || profile.status !== "Active") {
      throw new Error(`Account must have an active user profile: ${email}`);
    }
  }
  const { data: types, error: typeError } = await db.from("incident_types").select("id,name");
  if (typeError) throw typeError;
  const typeMap = new Map((types || []).map(t => [t.name, t.id]));
  const model = buildSampleModel();
  const now = Date.now();
  const reportMap = new Map(model.reports.map((r, i) => [r.id, id(1, i)]));
  const reports = model.reports.map((r, i) => {
    const email = `poster${i % SEED_POSTERS + 1}@communishield.local`;
    const userId = accounts.get(email)!;
    const profile = profileMap.get(userId)!;
    const typeId = typeMap.get(r.typeName);
    if (!typeId) throw new Error(`Missing incident type: ${r.typeName}`);
    const created = new Date(now - r.dayOffset * 86400000 - r.minuteOffset * 60000).toISOString();
    return {
      id: reportMap.get(r.id)!, user_id: userId, incident_type_id: typeId,
      location: r.location.replace(/Sample street (\d+)/gi, "Purok $1"),
      latitude: r.latitude, longitude: r.longitude,
      poster_name: profile.user_name || profile.fullname || email,
      display_name_type: "Username", details: clean(r.details), status: "Pending Review",
      created_at: created, updated_at: created,
    };
  });
  const comments = model.comments.map((c, i) => ({
    id: id(2, i), report_id: reportMap.get(c.reportId)!,
    user_id: accounts.get(`commenter${i % SEED_COMMENTERS + 1}@communishield.local`)!,
    content: clean(c.content),
    created_at: new Date(now - c.dayOffset * 86400000 - c.minuteOffset * 60000).toISOString(),
  }));
  console.log(`Validated ${accounts.size} existing accounts. Prepared ${reports.length} posts and ${comments.length} comments.`);
  console.log("Fictional private testing content; no accounts, AI results, admin actions or existing records will be modified.");
  console.log("Post preview:", reports[0]?.details);
  console.log("Comment preview:", comments[0]?.content);
  // Fixed, isolated UUID namespace makes reruns additive and safely resumable.
  async function insertMissing(table: string, rows: Array<{ id: string }>) {
    let inserted = 0;
    for (let offset = 0; offset < rows.length; offset += 100) {
      const batch = rows.slice(offset, offset + 100);
      const { data, error } = await db.from(table).select("id").in("id", batch.map(r => r.id));
      if (error) throw error;
      const existing = new Set((data || []).map(r => r.id));
      const pending = batch.filter(r => !existing.has(r.id));
      if (apply && pending.length) {
        const { error: insertError } = await db.from(table).insert(pending);
        if (insertError) throw insertError;
      }
      inserted += pending.length;
    }
    console.log(`${table}: ${inserted} ${apply ? "inserted" : "would insert"}; ${rows.length - inserted} already present.`);
    if (apply) {
      let verified = 0;
      for (let offset = 0; offset < rows.length; offset += 100) {
        const { count, error } = await db.from(table).select("id", { count: "exact", head: true })
          .in("id", rows.slice(offset, offset + 100).map(r => r.id));
        if (error) throw error;
        verified += count || 0;
      }
      if (verified !== rows.length) throw new Error(`${table}: expected ${rows.length}, found ${verified}`);
      console.log(`${table}: verified ${verified} stored records.`);
    }
  }
  await insertMissing("reports", reports);
  await insertMissing("report_comments", comments);
  if (!apply) console.log("Preview only. Pass --apply to insert into the configured private testing database.");
}

main().catch(error => { console.error(error.message || error); process.exitCode = 1; });
