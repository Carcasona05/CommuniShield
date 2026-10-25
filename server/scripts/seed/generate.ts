/**
 * Writes the synthetic sample-data SQL file to DB_Schema/seed/.
 * Run from server/: npm run seed:generate
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateSampleSeedSql, SEED_COUNTS, SEED_HISTORY_DAYS, SEED_REPORTS } from "./sampleData.js";

const target = resolve(dirname(fileURLToPath(import.meta.url)), "../../../DB_Schema/seed/communishield_sample_seed.sql");
mkdirSync(dirname(target), { recursive: true });
const sql = generateSampleSeedSql();
writeFileSync(target, sql);

const kb = Math.round(sql.length / 1024);
console.log(`Wrote ${target}`);
console.log(`${kb} KB | ${SEED_REPORTS} reports over ${SEED_HISTORY_DAYS} days | ${SEED_COUNTS.comments} comments | reuses ${SEED_COUNTS.users} existing accounts`);
console.log("Paste the file into the Supabase SQL editor (it runs in one transaction).");
