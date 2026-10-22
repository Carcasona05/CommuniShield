/**
 * Deterministic synthetic seed for CommuniShield (Supabase Postgres).
 *
 * EVERY row produced here is fake test data for a police-research prototype:
 * no real incident, person, address, reporter or conversation is described by
 * any text, name, coordinate or timestamp in this file. All coordinates are
 * interior points of the real Argao barangay polygons, generated purely to
 * exercise clustering, sentiment and forecasting code.
 *
 * Guarantees, verified by server/src/SampleSeed.test.ts:
 *  - every coordinate is generated inside the real Argao barangay polygon it
 *    is labelled with, so the location -> barangay resolver accepts it;
 *  - the history spans SEED_HISTORY_DAYS with reports on nearly every day,
 *    which clears the real 7-day submitted-report outlook gates;
 *  - SEED_CLUSTERS planted clusters use >= 4 distinct pins inside 300 m (the
 *    production DBSCAN parameters); every other pin is scattered noise;
 *  - sentiment rows include realistic failure / low-confidence / unknown
 *    language cases so "excluded analyses" stays visible in the UI;
 *  - timestamps are generated relative to now() at insert time, so the data
 *    is always fresh no matter when the file is pasted;
 *  - only column names and CHECK-constrained values that exist in DB_Schema
 *    are emitted, so the whole file runs in one transaction.
 */
import { ARGAO_BARANGAY_NAMES, pointInRing } from "../../src/utils/argaoLocation.js";
import { distanceMeters } from "../../src/services/hotspotClusteringService.js";
import boundaries from "../../src/data/argaoBarangayBoundaries.json" with { type: "json" };
import { reportNarrative, commentNarrative } from "./realisticNarratives.js";

export const SEED_POSTERS = 20;
export const SEED_COMMENTERS = 15;
// Internal model slots only; no accounts are created by the SQL generator.
export const SEED_USERS = 40;
export const SEED_REPORTS = 640;
export const SEED_HISTORY_DAYS = 140;
export const SEED_CLUSTERS = 6;
export const SEED_COMMENTS = 700;

/** Fixed table sizes; the generated SQL and SampleSeed.test.ts assert these. */
export const SEED_COUNTS = {
  users: SEED_POSTERS + SEED_COMMENTERS,
  reports: SEED_REPORTS,
  comments: SEED_COMMENTS,
  likes: 350,
  images: 150,
  validations: 150,
  logs: 90,
  notifications: 110,
  credibilityEvents: 400,
  announcements: 8,
  datasets: 5,
  datasetSamples: 100,
  datasetEvents: 10,
  facilities: 4,
};

/** Real names from public.incident_types (DB_Schema/reports_schema.sql). */
export const INCIDENT_TYPES = [
  "Theft", "Public Disturbance", "Vehicular Accident", "Reckless Driving",
  "Fire Incident", "Flooding", "Streetlight Outage", "Suspicious Person",
  "Suspicious Vehicle", "Online Scam / Suspicious Message", "Lost Item", "General Safety Concern",
];

/** Barangays are referenced by NAME so an index can never drift out of sync
 * with ARGAO_BARANGAY_NAMES. Labels are built from the barangay as well. */
const CLUSTER_PLANS = [
  { barangay: "Lamacan", label: "Purok 1", pins: 7, reportsPerPin: 2, daySpread: 29 },
  { barangay: "Canbanua", label: "Purok 3", pins: 6, reportsPerPin: 2, daySpread: 26 },
  { barangay: "Poblacion", label: "Purok 2", pins: 6, reportsPerPin: 2, daySpread: 22 },
  { barangay: "Langtad", label: "Purok 1", pins: 5, reportsPerPin: 2, daySpread: 19 },
  { barangay: "Binlod", label: "Purok 4", pins: 5, reportsPerPin: 1, daySpread: 16 },
  { barangay: "Bogo", label: "Purok 2", pins: 5, reportsPerPin: 1, daySpread: 13 },
];

const NOISE_PLANS = [
  { barangay: "Poblacion", label: "Sample street 1" },
  { barangay: "Langtad", label: "Sample street 2" },
  { barangay: "Canbanua", label: "Sample street 3" },
  { barangay: "Casay", label: "Sample street 4" },
  { barangay: "Colawin", label: "Sample street 5" },
  { barangay: "Sumaguan", label: "Sample street 6" },
  { barangay: "Mompeller", label: "Sample street 7" },
  { barangay: "Linut-od", label: "Sample street 8" },
  { barangay: "Talaytay", label: "Sample street 9" },
  { barangay: "Talo-ot", label: "Sample street 10" },
  { barangay: "Gutlang", label: "Sample street 11" },
  { barangay: "Jampang", label: "Sample street 12" },
];
/** Clustered reports stay in the statuses the clustering engine keeps active. */
const CLUSTER_STATUSES = ["Pending Review", "Under Verification", "Under Verification", "Under Verification"];
/** Noise reports span the whole lifecycle so status exclusions stay visible. */
const NOISE_STATUSES = [
  "Pending Review", "Under Verification", "Under Verification", "Resolved", "Resolved",
  "Rejected", "Marked Fake", "Under Verification", "Pending Review", "Resolved", "Archived",
];



const uuid = (namespace: string, index: number) =>
  `${namespace}-0000-4000-8000-${index.toString(16).padStart(4, "0").repeat(3)}`;

const hashOf = (text: string) => {
  let value = 0;
  for (let index = 0; index < text.length; index++) value = (value * 31 + text.charCodeAt(index)) >>> 0;
  return value.toString(16).padStart(8, "0").repeat(4).slice(0, 32);
};

