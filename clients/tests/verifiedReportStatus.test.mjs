import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { normalizeReportStatus } from "../services/reportPresentation.js";
import { filterDashboardMapReports } from "../services/dashboardMap.js";
import { isActiveRiskReport } from "../services/riskZones.js";
const read = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("Verified is displayed as an ordinary status, distinct from review and resolution", () => {
  for (const status of ["Pending Review", "Under Verification", "Verified", "Resolved", "Rejected", "Archived", "Marked Fake"]) {
    assert.equal(normalizeReportStatus(status, true), status);
  }
  assert.equal(normalizeReportStatus(" verified "), "Verified");
  assert.equal(normalizeReportStatus(undefined, true), "Verified");
});

test("Admin and Super Admin share a separate Verified action and filter", () => {
  const page = read("../components/Admin_compo/ValidationPage.jsx");
  const modal = read("../components/Admin_compo/Admin_ViewSimilarReportsModal.jsx");
  assert.match(page, /verified: "Verified"/);
  assert.match(page, /applyValidation\(target, "Verified"\)/);
  assert.match(page, /applyValidation\(target, "Under Verification"\)/);
  assert.match(page, /applyValidation\(target, "Resolved"\)/);
  assert.match(page, /is_verified: newStatus === "Verified" \|\| newStatus === "Resolved"/);
  assert.match(page, /onConfirmVerified=\{handleConfirmVerified\}/);
  assert.match(modal, /onPress=\{\(\) => onConfirmVerified\?\.\(compiledGroup\)\}/);
  assert.match(modal, /accessibilityLabel="Mark report Verified"/);
  assert.match(page, /"Under Verification", "Verified", "Resolved"/);
});

test("user feed filters and status renderers recognize Verified without replacing Resolved", () => {
  for (const file of ["../app/(tabs)/User_Home.jsx", "../app/(tabs)/User_MyReports.jsx"]) {
    assert.match(read(file), /"Verified"/);
  }
  for (const file of ["../components/ReportPost_Layout.jsx", "../components/User_compo/MyUser_RepPost_Layout.jsx",
    "../components/User_compo/User_RepPostView_Layout.jsx", "../components/User_compo/MyUser_RepPostView_Layout.jsx"]) {
    assert.match(read(file), /case "Verified":\s*case "Resolved":\s*return \{\s*label: currentStatus/);
  }
});

test("Verified reports remain active for risk and eligible for the verified Dashboard map", () => {
  const report = { id: "verified", status: "Verified", is_verified: true, latitude: 9.88, longitude: 123.59 };
  assert.equal(isActiveRiskReport(report), true);
  assert.deepEqual(filterDashboardMapReports([report]), [report]);
  assert.equal(isActiveRiskReport({ ...report, status: "Resolved" }), false);
});
