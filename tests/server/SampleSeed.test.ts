/** Guards the generated Supabase seed (DB_Schema/seed/*.sql): coordinates,
 * clustering, outlook gates, schema columns, CHECK values and row counts.
 * Run with the normal server test suite: npm test */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildSampleModel, generateSampleSeedSql, INCIDENT_TYPES,
  SEED_CLUSTERS, SEED_COUNTS, SEED_HISTORY_DAYS, SEED_REPORTS, SEED_POSTERS, SEED_COMMENTERS,
} from "../../server/scripts/seed/sampleData.js";
import { ARGAO_BARANGAY_NAMES, barangaysAtCoordinates, deriveBarangay } from "../../server/src/utils/argaoLocation.js";
import { clusterHotspots } from "../../server/src/services/hotspotClusteringService.js";
import { buildRiskOutlook } from "../../server/src/services/riskOutlookService.js";
import { reportNarrative } from "../../server/scripts/seed/realisticNarratives.js";

const DAY = 86400000;
const model = buildSampleModel();
const sql = generateSampleSeedSql();
const authoredBodies = new Set([
  ...model.reports.map((report) => report.details.slice("Sample report: ".length)),
  ...model.comments.map((comment) => comment.content.slice("Sample comment: [SIMULATED] ".length)),
]);

const schemaText = [
  "reports_schema.sql", "credibility_schema.sql", "admins_schema.sql",
  "notifications_schema.sql", "emergency_facilities_schema.sql", "profiles_schema.sql",
  "migrations/sentiment_datasets.sql", "migrations/add_unified_sentiment_analysis.sql",
].map((file) => readFileSync(new URL(`../../DB_Schema/${file}`, import.meta.url), "utf8")).join("\n");

/** Extracts one statement (statements never contain ';' inside row text). */
function statement(source: string, needle: string, occurrence = 0) {
  let index = -1;
  for (let attempt = 0; attempt <= occurrence; attempt++) index = source.indexOf(needle, index + 1);
  assert.notEqual(index, -1, `expected an insert for ${needle}`);
  const end = source.indexOf(";", index);
  assert.notEqual(end, -1, `unterminated statement for ${needle}`);
  return source.slice(index, end + 1);
}

/** Counts tuple rows in one statement, depth-aware (rows may contain calls). */
function rowCount(stmt: string) {
  const keyword = /\bvalues\b/.exec(stmt);
  if (!keyword) return 0;
  let body = stmt.slice(keyword.index + keyword[0].length);
  const stop = body.search(/\n(?:on conflict|\) as |left join |join |select )/);
  if (stop !== -1) body = body.slice(0, stop);
  let depth = 0;
  let rows = 0;
  let inString = false;
  for (const character of body) {
    if (inString) { if (character === "'") inString = false; continue; }
    if (character === "'") { inString = true; continue; }
    if (character === "(") { if (depth === 0) rows++; depth += 1; }
    else if (character === ")") depth = Math.max(0, depth - 1);
  }
  return rows;
}

/** Machine uuid shape: 8-4-4-4-12 lowercase hex. */
const UUID_SHAPE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID_LITERAL = new RegExp(`^${UUID_SHAPE}$`);
const UUID_GLOBAL = new RegExp(UUID_SHAPE, "g");

/** Every quoted literal must be a synthetic label, a known-good value, or a
 * machine value; anything else is a CHECK-constraint risk. */
function assertQuotedLiterals(stmt: string, allowed: Set<string>, label: string) {
  for (const match of stmt.matchAll(/'((?:[^']|'')*)'/g)) {
    const value = match[1]!.replace(/''/g, "'");
    if (value === "" || value === "poster" || value === "commenter") continue;
    if (authoredBodies.has(value)) continue; // authored narrative bodies are not CHECK vocabulary
    if (/^\d+ (days|hours)$/.test(value)) continue; // interval literals
    if (value.startsWith("Sample ") || value.includes(", Argao, Cebu") ||
        value.includes("@communishield.test") || /^[0-9a-f]{32}$/.test(value) ||
        UUID_LITERAL.test(value) || // uuid keys are checked by their own test
        value.startsWith("CommuniShield-AI")) continue;
    assert.ok(allowed.has(value), `${label}: unexpected literal '${value}' (CHECK constraint risk)`);
  }
}

