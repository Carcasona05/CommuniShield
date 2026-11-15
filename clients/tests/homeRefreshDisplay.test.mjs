import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("Home has pull-to-refresh without a report-load error/retry box", () => {
  const home = readFileSync(new URL("../app/(tabs)/User_Home.jsx", import.meta.url), "utf8");
  assert.match(home, /<RefreshControl/);
  assert.match(home, /onRefresh=\{handleRefresh\}/);
  assert.doesNotMatch(home, /Retry loading reports|\{loadError\}/);
  assert.match(home, /!loadError && filteredReports.length === 0/);
  assert.match(home, /visibleReports.map/);
});

test("My Reports has pull-to-refresh without a report-load error/retry box", () => {
  const reports = readFileSync(new URL("../app/(tabs)/User_MyReports.jsx", import.meta.url), "utf8");
  assert.match(reports, /<RefreshControl/);
  assert.match(reports, /onRefresh=\{handleRefresh\}/);
  assert.doesNotMatch(reports, /Retry loading reports|\{loadError\}/);
  assert.match(reports, /filteredReports.length === 0 && !loadError/);
  assert.match(reports, /Could not update the report|Could not delete the report/);
});