const sqlString = (text: string) => `'${text.replace(/'/g, "''")}'`;
// UUIDs MUST be quoted: a bare 0000000a-0000-… is lexed by Postgres as
// arithmetic and fails with "trailing junk after numeric literal".
const sqlUuid = (value: string) => `'${value}'::uuid`;
const sqlNumber = (value: number, digits = 6) => value.toFixed(digits);
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

type Feature = { name: string; bounds: number[]; polygons: number[][][][] };
type Point = { latitude: number; longitude: number };

const features = () => (boundaries as { features: Feature[] }).features;

const strictlyInside = (feature: Feature, point: Point) => feature.polygons.some(([outer, ...holes]) =>
  outer && pointInRing(point.longitude, point.latitude, outer) === 1 && !holes.some((hole) => pointInRing(point.longitude, point.latitude, hole) === 1));

/** Deterministic rejection sampling of one interior point of a barangay. */
function sampleCenter(feature: Feature, seed: number): Point | null {
  const [west = 0, south = 0, east = 0, north = 0] = feature.bounds;
  const margin = clamp((east - west - 0.006) / 2, 0.002, 0.005);
  const spanX = east - west - 2 * margin;
  const spanY = north - south - 2 * margin;
  for (let attempt = 0; attempt < 4000; attempt++) {
    const mixed = (seed * 2654435761 + attempt * 40503) >>> 0;
    const point = {
      latitude: south + margin + ((mixed % 10000) / 10000) * spanY,
      longitude: west + margin + (((mixed >>> 16) % 10000) / 10000) * spanX,
    };
    if (strictlyInside(feature, point)) return point;
  }
  return null;
}

/** ~45 m offsets in eight compass directions, all verified inside the polygon. */
const DIRECTIONS: Array<[number, number]> = [
  [0, 0.00042], [0.00030, 0.00030], [0.00042, 0], [0.00030, -0.00030],
  [0, -0.00042], [-0.00030, -0.00030], [-0.00042, 0], [-0.00030, 0.00030],
];

/** Pins that are pairwise within ~95 m, so DBSCAN (eps 300 m) groups them. */
function pinsAround(feature: Feature, center: Point, count: number, seed: number): Point[] {
  const pins: Point[] = [center];
  for (let pin = 1; pin < count; pin++) {
    const [dx, dy] = DIRECTIONS[pin % DIRECTIONS.length]!;
    let placed: Point | null = null;
    for (const scale of [1, 0.6, 0.3, 0.15]) {
      const candidate = { latitude: center.latitude + dy * scale, longitude: center.longitude + dx * scale };
      if (strictlyInside(feature, candidate) && !pins.some((other) => other.latitude === candidate.latitude && other.longitude === candidate.longitude)) {
        placed = candidate;
        break;
      }
    }
    pins.push(placed || { latitude: center.latitude + (seed % 7) * 1e-6, longitude: center.longitude + (seed % 5) * 1e-6 });
  }
  return pins;
}

export type SampleCoordinate = {
  index: number; barangay: string; label: string; latitude: number; longitude: number; cluster: string | null;
};
export type SampleCluster = { id: string; barangay: string; label: string; firstCoordinateIndex: number; pins: number; reports: number };
export type SampleReport = {
  index: number; id: string; userId: string; typeName: string; location: string;
  latitude: number | null; longitude: number | null; posterName: string; displayNameType: string;
  details: string; status: string; dayOffset: number; minuteOffset: number; cluster: string | null;
};
export type SampleComment = {
  id: string; reportId: string; userId: string; content: string; dayOffset: number; minuteOffset: number;
  label: string; confidence: number; language: string; provider: string; model: string;
  status: string; inputHash: string;
};
export type SampleSentiment = {
  reportId: string; label: string; confidence: number; language: string; provider: string;
  model: string; status: string; errorCode: string; inputHash: string; sourceText: string; dayOffset: number;
};
export type SampleCredibility = {
  reportId: string; aiScore: number; severity: string; credibilityLevel: string; review: string; dayOffset: number;
};