const REPORT_STATUSES = new Set(["Pending Review", "Under Verification", "Resolved", "Rejected", "Archived", "Marked Fake"]);
const REPORT_LABELS = new Set(["positive", "neutral", "negative", "mixed", "unclear"]);
const SENTIMENT_LANGUAGES = new Set(["english", "filipino", "cebuano", "unknown"]);
const SENTIMENT_PROVIDERS = new Set(["local", "gemini", "ensemble", "none"]);
const SENTIMENT_STATUSES = new Set(["pending", "succeeded", "failed", "unavailable", "skipped"]);

test("generated SQL is deterministic, transactional and cleans up its own rows only", () => {
  assert.equal(sql, generateSampleSeedSql(), "generation must be deterministic");
  assert.ok(Buffer.byteLength(sql, "utf8") < 950 * 1024, "keep the SQL under 950 KB in UTF-8");
  assert.equal(readFileSync(new URL("../../DB_Schema/seed/communishield_sample_seed.sql", import.meta.url), "utf8"), sql,
    "the paste-ready file must match the current generator");
  assert.match(sql, /^begin;$/m, "all rows must insert inside one transaction");
  assert.match(sql, /^commit;$/m);
  assert.doesNotMatch(sql, /encrypted_password|crypt\(|gen_salt\(|SamplePass123!/);
  assert.ok(!/\$2[aby]\$/.test(sql), "no pre-computed bcrypt hash may be committed");
  assert.match(sql, /where id::text like 'a1b2c3d4-%'/, "report cleanup must match the fixed UUID namespace");
  // Children are deleted before their parents so foreign keys never block.
  for (const table of ["sentiment_dataset_events", "sentiment_training_samples", "sentiment_datasets", "report_validations", "report_credibility_analysis", "sentiment_analysis", "report_images", "report_likes", "report_comments", "credibility_events", "admin_announcement", "emergency_facilities", "notifications", "audit_logs"]) {
    assert.match(sql, new RegExp(`delete from public\\.${table}\\b`), `${table} must be cleared before re-seeding`);
  }
  assert.match(sql, /on conflict \(subject_type, subject_id\) do nothing/, "sentiment rows must stay idempotent");
  assert.match(sql, /encode\(digest\(v\.text, 'sha256'\), 'hex'\)/, "training samples need schema-valid text_key values");
});

test("every seeded pin lies inside its own Argao barangay and resolves to it", () => {
  // 34 planted pins (7+6+6+5+5+5) plus one noise pin in each of 12 barangays.
  assert.equal(model.coordinates.length, 46, "34 cluster pins plus 12 noise pins");
  for (const coordinate of model.coordinates) {
    assert.ok(barangaysAtCoordinates(coordinate.latitude, coordinate.longitude).includes(coordinate.barangay),
      `${coordinate.label} must fall inside the ${coordinate.barangay} boundary`);
    const location = `${coordinate.barangay}, ${coordinate.label}, Argao, Cebu`;
    assert.equal(deriveBarangay(location, { latitude: coordinate.latitude, longitude: coordinate.longitude }),
      coordinate.barangay, `${coordinate.label} must resolve back to its own barangay`);
  }
  // Reports resolve through coordinates (clustered) or their address (all).
  for (const report of model.reports) {
    assert.equal(deriveBarangay(report.location, { latitude: report.latitude, longitude: report.longitude }),
      report.location.split(",")[0], `report ${report.index} resolves to the wrong barangay`);
  }
});

test("planted clusters survive the production clustering engine and noise never clusters", () => {
  const now = Date.now();
  const rows = model.reports.map((report) => ({
    id: report.id, latitude: report.latitude, longitude: report.longitude,
    location: report.location, status: report.status,
    created_at: new Date(now - report.dayOffset * DAY).toISOString(),
  }));
  const result = clusterHotspots(rows, { now });

  // The engine keeps active reports from the last 30 days only; mirror that
  // rule to check exactly which pins are eligible to appear at all.
  const active = new Set(["pending review", "under verification"]);
  const windowStart = now - 30 * DAY;
  const eligible = (row: { status: string; created_at: string }) =>
    active.has(row.status.toLowerCase()) && Date.parse(row.created_at) >= windowStart;
  const eligiblePins = new Set(rows.filter(eligible).map((row) => `${row.latitude},${row.longitude}`));

  assert.equal(result.clusters.length, SEED_CLUSTERS,
    `expected ${SEED_CLUSTERS} hotspots, got ${result.clusters.length} (noise pins must never cluster)`);
  assert.equal(result.summary.excluded.outsideBoundary, 0, "no seeded pin may fall outside Argao");
  assert.equal(result.summary.uniqueLocationCount, eligiblePins.size,
    "each eligible pin must remain a distinct location (identical pins collapse)");

  for (const cluster of result.clusters) {
    assert.ok(cluster.uniqueLocationCount >= 4, `${cluster.location} needs at least 4 distinct locations`);
    assert.ok(cluster.reportCount >= 4);
    assert.ok(cluster.barangays.every((name) => ARGAO_BARANGAY_NAMES.includes(name)),
      "every hotspot must resolve to a real Argao barangay");
  }

  // Every eligible clustered report lands in a hotspot, and no eligible noise
  // report ever does: the scattered pins are far apart and never dense enough.
  const clusteredIds = new Set(result.clusters.flatMap((cluster) => cluster.reportIds));
  const noiseIds = new Set(result.noiseReportIds);
  for (const report of model.reports) {
    const row = rows.find((candidate) => candidate.id === report.id)!;
    if (!eligible(row)) continue;
    if (report.cluster) assert.ok(clusteredIds.has(report.id), `report ${report.index} must join its hotspot`);
    else {
      assert.ok(!clusteredIds.has(report.id), `noise report ${report.index} must never join a hotspot`);
      assert.ok(noiseIds.has(report.id), `noise report ${report.index} must be reported as noise`);
    }
  }

  // Each planted cluster maps to exactly one detected hotspot, bijectively.
  const assigned = new Map<string, string>();
  for (const planted of model.clusters) {
    const ids = new Set(model.reports.filter((report) => report.cluster === planted.id).map((report) => report.id));
    const hosts = result.clusters.filter((cluster) => cluster.reportIds.some((id) => ids.has(id)));
    assert.equal(hosts.length, 1, `${planted.id} must land in exactly one hotspot, found ${hosts.length}`);
    assert.ok([...ids].every((id) => hosts[0]!.reportIds.includes(id)),
      `${planted.id} reports must stay together (pins are pairwise under 300 m)`);
    assert.equal(assigned.get(hosts[0]!.key), undefined, `${hosts[0]!.key} must host only one planted cluster`);
    assigned.set(hosts[0]!.key, planted.id);
  }
});

test("the seeded history clears the real 7-day submitted-report outlook gates", () => {
  const now = Date.now();
  const rows = model.reports.map((report) => ({
    id: report.id, created_at: new Date(now - report.dayOffset * DAY).toISOString(),
    status: report.status, location: report.location, latitude: report.latitude, longitude: report.longitude,
  }));
  const outlook = buildRiskOutlook(rows, { now });
  assert.equal(outlook.status, "available",
    outlook.status === "insufficient_data" ? outlook.reasons.join(" ") : "");
  assert.ok(outlook.stats.historyDays >= 112, `history: ${outlook.stats.historyDays} complete days`);
  assert.ok(outlook.stats.reports >= 20 && outlook.stats.reportingDays >= 10);
  assert.ok(outlook.stats.daysSinceLatestReport !== null && outlook.stats.daysSinceLatestReport <= 3,
    "the outlook needs recent reporting activity");
  assert.ok("expectedReports" in outlook && outlook.expectedReports >= 0);
  assert.ok(outlook.range.upper >= outlook.range.lower, "the historical-error range must be ordered");
  assert.equal(outlook.excluded.location, 0, "every eligible report must resolve to a barangay");
  assert.equal(outlook.scope, "All Barangays");

  // At least one barangay scope must also clear the gates; the rest are
  // legitimately reported as insufficient data by the same honest policy.
  const scopes = ["Canbanua", "Poblacion", "Langtad"];
  const available = scopes.filter((barangay) => buildRiskOutlook(rows, { now, barangay }).status === "available");
  assert.ok(available.length >= 1, "at least one barangay scope must produce a forecast");
  const lamacan = buildRiskOutlook(rows, { now, barangay: "Lamacan" });
  assert.ok(lamacan.status === "available" || lamacan.status === "insufficient_data");
  if (lamacan.status === "insufficient_data") assert.ok(lamacan.reasons.length > 0);
});

test("every insert only references columns that exist in DB_Schema", () => {
  const tables = new Map<string, Set<string>>();
  for (const match of schemaText.matchAll(/create table if not exists public\.(\w+)\s*\(([\s\S]*?)\n\);/g)) {
    const table = match[1]!;
    const columns = tables.get(table) ?? new Set<string>();
    for (const line of match[2]!.split("\n")) {
      const column = line.match(/^ {2}([a-z_][a-z0-9_]*) /);
      if (column && !["unique", "primary", "constraint", "check", "foreign", "exclude"].includes(column[1]!)) columns.add(column[1]!);
    }
    tables.set(table, columns);
  }

  const inserts = [...sql.matchAll(/^insert into ((?:public|auth)\.\w+) \(([^)]*)\)/gm)];
  assert.ok(inserts.length >= 18, `expected at least 18 inserts, found ${inserts.length}`);
  const skipped: string[] = [];
  for (const [, qualified, columnList] of inserts) {
    const table = qualified!.replace("public.", "");
    const columns = tables.get(table);
    if (!columns) { skipped.push(table); continue; } // Supabase-managed auth.users
    for (const column of columnList!.split(",").map((value) => value.trim())) {
      assert.ok(columns.has(column), `${qualified}: column '${column}' does not exist in DB_Schema`);
    }
  }
  assert.deepEqual(skipped, [], "every insert must target a known application table");
});

test("the SQL file is structurally balanced before anyone pastes it", () => {
  // Dollar quotes are used only for the two guard tags, always in pairs.
  const dollarTags = [...sql.matchAll(/\$[a-z_]+\$/g)].map((match) => match[0]);
  const unexpectedTag = dollarTags.find((tag) => tag !== "$guard$" && tag !== "$stmt$");
  assert.equal(unexpectedTag, undefined, `unexpected dollar tag ${unexpectedTag}`);
  for (const tag of ["$guard$", "$stmt$"]) {
    const count = dollarTags.filter((value) => value === tag).length;
    assert.ok(count >= 2 && count % 2 === 0, `${tag} appears ${count} times; it must open and close in pairs`);
  }
  // Single pass that respects strings and line comments.
  let depth = 0;
  let inString = false;
  let inComment = false;
  for (let index = 0; index < sql.length; index++) {
    const character = sql[index]!;
    if (inComment) { if (character === "\n") inComment = false; continue; }
    if (inString) {
      if (character === "'") {
        if (sql[index + 1] === "'") { index += 1; continue; } // escaped quote
        inString = false;
      }
      continue;
    }
    if (character === "'") { inString = true; continue; }
    if (character === "-" && sql[index + 1] === "-") { inComment = true; continue; }
    if (character === "(") depth += 1;
    else if (character === ")") {
      depth -= 1;
      assert.ok(depth >= 0, `unexpected ')' at character ${index}`);
    }
  }
  assert.ok(!inString, "unterminated string literal");
  assert.equal(depth, 0, "unbalanced parentheses outside comments and strings");
  // Every statement must actually terminate.
  assert.equal((sql.match(/;/g) || []).length, sql.split(";").length - 1);
  assert.ok(sql.trimEnd().endsWith("commit;"), "the file must end with commit;");
});

test("every UUID is a quoted literal from this seed's fixed namespaces", () => {
  // Postgres lexes a bare `0000000a-0000-4000-…` as arithmetic and aborts the
  // whole transaction with "trailing junk after numeric literal", so every
  // uuid must live inside a string literal ('…'::uuid). Scan the file outside
  // strings and line comments: nothing uuid-shaped may appear there.
  let inString = false;
  let inComment = false;
  for (let index = 0; index < sql.length; index++) {
    const character = sql[index]!;
    if (inComment) { if (character === "\n") inComment = false; continue; }
    if (inString) {
      if (character === "'") {
        if (sql[index + 1] === "'") { index += 1; continue; }
        inString = false;
      }
      continue;
    }
    if (character === "'") { inString = true; continue; }
    if (character === "-" && sql[index + 1] === "-") { inComment = true; continue; }
    const candidate = sql.slice(index, index + 36);
    if (UUID_LITERAL.test(candidate)) {
      assert.fail(`bare uuid ${candidate} at character ${index} — wrap it in quotes: '${candidate}'::uuid`);
    }
  }
  // Every uuid anywhere (quoted or not) must come from this seed's namespaces,
  // so the re-run cleanup can never touch live rows.
  const namespaces = /^(a1b2c3d4|c0ffee00|d5e7d47a)-/;
  const seen = new Set<string>();
  for (const match of sql.matchAll(UUID_GLOBAL)) {
    seen.add(match[0]);
    assert.match(match[0], namespaces, `uuid outside this seed's namespaces: ${match[0]}`);
  }
  const minimum = SEED_REPORTS + model.comments.length + SEED_COUNTS.datasets;
  assert.ok(seen.size >= minimum, `expected at least ${minimum} distinct uuids, found ${seen.size}`);
});

test("relations a deployment may not have are skipped instead of failing", () => {
  // admin_posts is legacy (superseded by admin_announcement) and absent from
  // deployed databases — no statement may ever touch it.
  assert.doesNotMatch(sql, /(?:insert into|delete from) public\.admin_posts/,
    "admin_posts is not part of the deployed schema");
  // The tables a deployment may lack run inside to_regclass() guards whose
  // inner statement executes verbatim only when the relation exists.
  for (const table of ["emergency_facilities", "system_settings"]) {
    assert.match(sql, new RegExp(`to_regclass\\('public\\.${table}'\\)`),
      `${table} must be existence-guarded`);
    assert.match(sql, new RegExp(`raise notice 'CommuniShield seed: skipping public\\.${table} \\(relation not present\\)'`),
      `${table} must announce its skip`);
    const guard = new RegExp(
      `do \\$guard\\$[\\s\\S]*?to_regclass\\('public\\.${table}'\\)[\\s\\S]*?execute \\$stmt\\$[\\s\\S]*?` +
      `(?:insert into public\\.${table}|delete from public\\.${table})[\\s\\S]*?\\$stmt\\$;[\\s\\S]*?end \\$guard\\$;`
    );
    assert.match(sql, guard, `${table} must run through execute inside its guard`);
  }
  // Both facilities statements are guarded (cleanup delete and insert).
  assert.equal([...sql.matchAll(/to_regclass\('public\.emergency_facilities'\)/g)].length, 2,
    "emergency_facilities needs a guard for its cleanup delete and its insert");
});

test("existing accounts and credibility scores are never modified", () => {
  assert.doesNotMatch(sql, /(?:insert into|delete from|update)\s+(?:auth\.users|public\.profiles|public\.user_credibility)\b/i);
  assert.doesNotMatch(sql, /0000000a-|@communishield\.test/);
  assert.match(sql, /create extension if not exists pgcrypto;/);
  assert.match(sql, /set local search_path = extensions, public;/);
  assert.doesNotMatch(sql, /\bupdate public\./, "seeding must never run UPDATE statements");
  assert.ok(sql.indexOf("delete from public.credibility_events") < sql.indexOf("delete from public.reports"),
    "remove seed events before report deletion can null their report_id");
  assert.match(sql, /where reason like 'Sample credibility event % \(synthetic\)\.'/);
});

test("preflight resolves all 35 accounts before cleanup and distributes ownership", () => {
  assert.match(sql, /left join auth\.users u on lower\(u\.email\) = expected\.email/);
  assert.match(sql, /where p\.role = 'user' and p\.status = 'Active'/);
  assert.match(sql, /raise exception 'Sample seed stopped: missing or inactive user accounts\/profiles: %'/);
  assert.match(sql, /raise exception 'Sample seed stopped: an existing active admin or super-admin is required'/);
  assert.ok(sql.indexOf("raise exception") < sql.indexOf("delete from public."));
  assert.equal((sql.match(/create temporary table .* on commit drop as/g) || []).length, 2);
  for (let slot = 1; slot <= SEED_POSTERS; slot++) assert.ok(sql.includes(`'poster${slot}@communishield.local'`));
  for (let slot = 1; slot <= SEED_COMMENTERS; slot++) assert.ok(sql.includes(`'commenter${slot}@communishield.local'`));
  const reports = statement(sql, "insert into public.reports");
  const comments = statement(sql, "insert into public.report_comments");
  const slots = (text: string, kind: string) => [...text.matchAll(new RegExp(`pg_temp\\.sample_seed_user\\('${kind}', (\\d+)\\)`, "g"))].map((m) => Number(m[1]));
  const posters = slots(reports, "poster");
  const commenters = slots(comments, "commenter");
  assert.equal(posters.length, SEED_REPORTS);
  assert.equal(commenters.length, SEED_COUNTS.comments);
  assert.equal(new Set(posters).size, SEED_POSTERS);
  assert.equal(new Set(commenters).size, SEED_COMMENTERS);
  assert.ok(posters.every((slot) => slot >= 1 && slot <= SEED_POSTERS));
  assert.ok(commenters.every((slot) => slot >= 1 && slot <= SEED_COMMENTERS));
  assert.doesNotMatch(reports, /sample_seed_user\('commenter'/);
  assert.doesNotMatch(comments, /sample_seed_user\('poster'/);
  assert.match(reports, /a\.display_name, 'Username'/, "show actual existing-account names");
});

test("row counts match the documented sample sizes", () => {
  const expected: Array<[string, number, number?]> = [
    ["insert into public.reports", SEED_REPORTS],
    ["insert into public.report_credibility_analysis", model.credibility.length],
    ["insert into public.sentiment_analysis", model.sentiment.length, 0],
    ["insert into public.report_comments", SEED_COUNTS.comments],
    ["insert into public.sentiment_analysis", SEED_COUNTS.comments, 1],
    ["insert into public.report_likes", SEED_COUNTS.likes],
    ["insert into public.report_images", SEED_COUNTS.images],
    ["insert into public.report_validations", SEED_COUNTS.validations],
    ["insert into public.audit_logs", SEED_COUNTS.logs],
    ["insert into public.notifications", SEED_COUNTS.notifications],
    ["insert into public.credibility_events", SEED_COUNTS.credibilityEvents],
    ["insert into public.admin_announcement", SEED_COUNTS.announcements],
    ["insert into public.emergency_facilities", SEED_COUNTS.facilities],
    ["insert into public.sentiment_datasets", SEED_COUNTS.datasets],
    ["insert into public.sentiment_training_samples", SEED_COUNTS.datasetSamples],
    ["insert into public.sentiment_dataset_events", SEED_COUNTS.datasetEvents],
    ["insert into public.notification_types", 8],
  ];
  for (const [needle, expectedRows, occurrence] of expected) {
    assert.equal(rowCount(statement(sql, needle, occurrence)), expectedRows, `${needle} row count`);
  }
  // The header summary must not oversell the file.
  assert.match(sql, new RegExp(`-- Data: ${SEED_REPORTS} reports over ${SEED_HISTORY_DAYS} days`));
});

test("narratives are varied, multilingual and visibly simulated, not numbered placeholders", () => {
  const narratives = new Set(model.reports.map((r) => r.details.replace(/#\d+/g, "#")));
  assert.ok(narratives.size >= 500, "entry numbers alone must not provide narrative variety");
  for (const report of model.reports) {
    assert.match(report.details, /^Sample report: \[SIMULATED #\d+\]/);
    assert.ok(report.details.includes(report.location.split(",")[0]!));
    assert.ok(report.details.length >= 150, "reports need concrete context, not a one-line placeholder");
    assert.doesNotMatch(report.details, /synthetic prototype test entry/);
  }
  assert.deepEqual(new Set(model.sentiment.map((s) => s.language)), new Set(["cebuano", "filipino", "english"]));
  assert.deepEqual(new Set(model.comments.map((c) => c.language)), new Set(["cebuano", "filipino", "english"]));
  assert.ok(model.comments.some((c) => c.content.length < 70), "include brief conversational replies");
  assert.ok(model.comments.some((c) => c.content.length > 160), "include more detailed replies too");
  assert.match(sql, /concat\('Sample report: ', v\.details\)/);
  assert.match(sql, /concat\('Sample comment: \[SIMULATED\] ', v\.content\)/);
  assert.match(sql, /v\.input_hash, r\.details, v\.error_code/, "analysis source text must use the full persisted narrative");
  assert.match(sql, /drop function pg_temp\.sample_seed_user\(text, integer\);/);
});

test("threads have uneven engagement and chronological replies after the parent report", () => {
  const parents = new Map(model.reports.map((r) => [r.id, r]));
  const byReport = new Map<string, typeof model.comments>();
  for (const comment of model.comments) {
    const report = parents.get(comment.reportId)!;
    assert.ok(report);
    const age = comment.dayOffset * 1440 + comment.minuteOffset;
    assert.ok(age >= 0 && age < report.dayOffset * 1440 + report.minuteOffset);
    const thread = byReport.get(comment.reportId) || [];
    if (thread.length) {
      const prior = thread[thread.length - 1]!;
      assert.ok(age < prior.dayOffset * 1440 + prior.minuteOffset, "later replies must have later timestamps");
    }
    assert.match(comment.content, /^Sample comment: \[SIMULATED\]/);
    thread.push(comment);
    byReport.set(comment.reportId, thread);
  }
  assert.ok(byReport.size > 100 && byReport.size < 300);
  assert.ok(model.reports.length - byReport.size > 300, "not every report receives a reply");
  assert.ok([...byReport.values()].some((thread) => thread.length === 1));
  assert.ok([...byReport.values()].some((thread) => thread.length >= 10));
  for (const thread of byReport.values()) {
    assert.equal(new Set(thread.map((c) => c.content)).size, thread.length,
      "a discussion must not repeat exactly the same comment");
  }
});

test("synthetic analysis fixtures match authored language and scenario, never emotional intensity", () => {
  const parents = new Map(model.reports.map((r) => [r.id, r]));
  for (const analysis of model.sentiment) {
    const report = parents.get(analysis.reportId)!;
    const expected = reportNarrative(report.index, report.typeName, report.location.split(",")[0]!, report.status);
    assert.equal(analysis.sourceText, report.details);
    assert.equal(analysis.language, expected.language);
    if (analysis.status === "succeeded") assert.equal(analysis.label, expected.label);
  }
  for (const review of model.credibility) {
    const report = parents.get(review.reportId)!;
    if (["Suspicious Person", "Suspicious Vehicle", "Public Disturbance", "Lost Item", "Streetlight Outage"].includes(report.typeName)) {
      assert.equal(review.severity, "Low", "uncertainty or worry alone cannot imply high danger");
    }
    if (report.typeName === "Fire Incident") assert.equal(review.severity, "Critical");
    assert.match(review.review, /\[SIMULATED\]/);
  }
});

test("seeded values stay inside every schema CHECK constraint", () => {
  // Incident types must exist in the schema's seeded list.
  const schemaTypes = new Set([...readFileSync(new URL("../../DB_Schema/reports_schema.sql", import.meta.url), "utf8")
    .matchAll(/\('([^']+)', '([^']+)'\)/g)].map((match) => match[2]!));
  for (const type of INCIDENT_TYPES) assert.ok(schemaTypes.has(type), `'${type}' is not a seeded incident type`);

  for (const report of model.reports) {
    assert.ok(REPORT_STATUSES.has(report.status), `report ${report.index}: ${report.status}`);
    assert.ok(["Fullname", "Username"].includes(report.displayNameType), report.displayNameType);
    assert.ok(INCIDENT_TYPES.includes(report.typeName), report.typeName);
    assert.ok(report.location.startsWith(`${report.location.split(",")[0]}, `));
  }
  for (const row of model.sentiment) {
    assert.ok(REPORT_LABELS.has(row.label), row.label);
    assert.ok(SENTIMENT_LANGUAGES.has(row.language), row.language);
    assert.ok(SENTIMENT_PROVIDERS.has(row.provider), row.provider);
    assert.ok(SENTIMENT_STATUSES.has(row.status), row.status);
    assert.ok(row.confidence >= 0 && row.confidence <= 1, String(row.confidence));
  }
  for (const comment of model.comments) {
    assert.ok(REPORT_LABELS.has(comment.label), comment.label);
    assert.ok(SENTIMENT_LANGUAGES.has(comment.language), comment.language);
    assert.ok(SENTIMENT_PROVIDERS.has(comment.provider), comment.provider);
    assert.ok(SENTIMENT_STATUSES.has(comment.status), comment.status);
    assert.ok(comment.confidence >= 0 && comment.confidence <= 1, String(comment.confidence));
    assert.ok(comment.content.startsWith("Sample comment"), "seeded comments must label themselves synthetic");
  }
  for (const row of model.credibility) {
    assert.ok(["Low", "Medium", "High", "Critical"].includes(row.severity), row.severity);
    assert.ok(["Low", "Medium", "High"].includes(row.credibilityLevel), row.credibilityLevel);
    assert.ok(row.aiScore >= 0 && row.aiScore <= 100, String(row.aiScore));
    assert.ok(row.review.startsWith("Sample AI review:"), row.review);
  }

  // Literal-only statements: every quoted value must be allowed vocabulary.
  const reportsStmt = statement(sql, "insert into public.reports");
  assertQuotedLiterals(reportsStmt, new Set([...INCIDENT_TYPES, "Fullname", "Username", ...REPORT_STATUSES]), "reports");
  assert.ok(!/null/.test(reportsStmt), "every seeded report carries a boundary-checked coordinate");

  const reportSentiment = statement(sql, "insert into public.sentiment_analysis", 0);
  assertQuotedLiterals(reportSentiment, new Set([...REPORT_LABELS, ...SENTIMENT_LANGUAGES, ...SENTIMENT_PROVIDERS, ...SENTIMENT_STATUSES, "report", "argao_v1", "low_confidence"]), "report sentiment");

  const commentSentiment = statement(sql, "insert into public.sentiment_analysis", 1);
  assertQuotedLiterals(commentSentiment, new Set([...REPORT_LABELS, ...SENTIMENT_LANGUAGES, ...SENTIMENT_PROVIDERS, ...SENTIMENT_STATUSES, "comment", "argao_v1"]), "comment sentiment");

  const commentsStmt = statement(sql, "insert into public.report_comments");
  assertQuotedLiterals(commentsStmt, new Set(), "report_comments");

  const credibilityStmt = statement(sql, "insert into public.report_credibility_analysis");
  assertQuotedLiterals(credibilityStmt, new Set(["Low", "Medium", "High", "Critical", ...INCIDENT_TYPES,
    ". Unverified text. Scenario severity is not emotional tone."]), "credibility analysis");

  const validationsStmt = statement(sql, "insert into public.report_validations");
  assertQuotedLiterals(validationsStmt, new Set(["Pending Review", "Under Verification", "Resolved", "Rejected", "Archived", "Marked Fake"]), "report_validations");

  const logsStmt = statement(sql, "insert into public.audit_logs");
  assertQuotedLiterals(logsStmt, new Set(["Report Verified", "Report Rejected", "AI Analysis Completed", "Announcement Created", "Notification Sent", "System Settings Updated"]), "audit_logs");

  const notificationsStmt = statement(sql, "insert into public.notifications");
  assertQuotedLiterals(notificationsStmt, new Set(["report_status", "nearby_incident", "admin_account", "report_submitted", "ai_validation", "Low", "Medium", "High"]), "notifications");

  const facilitiesStmt = statement(sql, "insert into public.emergency_facilities");
  assertQuotedLiterals(facilitiesStmt, new Set(["police", "fire", "911"]), "emergency_facilities");

  const announcementsStmt = statement(sql, "insert into public.admin_announcement");
  assertQuotedLiterals(announcementsStmt, new Set(["Seminar", "Safety/Tips", "Curfew", "Announcement", "Road Closure", "Emergency", "Power Interruption", "Water Interruption", "Weather Advisory", "Public Advisory", "Medical Advisory", "Flood Advisory", "Fire Incident", "Earthquake", "Typhoon", "Others"]), "admin_announcement");

  const eventsStmt = statement(sql, "insert into public.credibility_events");
  assertQuotedLiterals(eventsStmt, new Set(["report_submitted", "report_verified", "report_rejected", "report_resolved", "penalty", "admin_adjustment"]), "credibility_events");

  const datasetsStmt = statement(sql, "insert into public.sentiment_datasets");
  assertQuotedLiterals(datasetsStmt, new Set([
    "csv", "manual", "approved", "pending", "rejected", "archived", "Awaiting review",
    "Reviewed: synthetic phrases kept for prototype training",
    "Rejected: wording needed clearer human review",
    "Archived: superseded by a later synthetic batch",
  ]), "sentiment_datasets");

  const samplesStmt = statement(sql, "insert into public.sentiment_training_samples");
  assertQuotedLiterals(samplesStmt, new Set(["cebuano", "filipino", "english", "positive", "neutral", "negative", "sha256", "hex"]), "sentiment_training_samples");
  assert.doesNotMatch(samplesStmt, /'mixed'|'unclear'/, "training sample labels are limited to positive/neutral/negative");

  const datasetEventsStmt = statement(sql, "insert into public.sentiment_dataset_events");
  assertQuotedLiterals(datasetEventsStmt, new Set(["submitted", "approved", "rejected", "archived", "manual", "csv", "count", "source", "note"]), "sentiment_dataset_events");
});
