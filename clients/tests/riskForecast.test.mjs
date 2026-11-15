import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { FORECAST_DISCLAIMER, validRiskForecastResponse, forecastMethodLabel, formatForecastDate } from "../services/riskForecast.js";
import { usableQuerySnapshot, QUERY_SNAPSHOT_TTL_MS } from "../services/querySnapshots.js";

const now = new Date("2026-11-13T04:00:00Z");
const daily = Array.from({ length: 7 }, (_, index) => ({ date: `2026-11-${14 + index}`, expectedReports: 3 }));
function response(scope = "All Barangays", changes = {}) {
  return { scope, forecast: { scope, status: "available", asOf: now.toISOString(),
    targetStartDate: "2026-11-14", targetEndDate: "2026-11-20", expectedReports: 21,
    baselineExpectedReports: 21, daily, range: { lower: 20, upper: 22 }, ...changes } };
}

test("available estimates are accepted for the selected scope, including legitimate zero estimates", () => {
  assert.equal(validRiskForecastResponse(response(), "All Barangays", now), true);
  assert.equal(validRiskForecastResponse(response("Lamacan"), "Lamacan", now), true);
  assert.equal(validRiskForecastResponse(response("Lamacan", { expectedReports: 0 }), "Lamacan", now), true);
});

test("switching barangay cannot show the previous scope's forecast", () => {
  assert.equal(validRiskForecastResponse(response(), "Lamacan", now), false);
  assert.equal(validRiskForecastResponse(response("Lamacan", { scope: "All Barangays" }), "Lamacan", now), false);
});

test("old or shifted forecasts cannot be presented as tomorrow's estimates", () => {
  assert.equal(validRiskForecastResponse(response(), "All Barangays", new Date("2026-11-14T00:00:00Z")), false);
  for (const changes of [{ asOf: "2026-11-12T23:59:59Z" }, { asOf: 42 }, { targetStartDate: "2026-11-13" },
    { targetEndDate: "2026-11-21" }]) {
    assert.equal(validRiskForecastResponse(response("All Barangays", changes), "All Barangays", now), false);
  }
});

test("forecast snapshots expire after five minutes and across UTC midnight", () => {
  const data = response();
  const time = now.getTime();
  assert.equal(usableQuerySnapshot({ data, checkedAt: time - 1000 }, time), true);
  assert.equal(usableQuerySnapshot({ data, checkedAt: time - QUERY_SNAPSHOT_TTL_MS }, time), false);
  assert.equal(usableQuerySnapshot({ data, checkedAt: time + 1 }, time), false);
  assert.equal(usableQuerySnapshot({ data, checkedAt: Date.parse("2026-11-13T23:59:59Z") }, Date.parse("2026-11-14T00:00:01Z")), false);
});

test("missing, nonfinite or incomplete estimates fail closed instead of displaying invented zeros", () => {
  for (const changes of [{ expectedReports: null }, { expectedReports: NaN }, { expectedReports: -1 },
    { baselineExpectedReports: undefined }, { daily: [] }, { daily: daily.slice(1) },
    { daily: [{ date: "bad", expectedReports: 3 }, ...daily.slice(1)] },
    { daily: [{ ...daily[0], expectedReports: Infinity }, ...daily.slice(1)] },
    { range: { lower: 30, upper: 20 } }, { range: null }]) {
    assert.equal(validRiskForecastResponse(response("All Barangays", changes), "All Barangays", now), false);
  }
});

test("insufficient history and unavailable history are valid explicit non-estimate states", () => {
  for (const status of ["insufficient_data", "unavailable"]) {
    const data = { scope: "Lamacan", forecast: { status, reasons: ["History unavailable"] } };
    assert.equal(validRiskForecastResponse(data, "Lamacan", now), true);
    assert.equal(validRiskForecastResponse(data, "All Barangays", now), false);
  }
  assert.equal(validRiskForecastResponse({ scope: "All Barangays", forecast: { status: "not_requested" } }, "All Barangays", now), false);
  assert.equal(validRiskForecastResponse(null, "All Barangays", now), false);
});

