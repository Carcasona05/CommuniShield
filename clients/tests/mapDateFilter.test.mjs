import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { MAP_DATE_PERIODS, createMapDateFilter } from "../services/mapDateFilter.js";

const now = new Date("2026-11-13T04:00:00Z");

test("shared map date presets match the Dashboard", () => {
  assert.deepEqual(MAP_DATE_PERIODS, ["All dates", "Today", "Past 7 days", "Past 30 days"]);
  assert.equal(createMapDateFilter("All dates", now)(null), true);
});

test("Today follows Argao midnight and rejects invalid or future timestamps", () => {
  const matches = createMapDateFilter("Today", now);
  assert.equal(matches("2026-11-12T15:59:59.999Z"), false);
  assert.equal(matches("2026-11-12T16:00:00Z"), true);
  assert.equal(matches(now.toISOString()), true);
  assert.equal(matches("2026-11-13T04:00:00.001Z"), false);
  assert.equal(matches("invalid"), false);
});

for (const days of [7, 30]) {
  test(`Past ${days} days shares the Dashboard's inclusive rolling window`, () => {
    const matches = createMapDateFilter(`Past ${days} days`, now);
    const start = now.getTime() - days * 86400000;
    assert.equal(matches(new Date(start).toISOString()), true);
    assert.equal(matches(new Date(start - 1).toISOString()), false);
    assert.equal(matches(now.toISOString()), true);
    assert.equal(matches(undefined), false);
  });
}

test("Incident Mapping uses shared date presets without adopting verified-only eligibility", () => {
  const source = readFileSync(new URL("../app/(admin)/Admin_Ince_Map.jsx", import.meta.url), "utf8");
  assert.match(source, /options=\{MAP_DATE_PERIODS\.map/);
  assert.match(source, /createMapDateFilter\(selectedMapPeriod\)/);
  assert.match(source, /matchesDate\(report.created_at\)/);
  assert.doesNotMatch(source, /BatchDateRangeDropdown|filterDashboardMapReports/);
});

test("selecting a map pin can render its report date without an undefined helper", () => {
  const source = readFileSync(new URL("../app/(admin)/Admin_Ince_Map.jsx", import.meta.url), "utf8");
  const helper = source.match(/const getReportDate = \(report\) => \{[\s\S]*?\n\};/)?.[0];
  assert.ok(helper, "The pin-details date helper must remain defined when date filters change");
  const expression = source.match(/getReportDate\(selectedReport\)\?\.toLocaleString\(\) \|\| "Date unavailable"/)?.[0];
  assert.ok(expression, "Exercise the date expression used by the selected-pin panel");
  const getReportDate = vm.runInNewContext(`${helper}\ngetReportDate;`);
  for (const field of ["created_at", "reported_at", "date"]) {
    const selectedReport = { [field]: "2026-11-13T04:00:00Z" };
    assert.equal(getReportDate(selectedReport).toISOString(), "2026-11-13T04:00:00.000Z");
    assert.notEqual(vm.runInNewContext(`${helper}\n${expression}`, { selectedReport }), "Date unavailable");
  }
  for (const selectedReport of [null, {}, { created_at: "invalid" }, { created_at: "" }]) {
    assert.equal(vm.runInNewContext(`${helper}\n${expression}`, { selectedReport }), "Date unavailable");
  }
});
