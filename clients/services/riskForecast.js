export const FORECAST_DISCLAIMER = "Experimental synthetic prototype: estimates submitted report activity, not crime probability or whether an area is safe or dangerous. Real-world accuracy has not been established. Do not use this forecast as the sole basis for operational decisions.";

export function validRiskForecastResponse(data, scope, now = new Date()) {
  const forecast = data?.forecast;
  if (data?.scope !== scope || !forecast ||
    !["available", "insufficient_data", "unavailable"].includes(forecast.status)) return false;
  if (forecast.scope && forecast.scope !== scope) return false;
  if (forecast.status !== "available") return true;
  const today = now.toISOString().slice(0, 10);
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  // Never present a different scope's estimate or yesterday's forecast as current.
  if (typeof forecast.asOf !== "string" || forecast.asOf.slice(0, 10) !== today || forecast.targetStartDate !== tomorrow) return false;
  if (!Number.isFinite(forecast.expectedReports) || forecast.expectedReports < 0 ||
    !Number.isFinite(forecast.baselineExpectedReports) || forecast.baselineExpectedReports < 0 ||
    !Number.isFinite(forecast.range?.lower) || !Number.isFinite(forecast.range?.upper) ||
    forecast.range.lower < 0 || forecast.range.upper < forecast.range.lower ||
    !Array.isArray(forecast.daily) || forecast.daily.length !== 7) return false;
  return forecast.daily.every((row, index) => row.date === new Date(Date.parse(`${tomorrow}T00:00:00Z`) + index * 86400000).toISOString().slice(0, 10) &&
    Number.isFinite(row.expectedReports) && row.expectedReports >= 0) && forecast.targetEndDate === forecast.daily[6].date;
}

export function forecastMethodLabel(method) {
  return method === "historical_average" ? "Historical average"
    : method === "recent_weekday" ? "Recent weekday pattern" : "Not recorded";
}

export function formatForecastDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "Not recorded";
}
