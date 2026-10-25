import { canonicalBarangay, deriveBarangay, hasReportCoordinates } from "../utils/argaoLocation.js";

const DAY = 86400000;
export const OUTLOOK_POLICY = {
  horizonDays: 7, minimumHistoryDays: 112, minimumReports: 20, minimumReportingDays: 10,
  maximumRecentSilenceDays: 28, fittingDays: 56, calibrationWeeks: 6,
};
type Method = "historical_average" | "recent_weekday";
export type HistoryReport = { id: string; created_at?: string | null; status?: string | null; location?: string | null; barangay?: string | null; latitude?: unknown; longitude?: unknown };
export type DailySeries = { startDate: string; counts: number[] };
const methods: Method[] = ["historical_average", "recent_weekday"];
export const utcDay = (time: number) => Math.floor(time / DAY) * DAY;
const isoDate = (time: number) => new Date(time).toISOString().slice(0, 10);
const round = (value: number) => Math.round(value * 10) / 10;

/** Fit ONLY past complete days. Weekday estimates weight the most recent
 * four weeks twice as much as the preceding four weeks. No sentiment/severity
 * is used as a probability multiplier. */
export function predictReportCounts(series: DailySeries, targetStartDate: string, method: Method) {
  const target = Date.parse(`${targetStartDate}T00:00:00Z`);
  const start = Date.parse(`${series.startDate}T00:00:00Z`);
  if (!Number.isFinite(target) || !Number.isFinite(start) || !methods.includes(method) || !series.counts.length || series.counts.some((count) => !Number.isInteger(count) || count < 0)) throw new Error("Invalid daily series or method.");
  if (target < start + series.counts.length * DAY) throw new Error("Forecast target overlaps observed history.");
  const fitStart = Math.max(0, series.counts.length - OUTLOOK_POLICY.fittingDays);
  const fitting = series.counts.slice(fitStart);
  const mean = fitting.reduce((sum, count) => sum + count, 0) / fitting.length;
  return Array.from({ length: 7 }, (_, offset) => {
    const time = target + offset * DAY;
    let estimate = mean;
    if (method === "recent_weekday") {
      let total = 0;
      let weights = 0;
      for (let i = fitStart; i < series.counts.length; i++) {
        if (new Date(start + i * DAY).getUTCDay() !== new Date(time).getUTCDay()) continue;
        const weight = i >= series.counts.length - 28 ? 2 : 1;
        total += series.counts[i]! * weight;
        weights += weight;
      }
      if (weights) estimate = total / weights;
    }
    return { date: isoDate(time), expectedReports: estimate };
  });
}

/** Six non-overlapping historical target weeks. Each origin leaves one
 * unobserved gap day, matching the live policy: ignore today's partial count,
 * forecast the next seven FULL UTC days starting tomorrow. */
export function backtestMethods(series: DailySeries) {
  if (series.counts.length < OUTLOOK_POLICY.minimumHistoryDays) throw new Error("Insufficient calibration history.");
  const start = Date.parse(`${series.startDate}T00:00:00Z`);
  return methods.map((method) => {
    const folds = Array.from({ length: OUTLOOK_POLICY.calibrationWeeks }, (_, fold) => {
      const targetIndex = series.counts.length - 42 + fold * 7;
      const trainingEnd = targetIndex - 1;
      const prefix = { startDate: series.startDate, counts: series.counts.slice(0, trainingEnd) };
      const targetStart = isoDate(start + targetIndex * DAY);
      const predicted = predictReportCounts(prefix, targetStart, method);
      const actual = series.counts.slice(targetIndex, targetIndex + 7).reduce((sum, count) => sum + count, 0);
      const estimate = predicted.reduce((sum, row) => sum + row.expectedReports, 0);
      return { trainingEndDate: isoDate(start + (trainingEnd - 1) * DAY), targetStartDate: targetStart, actual, estimate, error: estimate - actual };
    });
    return { method, mae: folds.reduce((sum, fold) => sum + Math.abs(fold.error), 0) / folds.length,
      rmse: Math.sqrt(folds.reduce((sum, fold) => sum + fold.error ** 2, 0) / folds.length), folds };
  });
}

