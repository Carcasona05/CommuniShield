import { supabaseAdmin } from "../config/supabaseAdmin.js";

// Keep calendar-month requests working for clients cached before Past 30 Days.
export type DistributionPeriod = "today" | "7d" | "30d" | "month" | "all";
const DAY = 86400000, PH_OFFSET = 8 * 3600000;
export function distributionRange(period: DistributionPeriod, now = Date.now()) {
  const local = new Date(now + PH_OFFSET);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - PH_OFFSET;
  const start = period === "today" ? midnight : period === "7d" ? midnight - 6 * DAY
    : period === "30d" ? midnight - 29 * DAY
      : period === "month" ? Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - PH_OFFSET : null;
  return { day: local.toISOString().slice(0, 10), from: start === null ? null : new Date(start).toISOString(),
    toExclusive: new Date(now + 1).toISOString() };
}
type Page<T> = { data: T[] | null; error: { message: string } | null; count: number | null };
// Follow actual returned lengths, including database caps smaller than 500.
// Never turn a failed/incomplete page into a plausible partial distribution.
async function complete<T extends { id?: string; subject_id?: string }>(load: (from: number, to: number) => PromiseLike<Page<T>>) {
  const rows: T[] = [];
  let total: number | null = null;
  do {
    const result = await load(rows.length, rows.length + 499);
    if (result.error) throw new Error(result.error.message);
    if (result.count === null || !Number.isSafeInteger(result.count) || result.count < 0 || result.count > 100000 || (total !== null && total !== result.count)) throw new Error("Complete sentiment distribution unavailable");
    total = result.count;
    if (!result.data?.length && rows.length < total) throw new Error("Sentiment subjects changed during loading. Please retry.");
    rows.push(...(result.data || []));
    if (rows.length > total) throw new Error("Sentiment subjects changed during loading. Please retry.");
  } while (rows.length < total);
  if (new Set(rows.map(row => row.id || row.subject_id)).size !== rows.length) throw new Error("Duplicate sentiment subjects encountered. Please retry.");
  return rows;
}
type Analysis = { subject_id: string; label: string | null; status: string | null };
type Subject = { id: string; created_at: string };
async function analyses(type: "report" | "comment", ids: string[]) {
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += 100) batches.push(ids.slice(i, i + 100));
  const result: Analysis[] = [];
  // Bound request concurrency and URL lengths even for All Time.
  for (let i = 0; i < batches.length; i += 3) {
    const pages = await Promise.all(batches.slice(i, i + 3).map(batch => complete<Analysis>((from, to) => supabaseAdmin
      .from("sentiment_analysis").select("subject_id,label,status", { count: "exact" })
      .eq("subject_type", type).in("subject_id", batch).order("subject_id").range(from, to))));
    result.push(...pages.flat());
  }
  return result;
}
export function summarizeDistribution(subjects: { reports: string[]; comments: string[] }, results: { reports: Analysis[]; comments: Analysis[] }) {
  const counts = { positive: 0, neutral: 0, negative: 0, mixed: 0, unclear: 0 };
  const coverage = { version: 1, unclear: 0, unavailable: 0, pending: 0, failed: 0, missing: 0 };
  let analyzed = 0;
  for (const type of ["reports", "comments"] as const) {
    const byId = new Map(results[type].map(row => [row.subject_id, row]));
    for (const id of subjects[type]) {
      const row = byId.get(id);
      if (!row) { coverage.missing++; continue; }
      if (row.status === "succeeded" && row.label && Object.hasOwn(counts, row.label)) {
        counts[row.label as keyof typeof counts]++; analyzed++;
        if (row.label === "unclear") coverage.unclear++;
      } else if (row.status === "pending") coverage.pending++;
      else if (row.status === "failed") coverage.failed++;
      else coverage.unavailable++;
    }
  }
  const total = subjects.reports.length + subjects.comments.length;
  const usable = counts.positive + counts.neutral + counts.negative + counts.mixed;
  return { sentimentTotal: total, sentimentAnalyzed: analyzed, sentimentCoverage: coverage,
    reportCount: subjects.reports.length, commentCount: subjects.comments.length, usableCount: usable,
    positiveShare: usable ? counts.positive / usable * 100 : null,
    sentimentDistribution: [...Object.entries(counts).map(([label, count]) => ({ label, count })), { label: "none", count: total - analyzed }] };
}

