import { forecastDailySeries, predictReportCounts, type DailySeries } from "../../src/services/riskOutlookService.js";

const DAY = 86400000;
export const EVALUATION_SEED = 20261022;
export function syntheticOutlookEvaluation(seed = EVALUATION_SEED) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) throw new Error("Seed must be a uint32 integer.");
  const scenarios = ["steady", "weekday-pattern", "gradual-growth", "late-shock", "sparse", "short-history", "reporting-gap"].map((name) => {
    let state = seed >>> 0;
    for (const character of name) state = Math.imul(state ^ character.charCodeAt(0), 16777619) >>> 0;
    const random = () => {
      state = (state + 0x6D2B79F5) >>> 0;
      let value = state;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
    const poisson = (mean: number) => {
      let product = 1;
      let count = 0;
      do { count++; product *= random(); } while (product > Math.exp(-mean));
      return count - 1;
    };
    const length = name === "short-history" ? 40 : 224;
    const start = Date.parse("2026-10-22T00:00:00Z") - length * DAY;
    const counts = Array.from({ length }, (_, index) => {
      if (name === "sparse") return index % 35 === 0 ? 1 : 0;
      if (name === "reporting-gap" && index >= length - 70) return 0;
      const weekday = new Date(start + index * DAY).getUTCDay();
      const mean = name === "weekday-pattern" ? weekday === 0 || weekday === 6 ? 8 : 2 :
        name === "gradual-growth" ? 1 + index / 50 : name === "late-shock" && index >= length - 28 ? 12 : 3;
      return poisson(mean);
    });
    const series = { startDate: new Date(start).toISOString().slice(0, 10), counts };
    const folds = [];
    // Four later, non-overlapping weeks. Method selection and error-range
    // calibration run INSIDE each training prefix, never on future targets.
    if (length >= 140) {
      for (let fold = 0; fold < 4; fold++) {
        const targetIndex = length - 28 + fold * 7;
        const prefix: DailySeries = { startDate: series.startDate, counts: counts.slice(0, targetIndex - 1) };
        const targetStartDate = new Date(start + targetIndex * DAY).toISOString().slice(0, 10);
        const forecast = forecastDailySeries(prefix, targetStartDate);
        if (forecast.status !== "available") {
          folds.push({ targetStartDate, status: forecast.status, reasons: forecast.reasons });
          continue;
        }
        const actual = counts.slice(targetIndex, targetIndex + 7).reduce((sum, count) => sum + count, 0);
        // Compare all methods at the same displayed precision, not a rounded
        // selected prediction against unrounded competitor totals.
        const displayed = (value: number) => Math.round(value * 10) / 10;
        const baseline = displayed(predictReportCounts(prefix, targetStartDate, "historical_average").reduce((sum, day) => sum + day.expectedReports, 0));
        const weekday = displayed(predictReportCounts(prefix, targetStartDate, "recent_weekday").reduce((sum, day) => sum + day.expectedReports, 0));
        folds.push({ status: "available", targetStartDate, trainingEndDate: new Date(start + (targetIndex - 2) * DAY).toISOString().slice(0, 10),
          actual, estimate: forecast.expectedReports, baseline, weekday, method: forecast.method,
          absoluteError: Math.abs(forecast.expectedReports - actual), baselineError: Math.abs(baseline - actual), weekdayError: Math.abs(weekday - actual),
          range: forecast.range, rangeContainsActual: actual >= forecast.range.lower && actual <= forecast.range.upper });
      }
    }
    const gate = forecastDailySeries(series, "2026-10-23");
    return { name, series, gateStatus: gate.status, folds };
  });
  const scored = scenarios.flatMap((scenario) => scenario.folds).filter((fold) => fold.status === "available");
  const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  return {
    schemaVersion: 1, seed, dataMode: "synthetic", referenceDate: "2026-10-22", scenarios,
    protocol: "Four non-overlapping target weeks per eligible scenario; one unobserved gap day; select method/calibrate range only inside each earlier prefix. Later target counts are read for scoring only. All methods scored at the same one-decimal precision as the UI.",
    summary: { scoredWeeks: scored.length,
      selectedMae: average(scored.map((fold) => fold.absoluteError!)),
      baselineMae: average(scored.map((fold) => fold.baselineError!)),
      weekdayMae: average(scored.map((fold) => fold.weekdayError!)),
      observedRangeCoverage: average(scored.map((fold) => fold.rangeContainsActual ? 1 : 0)),
    },
    limitation: "Synthetic time-series behaviour, not crime prediction accuracy. Historical-error bands are descriptive and may miss sudden changes; observed coverage is not guaranteed future coverage. No production parameters changed.",
  };
}