/** All rows that depend on report coordinates and dates, shared with tests. */
export function buildSampleModel(): {
  coordinates: SampleCoordinate[];
  clusters: SampleCluster[];
  reports: SampleReport[];
  comments: SampleComment[];
  sentiment: SampleSentiment[];
  credibility: SampleCredibility[];
} {
  const byName = new Map(features().map((feature) => [feature.name, feature]));
  const coordinates: SampleCoordinate[] = [];
  const clusters: SampleCluster[] = [];
  const centers: Point[] = [];
  const noiseByPlan = new Map<number, SampleCoordinate>();

  for (const plan of CLUSTER_PLANS) {
    const barangay = plan.barangay;
    const planIndex = CLUSTER_PLANS.indexOf(plan);
    const feature = byName.get(barangay)!;
    let pins: Point[] = [];
    let center: Point | null = null;
    for (let attempt = 0; attempt < 60 && pins.length < plan.pins; attempt++) {
      const candidate = sampleCenter(feature, planIndex * 31 + attempt);
      if (!candidate) continue;
      // Planted clusters must stay far apart so DBSCAN can never merge two.
      if (centers.some((other) => distanceMeters(candidate, other) <= 800)) continue;
      const placed = pinsAround(feature, candidate, plan.pins, planIndex + attempt);
      if (new Set(placed.map((point) => `${point.latitude},${point.longitude}`)).size === plan.pins) {
        pins = placed;
        center = candidate;
      }
    }
    if (pins.length < plan.pins || !center) throw new Error(`Could not place ${plan.pins} well-separated pins inside ${barangay}.`);
    centers.push(center);
    const firstIndex = coordinates.length + 1;
    pins.forEach((point, pin) => coordinates.push({
      index: coordinates.length + 1, barangay, label: `${plan.label} pin ${pin + 1}`,
      latitude: point.latitude, longitude: point.longitude, cluster: `cluster-${clusters.length + 1}`,
    }));
    clusters.push({
      id: `cluster-${clusters.length + 1}`, barangay, label: plan.label,
      firstCoordinateIndex: firstIndex, pins: plan.pins, reports: plan.pins * plan.reportsPerPin,
    });
  }

  NOISE_PLANS.forEach((plan, planIndex) => {
    const barangay = plan.barangay;
    const feature = byName.get(barangay)!;
    let point: Point | null = null;
    for (let attempt = 0; attempt < 400 && !point; attempt++) {
      const candidate = sampleCenter(feature, planIndex * 977 + 13 + attempt * 37);
      if (!candidate) continue;
      // Stay clear of every planted cluster (pins reach ~95 m past a centre),
      // so scattered reports can never be absorbed as a hotspot's border.
      if (centers.some((center) => distanceMeters(candidate, center) <= 600)) continue;
      point = candidate;
    }
    if (!point) throw new Error(`Could not place a noise pin in ${barangay} away from the planted clusters.`);
    const coordinate: SampleCoordinate = {
      index: coordinates.length + 1, barangay, label: plan.label,
      latitude: point.latitude, longitude: point.longitude, cluster: null,
    };
    coordinates.push(coordinate);
    noiseByPlan.set(planIndex, coordinate);
  });

  const reports: SampleReport[] = [];
  const plansById = new Map(CLUSTER_PLANS.map((plan, index) => [clusters[index]!.id, plan]));
  for (const coordinate of coordinates) {
    if (!coordinate.cluster) continue;
    const plan = plansById.get(coordinate.cluster)!;
    for (let repeat = 0; repeat < plan.reportsPerPin; repeat++) {
      const index = reports.length;
      reports.push({
        index: index + 1,
        id: uuid("a1b2c3d4", index),
        userId: uuid("0000000a", (index * 3) % SEED_USERS),
        typeName: INCIDENT_TYPES[(index * 5) % INCIDENT_TYPES.length]!,
        location: `${coordinate.barangay}, ${coordinate.label}, Argao, Cebu`,
        latitude: coordinate.latitude, longitude: coordinate.longitude,
        posterName: `Sample Reporter ${(index * 3) % SEED_USERS + 1}`,
        displayNameType: index % 3 === 0 ? "Fullname" : "Username",
        details: `Sample report: synthetic prototype test entry ${index + 1} in ${coordinate.barangay}.`,
        status: CLUSTER_STATUSES[index % CLUSTER_STATUSES.length]!,
        dayOffset: (index % plan.daySpread) + 1,
        minuteOffset: 120 + (index % 600),
        cluster: coordinate.cluster,
      });
    }
  }
  for (let index = reports.length; index < SEED_REPORTS; index++) {
    const planIndex = index % NOISE_PLANS.length;
    const plan = NOISE_PLANS[planIndex]!;
    const barangay = plan.barangay;
    const pin = noiseByPlan.get(planIndex)!;
    reports.push({
      index: index + 1,
      id: uuid("a1b2c3d4", index),
      userId: uuid("0000000a", (index * 3) % SEED_USERS),
      typeName: INCIDENT_TYPES[(index * 7) % INCIDENT_TYPES.length]!,
      location: `${barangay}, ${plan.label}, Argao, Cebu`,
      latitude: pin.latitude, longitude: pin.longitude,
      posterName: `Sample Reporter ${(index * 3) % SEED_USERS + 1}`,
      displayNameType: index % 3 === 0 ? "Fullname" : "Username",
      details: `Sample report: synthetic prototype test entry ${index + 1} in ${barangay}.`,
      status: NOISE_STATUSES[index % NOISE_STATUSES.length]!,
      dayOffset: (index * 7 + Math.floor(index / 5) * 11) % SEED_HISTORY_DAYS,
      minuteOffset: 120 + (index % 600),
      cluster: null,
    });
  }

  const narratives = new Map(reports.map((report) => {
    const narrative = reportNarrative(report.index, report.typeName, report.location.split(",")[0]!, report.status);
    report.details = narrative.text;
    return [report.id, narrative];
  }));
  const sentiment: SampleSentiment[] = [];
  const credibility: SampleCredibility[] = [];
  for (const report of reports) {
    const narrative = narratives.get(report.id)!;
    if ((report.index + report.dayOffset) % 5 !== 0) {
      // 80% of reports carry a successful or deliberately unusable analysis.
      const usable = (report.index + report.dayOffset) % 9 !== 0;
      sentiment.push({
        reportId: report.id,
        label: usable ? narrative.label : "unclear",
        confidence: usable ? 0.82 + ((report.index * 13) % 16) / 100 : 0.55,
        language: narrative.language,
        provider: usable ? "local" : "none",
        model: usable ? "argao_v1" : "",
        status: usable ? "succeeded" : "failed",
        errorCode: usable ? "" : "low_confidence",
        inputHash: hashOf(report.details),
        sourceText: report.details,
        dayOffset: Math.max(0, report.dayOffset - 1),
      });
      const aiScore = 35 + ((report.index * 17) % 66);
      const severity = narrative.severity;
      credibility.push({
        reportId: report.id,
        aiScore,
        severity,
        credibilityLevel: aiScore >= 80 ? "High" : aiScore >= 55 ? "Medium" : "Low",
        review: `Sample AI review: [SIMULATED] ${report.typeName}. Unverified text. Scenario severity is not emotional tone.`,
        dayOffset: Math.max(0, report.dayOffset - 1),
      });
    }
  }

  const comments: SampleComment[] = [];
  for (let thread = 0; comments.length < SEED_COMMENTS; thread++) {
    const report = reports[(thread * 37) % SEED_REPORTS]!;
    // Most reports receive no replies, some have small discussions, and a few
    // attract long threads. Commenters are distinct from the poster accounts.
    const threadSize = thread % 10 === 0 ? 12 : 1 + thread % 5;
    for (let position = 0; position < threadSize && comments.length < SEED_COMMENTS; position++) {
      const i = comments.length + 1;
      const usable = i % 4 !== 0;
      const narrative = commentNarrative(report.index, report.typeName, report.location.split(",")[0]!, position, report.status);
      const ageMinutes = report.dayOffset * 1440 + report.minuteOffset - (3 + position * 7 + thread % 11);
      comments.push({
        id: uuid("c0ffee00", i), reportId: report.id,
        userId: uuid("0000000a", (i * 17 + 5) % SEED_USERS),
        content: narrative.text,
        dayOffset: Math.floor(ageMinutes / 1440), minuteOffset: ageMinutes % 1440,
        label: usable ? narrative.label : "unclear",
        confidence: usable ? 0.7 + ((i * 13) % 25) / 100 : 0,
        language: narrative.language, provider: usable ? "local" : "none",
        model: usable ? "argao_v1" : "", status: usable ? "succeeded" : "failed",
        inputHash: hashOf(narrative.text),
      });
    }
  }

  return { coordinates, clusters, reports, comments, sentiment, credibility };
}