test("presentation labels preserve the prototype and uncertainty limitations", () => {
  assert.match(FORECAST_DISCLAIMER, /synthetic prototype/);
  assert.match(FORECAST_DISCLAIMER, /not crime probability/);
  assert.match(FORECAST_DISCLAIMER, /sole basis/);
  assert.equal(forecastMethodLabel("historical_average"), "Historical average");
  assert.equal(forecastMethodLabel("recent_weekday"), "Recent weekday pattern");
  assert.equal(formatForecastDate("2026-11-14"), "Nov 14, 2026");
  assert.equal(formatForecastDate(undefined), "Not recorded");
});

test("compact forecast appears inside Current report locations below the barangay filter", () => {
  const panel = readFileSync(new URL("../components/Admin_compo/RiskForecastPanel.jsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/(admin)/Admin_Risk_Prediction.jsx", import.meta.url), "utf8");
  assert.match(page, /params: \{ view: "current" \}/);
  assert.match(page, /<RiskForecastPanel scope=\{selectedBarangay\} \/>/);
  assert.ok(page.indexOf("<RiskForecastPanel") > page.indexOf("Current report locations"));
  assert.ok(page.indexOf("<RiskForecastPanel") > page.indexOf('testID="risk-zone-location-filter"'));
  assert.ok(page.indexOf("<RiskForecastPanel") < page.indexOf("<View style={styles.mapFrame}>"));
  assert.ok(page.indexOf("<RiskForecastPanel") < page.indexOf("Observed evidence & review"));
  assert.match(panel, /accessibilityRole="header"/);
  assert.match(panel, /Experimental Forecast/);
  assert.match(panel, /params: scope === "All Barangays" \? \{\} : \{ barangay: scope \}/);
  assert.match(panel, /validRiskForecastResponse\(data, scope\)/);
  assert.match(panel, /number\(forecast.expectedReports\)/);
  assert.match(panel, /Math.round\(value\).toLocaleString\("en-US", \{ maximumFractionDigits: 0 \}\)/);
  assert.doesNotMatch(panel, /forecast.baselineExpectedReports|Weekly average/);
  assert.match(panel, /testID="forecast-expected-container"/);
  assert.doesNotMatch(panel, /forecast-history-container|Available history|forecast.stats/);
  assert.match(panel, /label="Expected · next 7 days"/);
  assert.match(panel, /label="Daily average estimate"/);
  assert.match(panel, /About \$\{number\(forecast.expectedReports \/ 7\)\}/);
  assert.match(panel, /label="Reports · past 7 days"/);
  assert.match(panel, /number\(forecast.recentReports\?\.count\)/);
  assert.doesNotMatch(panel, /Past-error range|forecast.range/);
  assert.doesNotMatch(panel, /Weekly average uses|Refreshing forecast/);
  assert.match(panel, /panel: \{ gap: 7 \}/);
  assert.match(panel, /Do not rely on this forecast alone/);
  assert.match(panel, /incidents cannot be predicted with certainty/);
  assert.match(panel, /helps admins plan ahead based on past reports/);
  assert.match(panel, /Insufficient data for a forecast/);
  assert.match(panel, /<QueryErrorNotice/);
  assert.doesNotMatch(panel, /forecast\.daily|Method & historical checks|badge/);
});

test("forecast redesign remains compact and uses three aligned tiles without an outer card", () => {
  const source = readFileSync(new URL("../components/Admin_compo/RiskForecastPanel.jsx", import.meta.url), "utf8");
  const styles = vm.runInNewContext(source.slice(source.indexOf("const styles = StyleSheet.create")) + "\nstyles;", {
    StyleSheet: { create: value => value },
  });
  assert.equal((source.match(/<Metric\b/g) || []).length, 3);
  assert.equal(styles.panel.backgroundColor, undefined);
  assert.equal(styles.panel.borderWidth, undefined);
  assert.equal(styles.metricRow.flexDirection, "row");
  assert.equal(styles.metricRow.flexWrap, "wrap");
  assert.equal(styles.metricItem.flex, 1);
  assert.ok(styles.metricItem.paddingVertical <= 10);
  assert.ok(styles.value.fontSize <= 20);
  assert.ok(styles.warning.fontSize <= 11);
  assert.match(source, /<Metric primary label="Expected/);
});