export function forecastDailySeries(series: DailySeries, targetStartDate: string) {
  const start = Date.parse(`${series.startDate}T00:00:00Z`);
  const target = Date.parse(`${targetStartDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(target) || target < start + series.counts.length * DAY || series.counts.some((count) => !Number.isInteger(count) || count < 0)) throw new Error("Invalid daily series or overlapping forecast target.");
  const total = series.counts.reduce((sum, count) => sum + count, 0);
  const reportingDays = series.counts.filter((count) => count > 0).length;
  const latestIndex = series.counts.findLastIndex((count) => count > 0);
  const stats = { historyDays: series.counts.length, reports: total, reportingDays, daysSinceLatestReport: latestIndex < 0 ? null : series.counts.length - 1 - latestIndex };
  const reasons = [];
  if (series.counts.length < OUTLOOK_POLICY.minimumHistoryDays) reasons.push(`At least ${OUTLOOK_POLICY.minimumHistoryDays} complete history days are required.`);
  if (total < OUTLOOK_POLICY.minimumReports || reportingDays < OUTLOOK_POLICY.minimumReportingDays) reasons.push(`At least ${OUTLOOK_POLICY.minimumReports} reports across ${OUTLOOK_POLICY.minimumReportingDays} reporting days are required.`);
  if (stats.daysSinceLatestReport === null || stats.daysSinceLatestReport > OUTLOOK_POLICY.maximumRecentSilenceDays) reasons.push("No sufficiently recent reporting activity; silence cannot be distinguished from missing data.");
  if (reasons.length) return { status: "insufficient_data" as const, reasons, stats, policy: OUTLOOK_POLICY };
  const comparison = backtestMethods(series);
  // Ties favor the simpler baseline. Selection sees only calibration history.
  const baseline = comparison[0]!;
  const candidate = comparison[1]!;
  const selected = candidate.mae < baseline.mae - 1e-9 ? candidate : baseline;
  const daily = predictReportCounts(series, targetStartDate, selected.method);
  const expected = daily.reduce((sum, row) => sum + row.expectedReports, 0);
  const baselineExpected = predictReportCounts(series, targetStartDate, "historical_average").reduce((sum, row) => sum + row.expectedReports, 0);
  // Descriptive uncertainty, NOT a claimed confidence interval. Keep a minimum
  // width even if artificial constant scenarios have zero backtest error.
  const width = Math.max(1, Math.ceil(Math.max(...selected.folds.map((fold) => Math.abs(fold.error)))));
  return {
    status: "available" as const, stats, policy: OUTLOOK_POLICY,
    method: selected.method, targetStartDate, targetEndDate: daily.at(-1)!.date,
    expectedReports: round(expected), baselineExpectedReports: round(baselineExpected),
    range: { lower: Math.max(0, Math.floor(expected - width)), upper: Math.ceil(expected + width),
      label: "Historical-error range", calibratedConfidenceInterval: false,
      basis: "Estimate plus/minus the largest absolute weekly error from six earlier rolling backtests, minimum width one report." },
    daily: daily.map((row) => ({ ...row, expectedReports: round(row.expectedReports) })),
    evaluation: { scope: "Past rolling calibration, not independent real-world validation", selectedMae: round(selected.mae), baselineMae: round(baseline.mae), candidateMae: round(candidate.mae), folds: 6 },
  };
}

export function buildRiskOutlook(rows: HistoryReport[], options: { now: number; barangay?: string }) {
  const end = utcDay(options.now); // today's partial counts never enter fitting
  const cutoff = end - 365 * DAY;
  const selectedBarangay = options.barangay ? canonicalBarangay(options.barangay) : "";
  if (options.barangay && !selectedBarangay) throw new Error("Invalid barangay.");
  const seen = new Set<string>();
  const dates: number[] = [];
  const excluded = { duplicateIds: 0, status: 0, date: 0, location: 0, otherBarangay: 0 };
  for (const row of rows) {
    if (seen.has(row.id)) { excluded.duplicateIds++; continue; }
    seen.add(row.id);
    if (!["pending review", "under verification", "resolved"].includes(String(row.status || "").trim().toLowerCase())) { excluded.status++; continue; }
    const time = Date.parse(row.created_at || "");
    if (!Number.isFinite(time) || time < cutoff || time >= end) { excluded.date++; continue; }
    const hasAnyCoordinate = row.latitude != null || row.longitude != null;
    if (hasAnyCoordinate && !hasReportCoordinates(row)) { excluded.location++; continue; }
    const barangay = deriveBarangay(row.location || "", row);
    if (!barangay) { excluded.location++; continue; }
    if (selectedBarangay && barangay !== selectedBarangay) { excluded.otherBarangay++; continue; }
    dates.push(utcDay(time));
  }
  const first = dates.length ? Math.min(...dates) : end;
  const counts = Array<number>((end - first) / DAY).fill(0);
  for (const day of dates) counts[(day - first) / DAY]!++;
  const forecast = forecastDailySeries({ startDate: isoDate(first), counts }, isoDate(end + DAY));
  return {
    ...forecast, dataMode: "synthetic", asOf: new Date(options.now).toISOString(),
    scope: selectedBarangay || "All Barangays", historyStartDate: dates.length ? isoDate(first) : null,
    historyEndDate: isoDate(end - DAY), excluded,
    targetDefinition: "Submitted report counts for the next seven full UTC days, starting tomorrow; not incident probability or verified crime counts.",
    assumption: "No stored report on a day is treated as zero submissions, not proof of no incidents. History length starts at the first eligible report, not a verified monitoring start date. Resolved reports remain in history; unverified submissions are included.",
    limitation: "Synthetic prototype only. No real-world prediction accuracy, crime-risk probability or policing effectiveness has been established. Sentiment does not change forecast values.",
  };
}