export function buildSentimentTrend(period: DistributionPeriod, subjects: { reports: Subject[]; comments: Subject[] },
  results: { reports: Analysis[]; comments: Analysis[] }, now = Date.now()) {
  const range = distributionRange(period, now);
  const midnight = Date.parse(distributionRange("today", now).from!);
  let start = range.from ? Date.parse(range.from) : midnight, step = period === "today" ? 3600000 : DAY;
  let count = period === "today" ? 24 : Math.round((midnight - start) / DAY) + 1, monthStep = 0;
  if (period === "all") {
    const earliest = [...subjects.reports, ...subjects.comments].reduce((min, row) => {
      const time = Date.parse(row.created_at); return Number.isFinite(time) && time <= now ? Math.min(min, time) : min;
    }, now);
    const first = new Date(earliest + PH_OFFSET), current = new Date(now + PH_OFFSET);
    start = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1) - PH_OFFSET;
    const months = (current.getUTCFullYear() - first.getUTCFullYear()) * 12 + current.getUTCMonth() - first.getUTCMonth() + 1;
    monthStep = Math.max(1, Math.ceil(months / 12)); count = Math.ceil(months / monthStep); step = 0;
  }
  const monthStart = new Date(start + PH_OFFSET);
  const boundary = (index: number) => monthStep
    ? Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + index * monthStep, 1) - PH_OFFSET : start + index * step;
  const bins = Array.from({ length: count }, (_, index) => ({ start: boundary(index), end: boundary(index + 1),
    total: 0, analyzed: 0, usable: 0, counts: { positive: 0, neutral: 0, negative: 0, mixed: 0 }, unclear: 0, withoutResult: 0 }));
  for (const type of ["reports", "comments"] as const) {
    const byId = new Map(results[type].map(row => [row.subject_id, row]));
    for (const subject of subjects[type]) {
      const time = Date.parse(subject.created_at);
      if (!Number.isFinite(time) || time < start || time > now) continue;
      const local = new Date(time + PH_OFFSET);
      const index = monthStep ? Math.floor(((local.getUTCFullYear() - monthStart.getUTCFullYear()) * 12 + local.getUTCMonth() - monthStart.getUTCMonth()) / monthStep)
        : Math.floor((time - start) / step);
      const bin = bins[index]; if (!bin) continue;
      bin.total++;
      const analysis = byId.get(subject.id);
      if (analysis?.status === "succeeded" && analysis.label && Object.hasOwn(bin.counts, analysis.label)) {
        bin.counts[analysis.label as keyof typeof bin.counts]++; bin.analyzed++; bin.usable++;
      } else if (analysis?.status === "succeeded" && analysis.label === "unclear") { bin.analyzed++; bin.unclear++; }
      else bin.withoutResult++;
    }
  }
  return { interval: period === "today" ? "hour" : monthStep ? "month" : "day", monthsPerBucket: monthStep || null,
    buckets: bins.map(bin => ({ ...bin, start: new Date(bin.start).toISOString(),
      end: new Date(bin.start > now ? bin.end : Math.min(bin.end, now + 1)).toISOString(), future: bin.start > now })) };
}

export async function loadSentimentDistribution(period: DistributionPeriod, now = Date.now()) {
  const range = distributionRange(period, now);
  const [reports, comments] = await Promise.all([
    complete<Subject>((from, to) => {
      let query = supabaseAdmin.from("reports").select("id,created_at", { count: "exact" }).neq("status", "Archived").lt("created_at", range.toExclusive);
      if (range.from) query = query.gte("created_at", range.from);
      return query.order("id").range(from, to);
    }),
    // Filter comments by THEIR creation date, including new comments on old
    // non-archived reports. The joined parent is used only for archive exclusion.
    complete<Subject>((from, to) => {
      let query = supabaseAdmin.from("report_comments").select("id,created_at,reports!inner(status)", { count: "exact" })
        .neq("reports.status", "Archived").lt("created_at", range.toExclusive);
      if (range.from) query = query.gte("created_at", range.from);
      return query.order("id").range(from, to);
    }),
  ]);
  const subjects = { reports: reports.map(row => row.id), comments: comments.map(row => row.id) };
  const [reportResults, commentResults] = await Promise.all([analyses("report", subjects.reports), analyses("comment", subjects.comments)]);
  return { period, timeZone: "Asia/Manila", from: range.from, toExclusive: range.toExclusive,
    summary: summarizeDistribution(subjects, { reports: reportResults, comments: commentResults }),
    trend: buildSentimentTrend(period, { reports, comments }, { reports: reportResults, comments: commentResults }, now) };
}