/** Serialises the model into one paste-ready SQL file for the Supabase SQL editor. */
export function generateSampleSeedSql(): string {
  const { coordinates, clusters, reports, comments, sentiment, credibility } = buildSampleModel();

  const poster = (index: number) => `pg_temp.sample_seed_user('poster', ${index % SEED_POSTERS + 1})`;
  const commenter = (index: number) => `pg_temp.sample_seed_user('commenter', ${index % SEED_COMMENTERS + 1})`;
  const adminRef = "(select id from pg_temp.sample_seed_admin)";
  const usableComments = comments.filter((comment) => comment.status === "succeeded").length;
  const usableReports = sentiment.filter((row) => row.status === "succeeded").length;

  let sql = `-- ============================================================
-- CommuniShield — FULL synthetic sample data (generated file)
-- Generated by: npm run seed:generate   (server/scripts/seed/)
--
-- *** EVERY ROW BELOW IS FAKE TEST DATA ***
-- No real incident, person, address, reporter or conversation is
-- described by any text, name, coordinate or timestamp here. Every
-- coordinate is an interior point of the real Argao barangay
-- polygons, generated to evaluate the prototype only.
--
-- REUSES EXISTING ACCOUNTS (no passwords or login codes required):
--   poster1@communishield.local .. poster${SEED_POSTERS}@communishield.local
--   commenter1@communishield.local .. commenter${SEED_COMMENTERS}@communishield.local
-- Accounts, profiles, roles, credentials and credibility scores are untouched.
-- Admin metadata references one existing active admin/super-admin.
--
-- Data: ${SEED_REPORTS} reports over ${SEED_HISTORY_DAYS} days, ${clusters.length} planted hotspot clusters,
--        ${comments.length} comments (${usableComments} usable analyses), ${sentiment.length} report sentiment rows
--        (${usableReports} usable), ${credibility.length} credibility analyses, ${SEED_COUNTS.likes} likes,
--        ${SEED_COUNTS.images} images, ${SEED_COUNTS.validations} validations, ${SEED_COUNTS.logs} audit logs,
--        ${SEED_COUNTS.notifications} notifications, ${SEED_COUNTS.credibilityEvents} credibility events,
--        ${SEED_COUNTS.announcements} announcements, ${SEED_COUNTS.datasets} sentiment datasets.
--
-- Re-run safe: the file deletes its own rows first, matched by the
-- fixed UUID namespaces used below (a1b2c3d4-* reports, c0ffee00-*
-- comments, d5e7d47a-* datasets) and by the
-- 'Sample ' text markers, so live data is never touched. Everything
-- inserts inside ONE transaction. Dates are relative to now(), so
-- the data is always fresh whenever you paste it.
--
-- Schema tolerance: statements whose table a deployment may not have
-- (public.emergency_facilities, public.system_settings) run inside a
-- to_regclass() guard and are SKIPPED with a NOTICE when absent. The
-- legacy public.admin_posts table is never touched at all (superseded
-- by public.admin_announcement).
-- ============================================================

begin;

-- digest() comes from pgcrypto (enabled by default on Supabase). The local
-- search_path makes it resolvable whether pgcrypto lives in 'extensions'
-- (Supabase) or 'public' (self-hosted); every table reference is qualified.
create extension if not exists pgcrypto;
set local search_path = extensions, public;

-- Resolve real account IDs by email, never by hard-coded UUID. These temporary
-- lookup tables disappear at commit. Check BEFORE deleting/inserting anything.
create temporary table sample_seed_accounts on commit drop as
select u.id, expected.email, expected.kind, expected.slot,
       coalesce(nullif(p.user_name, ''), nullif(p.fullname, ''), expected.email) as display_name
from (values
${Array.from({ length: SEED_POSTERS }, (_, index) => `  ('poster${index + 1}@communishield.local', 'poster', ${index + 1})`).concat(
    Array.from({ length: SEED_COMMENTERS }, (_, index) => `  ('commenter${index + 1}@communishield.local', 'commenter', ${index + 1})`)
  ).join(",\n")}
) as expected(email, kind, slot)
left join auth.users u on lower(u.email) = expected.email
left join public.profiles p on p.id = u.id
where p.role = 'user' and p.status = 'Active';

create temporary table sample_seed_admin on commit drop as
select p.id from public.profiles p join auth.users u on u.id = p.id
where p.role in ('super_admin', 'admin') and p.status = 'Active'
order by (p.role = 'super_admin') desc, p.id
limit 1;

do $guard$
declare missing text;
begin
  select string_agg(expected.email, ', ' order by expected.email) into missing
  from (
    select 'poster' || n || '@communishield.local' as email from generate_series(1, ${SEED_POSTERS}) n
    union all
    select 'commenter' || n || '@communishield.local' as email from generate_series(1, ${SEED_COMMENTERS}) n
  ) expected
  where not exists (select 1 from pg_temp.sample_seed_accounts a where a.email = expected.email);
  if missing is not null then
    raise exception 'Sample seed stopped: missing or inactive user accounts/profiles: %', missing;
  end if;
  if not exists (select 1 from pg_temp.sample_seed_admin) then
    raise exception 'Sample seed stopped: an existing active admin or super-admin is required';
  end if;
end $guard$;

-- Compact session-local lookup keeps this paste-ready despite richer text.
create function pg_temp.sample_seed_user(text, integer) returns uuid
language sql stable strict as $stmt$
  select a.id from pg_temp.sample_seed_accounts a where a.kind = $1 and a.slot = $2
$stmt$;

-- 0) Remove any previous copy of this seed. Report rows are matched by
--    their fixed UUID prefix (their location starts with the barangay
--    name, so text matching would miss them); everything else by marker.
delete from public.sentiment_dataset_events
where dataset_id in (select id from public.sentiment_datasets where name like 'Sample dataset:%');

delete from public.sentiment_training_samples
where dataset_id in (select id from public.sentiment_datasets where name like 'Sample dataset:%');

delete from public.sentiment_datasets
where name like 'Sample dataset:%';

delete from public.report_validations
where report_id in (select id from public.reports where id::text like 'a1b2c3d4-%');

delete from public.audit_logs
where title like 'Sample log:%';

delete from public.notifications
where title like 'Sample notification:%';

delete from public.report_credibility_analysis
where report_id in (select id from public.reports where id::text like 'a1b2c3d4-%');

delete from public.sentiment_analysis
where subject_id in (select id from public.reports where id::text like 'a1b2c3d4-%')
   or subject_id in (select id from public.report_comments where id::text like 'c0ffee00-%');

delete from public.report_images
where report_id in (select id from public.reports where id::text like 'a1b2c3d4-%');

delete from public.report_likes
where report_id in (select id from public.reports where id::text like 'a1b2c3d4-%');

delete from public.report_comments
where report_id in (select id from public.reports where id::text like 'a1b2c3d4-%');

delete from public.credibility_events
where reason like 'Sample credibility event % (synthetic).'
  and report_id::text like 'a1b2c3d4-%';

delete from public.reports
where id::text like 'a1b2c3d4-%';

delete from public.admin_announcement
where details like 'Sample announcement:%';

do $guard$
begin
  if to_regclass('public.emergency_facilities') is not null then
    execute $stmt$
delete from public.emergency_facilities
where name like 'Sample %'
$stmt$;
  else
    raise notice 'CommuniShield seed: skipping public.emergency_facilities (relation not present)';
  end if;
end $guard$;

-- 1) Notification types only. Existing accounts/profiles are never modified.
`;

  sql += `insert into public.notification_types (name) values
  ('report_status'), ('nearby_incident'), ('admin_account'), ('report_submitted'),
  ('ai_validation'), ('report_approved'), ('system'), ('log')
on conflict (name) do nothing;

-- 2) Reports: ${SEED_REPORTS} rows across ${SEED_HISTORY_DAYS} days. Timestamps are computed
--    relative to now(); status spans the whole lifecycle including Archived.
--    ${coordinates.filter((coordinate) => coordinate.cluster).length} pins belong to the ${clusters.length} planted clusters, ${coordinates.filter((coordinate) => !coordinate.cluster).length} are scattered noise.
`;

  sql += `insert into public.reports (id, user_id, incident_type_id, location, latitude, longitude, poster_name, display_name_type, details, status, created_at, updated_at)
select v.id, v.user_id, t.id, v.location, v.latitude, v.longitude, a.display_name, 'Username', concat('Sample report: ', v.details), v.status,
       now() - make_interval(days => v.day_offset, mins => v.minute_offset),
       now() - make_interval(days => v.day_offset, mins => v.minute_offset)
from (values
`;
  sql += reports.map((report, index) => `  (${sqlUuid(report.id)}, ${poster(index)}, ${sqlString(report.typeName)}, ${sqlString(report.location)}, ${report.latitude === null ? "null" : `${sqlNumber(report.latitude)}::float8`}, ${report.longitude === null ? "null" : `${sqlNumber(report.longitude)}::float8`}, ${sqlString(report.details.slice("Sample report: ".length))}, '${report.status}', ${report.dayOffset}, ${report.minuteOffset})${index === reports.length - 1 ? "" : ","}`).join("\n") + `
) as v(id, user_id, type_name, location, latitude, longitude, details, status, day_offset, minute_offset)
left join public.incident_types t on t.name = v.type_name
join pg_temp.sample_seed_accounts a on a.id = v.user_id and a.kind = 'poster'
on conflict (id) do nothing;

-- 3) Credibility analyses (severity feeds the Risk Prediction tiles).
`;

  sql += `insert into public.report_credibility_analysis (report_id, ai_score, severity, credibility_level, credibility_review, ai_model_version, analysis_duration_ms, analyzed_at)
select v.report_id, v.ai_score, v.severity, v.credibility_level,
       concat('Sample AI review: [SIMULATED] ', v.type_name, '. Unverified text. Scenario severity is not emotional tone.'),
       'CommuniShield-AI v1.0', 120 + (v.day_offset * 13) % 400,
       now() - make_interval(days => v.day_offset, mins => 90)
from (values
`;
  sql += credibility.map((row, index) => `  (${sqlUuid(row.reportId)}, ${row.aiScore}::numeric, '${row.severity}', '${row.credibilityLevel}', ${sqlString(reports.find((report) => report.id === row.reportId)!.typeName)}, ${row.dayOffset})${index === credibility.length - 1 ? "" : ","}`).join("\n") + `
) as v(report_id, ai_score, severity, credibility_level, type_name, day_offset)
on conflict (report_id) do nothing;

-- 4) Sentiment analyses for reports (mirrors the unified pipeline output,
--    including failed and low-confidence rows that the UI must exclude).
`;

  sql += `insert into public.sentiment_analysis (subject_type, subject_id, label, confidence, language, provider, model, status, analyzed_at, input_hash, source_text, error_code)
select 'report', v.subject_id, v.label, v.confidence, v.language, v.provider, v.model, v.status,
       now() - make_interval(days => v.day_offset, mins => 60), v.input_hash, r.details, v.error_code
from (values
`;
  sql += sentiment.map((row, index) => `  (${sqlUuid(row.reportId)}, '${row.label}', ${row.confidence}::numeric, '${row.language}', '${row.provider}', '${row.model}', '${row.status}', ${row.dayOffset}, ${sqlString(row.inputHash)}, ${sqlString(row.errorCode)})${index === sentiment.length - 1 ? "" : ","}`).join("\n") + `
) as v(subject_id, label, confidence, language, provider, model, status, day_offset, input_hash, error_code)
join public.reports r on r.id = v.subject_id
on conflict (subject_type, subject_id) do nothing;

-- 5) Comments plus their own sentiment rows.
`;

  sql += `insert into public.report_comments (id, report_id, user_id, content, created_at)
select v.id, v.report_id, v.user_id, concat('Sample comment: [SIMULATED] ', v.content), now() - make_interval(days => v.day_offset, mins => v.minute_offset)
from (values
`;
  sql += comments.map((comment, index) => `  (${sqlUuid(comment.id)}, ${sqlUuid(comment.reportId)}, ${commenter(index)}, ${sqlString(comment.content.slice("Sample comment: [SIMULATED] ".length))}, ${comment.dayOffset}, ${comment.minuteOffset})${index === comments.length - 1 ? "" : ","}`).join("\n") + `
) as v(id, report_id, user_id, content, day_offset, minute_offset)
on conflict (id) do nothing;

insert into public.sentiment_analysis (subject_type, subject_id, label, confidence, language, provider, model, status, analyzed_at, input_hash, source_text)
select 'comment', c.id, v.label, v.confidence, v.language, v.provider, v.model, v.status, c.created_at, v.input_hash, c.content
from (values
`;
  sql += comments.map((comment, index) => `  (${sqlUuid(comment.id)}, '${comment.label}', ${comment.confidence}::numeric, '${comment.language}', '${comment.provider}', '${comment.model}', '${comment.status}', ${sqlString(comment.inputHash)})${index === comments.length - 1 ? "" : ","}`).join("\n") + `
) as v(id, label, confidence, language, provider, model, status, input_hash)
join public.report_comments c on c.id = v.id
on conflict (subject_type, subject_id) do nothing;

-- 6) Likes, images, validations, audit logs, notifications, credibility ledger.
`;

  {
    const seen = new Set<string>();
    const likeRows: Array<[string, string, number]> = [];
    for (let index = 0; likeRows.length < SEED_COUNTS.likes && index < SEED_COUNTS.likes * 3; index++) {
      const report = reports[(index * 11) % SEED_REPORTS]!;
      const userId = uuid("0000000a", (index * 3 + 1) % SEED_USERS);
      const key = `${report.id}:${userId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      likeRows.push([report.id, userId, (index * 7) % SEED_HISTORY_DAYS]);
    }
    sql += `insert into public.report_likes (report_id, user_id, created_at)
select v.report_id, v.user_id, now() - make_interval(days => v.day_offset)
from (values
${likeRows.map(([reportId, , dayOffset], index) => `  (${sqlUuid(reportId)}, ${commenter(index)},${dayOffset})${index === likeRows.length - 1 ? "" : ","}`).join("\n")}
) as v(report_id, user_id, day_offset)
on conflict do nothing;

`;
  }

  sql += `insert into public.report_images (report_id, image_url, position, created_at)
select v.report_id, v.image_url, v.position, now() - make_interval(days => v.day_offset)
from (values
`;
  sql += Array.from({ length: SEED_COUNTS.images }, (_, index) => {
    const report = reports[(index * 5) % SEED_REPORTS]!;
    return `  (${sqlUuid(report.id)}, ${sqlString(`https://picsum.photos/seed/sample-${index}/640/480`)}, ${index % 3}, ${report.dayOffset})${index === SEED_COUNTS.images - 1 ? "" : ","}`;
  }).join("\n") + `
) as v(report_id, image_url, position, day_offset)
on conflict do nothing;

insert into public.report_validations (report_id, admin_id, action, previous_status, new_status, remarks, created_at)
select v.report_id, v.admin_id, v.action, v.previous_status, v.new_status, v.remarks, now() - make_interval(days => v.day_offset)
from (values
`;
  sql += Array.from({ length: SEED_COUNTS.validations }, (_, index) => {
    const report = reports[(index * 13) % SEED_REPORTS]!;
    const action = ["Under Verification", "Resolved", "Rejected", "Archived", "Marked Fake"][index % 5]!;
    return `  (${sqlUuid(report.id)}, ${adminRef}, '${action}', 'Pending Review', '${action}', ${sqlString(`Sample validation: report ${report.index} reviewed (synthetic).`)}, ${Math.max(0, report.dayOffset - 1)})${index === SEED_COUNTS.validations - 1 ? "" : ","}`;
  }).join("\n") + `
) as v(report_id, admin_id, action, previous_status, new_status, remarks, day_offset)
on conflict do nothing;

insert into public.audit_logs (actor_id, actor_name, action_type, title, details, report_id, created_at)
select v.actor_id, v.actor_name, v.action_type, v.title, v.details, v.report_id, now() - make_interval(days => v.day_offset)
from (values
`;
  sql += Array.from({ length: SEED_COUNTS.logs }, (_, index) => {
    const actionType = ["Report Verified", "Report Rejected", "AI Analysis Completed", "Announcement Created", "Notification Sent", "System Settings Updated"][index % 6]!;
    const report = reports[(index * 29) % SEED_REPORTS]!;
    return `  (${adminRef}, 'Sample admin metadata (synthetic)', '${actionType}', ${sqlString(`Sample log: synthetic admin action ${index + 1}`)}, ${sqlString("Sample log: synthetic seed entry.")}, ${sqlUuid(report.id)}, ${(index * 3) % SEED_HISTORY_DAYS})${index === SEED_COUNTS.logs - 1 ? "" : ","}`;
  }).join("\n") + `
) as v(actor_id, actor_name, action_type, title, details, report_id, day_offset)
on conflict do nothing;

insert into public.notifications (user_id, type_id, title, message, priority, is_read, created_at, updated_at)
select v.user_id, nt.id, v.title, v.message, v.priority, v.is_read,
       now() - make_interval(days => v.day_offset), now() - make_interval(days => v.day_offset)
from (values
`;
  sql += Array.from({ length: SEED_COUNTS.notifications }, (_, index) => {
    const type = ["report_status", "nearby_incident", "admin_account", "report_submitted", "ai_validation"][index % 5]!;
    return `  (${poster(index)}, '${type}', ${sqlString(`Sample notification: synthetic alert ${index + 1}`)}, ${sqlString("Sample notification (synthetic test message).")}, '${["Low", "Medium", "High"][index % 3]}', ${index % 3 === 0}, ${(index * 2) % SEED_HISTORY_DAYS})${index === SEED_COUNTS.notifications - 1 ? "" : ","}`;
  }).join("\n") + `
) as v(user_id, type_name, title, message, priority, is_read, day_offset)
join public.notification_types nt on nt.name = v.type_name
on conflict do nothing;

insert into public.credibility_events (user_id, event_type, points, reason, report_id, created_at)
select v.user_id, v.event_type, v.points, v.reason, v.report_id, now() - make_interval(days => v.day_offset)
from (values
`;
  sql += Array.from({ length: SEED_COUNTS.credibilityEvents }, (_, index) => {
    const eventType = ["report_submitted", "report_verified", "report_rejected", "report_resolved", "penalty", "admin_adjustment"][index % 6]!;
    const points = [5, 8, -5, 3, -10, 0][index % 6]!;
    const report = reports[(index * 17) % SEED_REPORTS]!;
    return `  (${poster(report.index - 1)}, '${eventType}', ${points}::numeric, ${sqlString(`Sample credibility event ${index + 1} (synthetic).`)}, ${sqlUuid(report.id)}, ${(index * 4) % SEED_HISTORY_DAYS})${index === SEED_COUNTS.credibilityEvents - 1 ? "" : ","}`;
  }).join("\n") + `
) as v(user_id, event_type, points, reason, report_id, day_offset)
on conflict do nothing;

-- 7) Announcements and emergency facilities. The legacy admin_posts table
--    is deliberately NOT seeded: it is superseded by admin_announcement and
--    absent from deployments of the current schema.
`;

  sql += `insert into public.admin_announcement (admin_id, type, title, location, details, pic_url, created_at)
values
`;
  sql += Array.from({ length: SEED_COUNTS.announcements }, (_, index) =>
    `  (${adminRef}, ${sqlString(["Announcement", "Safety/Tips", "Public Advisory", "Flood Advisory"][index % 4]!)}, ${sqlString(`Sample announcement: prototype notice ${index + 1}`)}, ${sqlString(`${ARGAO_BARANGAY_NAMES[index % ARGAO_BARANGAY_NAMES.length]}, Argao, Cebu`)}, ${sqlString(`Sample announcement: synthetic prototype notice ${index + 1} posted for interface evaluation.`)}, null, now() - interval '${index * 7} days')${index === SEED_COUNTS.announcements - 1 ? ";" : ","}`
  ).join("\n") + `

do $guard$
begin
  if to_regclass('public.emergency_facilities') is not null then
    execute $stmt$
insert into public.emergency_facilities (name, type, latitude, longitude, address, phone)
values
`;
  sql += [
    ["Sample Argao police outpost north", "police", "Poblacion"],
    ["Sample Argao police outpost south", "police", "Langtad"],
    ["Sample Argao fire sub-station east", "fire", "Canbanua"],
    ["Sample Argao fire sub-station west", "fire", "Colawin"],
  ].map(([name, type, facilityBarangay], index) => {
    const coordinate = coordinates.find((item) => item.barangay === facilityBarangay && !item.cluster) || coordinates[0]!;
    return `  (${sqlString(String(name))}, '${String(type)}', ${sqlNumber(coordinate.latitude)}, ${sqlNumber(coordinate.longitude)}, ${sqlString(`${coordinate.barangay}, Argao, Cebu`)}, '911')${index === 3 ? "" : ","}`;
  }).join("\n") + `
$stmt$;
  else
    raise notice 'CommuniShield seed: skipping public.emergency_facilities (relation not present)';
  end if;
end $guard$;

-- 8) Sentiment datasets: an approved pool, a pending batch awaiting review,
--    a rejected batch, an archived batch, and their review events.
`;

  const DATASET_STATUSES = ["approved", "approved", "pending", "rejected", "archived"];
  const datasetRows = DATASET_STATUSES.map((status, index) => ({
    id: uuid("d5e7d47a", index),
    name: `Sample dataset: synthetic cebuano safety phrases ${index + 1}`,
    source: index % 2 === 0 ? "csv" : "manual",
    status,
    createdBy: adminRef,
    reviewedBy: status === "pending" ? null : adminRef,
    note: status === "pending" ? "Awaiting review" : status === "approved" ? "Reviewed: synthetic phrases kept for prototype training" : status === "rejected" ? "Rejected: wording needed clearer human review" : "Archived: superseded by a later synthetic batch",
    version: index + 1,
  }));
  sql += `insert into public.sentiment_datasets (id, name, source, status, created_by, created_by_name, reviewed_by, review_note, version, created_at, updated_at)
values
`;
  sql += datasetRows.map((dataset, index) =>
    `  (${sqlUuid(dataset.id)}, ${sqlString(dataset.name)}, '${dataset.source}', '${dataset.status}', ${dataset.createdBy}, 'Sample admin metadata (synthetic)', ${dataset.reviewedBy || "null"}, ${sqlString(dataset.note)}, ${dataset.version}, now() - interval '${20 - index * 3} days', now() - interval '${15 - index * 3} days')${index === datasetRows.length - 1 ? ";" : ","}`
  ).join("\n") + `

insert into public.sentiment_training_samples (dataset_id, text, language, label, text_key, active)
select v.dataset_id, v.text, v.language, v.label, encode(digest(v.text, 'sha256'), 'hex'), v.active
from (values
`;
  sql += Array.from({ length: SEED_COUNTS.datasetSamples }, (_, index) => {
    const dataset = datasetRows[index % datasetRows.length]!;
    const label = ["negative", "neutral", "positive"][index % 3]!;
    const text = `Sample training phrase ${index + 1}: synthetic ${label} safety wording for prototype dataset ${index % datasetRows.length + 1}.`;
    return `  (${sqlUuid(dataset.id)}, ${sqlString(text)}, ${sqlString(["cebuano", "filipino", "english"][index % 3]!)}, '${label}', ${dataset.status === "approved"})${index === SEED_COUNTS.datasetSamples - 1 ? "" : ","}`;
  }).join("\n") + `
) as v(dataset_id, text, language, label, active)
on conflict do nothing;

insert into public.sentiment_dataset_events (dataset_id, actor_id, actor_name, action, details, created_at)
values
`;
  sql += Array.from({ length: SEED_COUNTS.datasetEvents }, (_, index) => {
    const dataset = datasetRows[index % datasetRows.length]!;
    const action = ["submitted", "approved", "rejected", "archived"][index % 4]!;
    return `  (${sqlUuid(dataset.id)}, ${adminRef}, 'Sample admin metadata (synthetic)', '${action}', jsonb_build_object('count', 20, 'source', '${dataset.source}', 'note', 'Sample dataset: synthetic seed event'), now() - interval '${18 - (index % 5) * 3} days')${index === SEED_COUNTS.datasetEvents - 1 ? ";" : ","}`;
  }).join("\n") + `

do $guard$
begin
  if to_regclass('public.system_settings') is not null then
    execute $stmt$
insert into public.system_settings (key, value)
values ('sample_seed_is_synthetic', 'true')
on conflict (key) do update set value = excluded.value, updated_at = now()
$stmt$;
  else
    raise notice 'CommuniShield seed: skipping public.system_settings (relation not present)';
  end if;
end $guard$;

drop function pg_temp.sample_seed_user(text, integer);

-- Result summary: expect 640 reports / 20 posters and 700 comments / 15 commenters.
select
  (select count(*) from public.reports where id::text like 'a1b2c3d4-%') as sample_reports,
  (select count(distinct user_id) from public.reports where id::text like 'a1b2c3d4-%') as poster_accounts,
  (select count(*) from public.report_comments where id::text like 'c0ffee00-%') as sample_comments,
  (select count(distinct user_id) from public.report_comments where id::text like 'c0ffee00-%') as commenter_accounts;

commit;
`;

  return sql;
}
