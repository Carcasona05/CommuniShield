import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { recordFilters, recordDateRange, recordListTitle, matchesRecordFilters, canManageRecord } from "../services/adminBrowsing.js";

test("records default to Admin and User forces Incident even with contradictory type", () => {
  assert.equal(recordFilters({}).actorRole, "admin");
  assert.equal(recordFilters({ postBy: "All" }).actorRole, "admin");
  assert.equal(recordFilters({ postBy: "User", reportType: "Blotter" }).kind, "Incident");
  assert.equal(recordFilters({ postBy: "Super Admin", reportType: "Announcement" }).kind, "Announcement");
});

test("source and report type determine the heading", () => {
  assert.equal(recordListTitle("Admin", "All"), "Admin-Created Records");
  assert.equal(recordListTitle("User", "Incident"), "User-Created Incidents");
  assert.equal(recordListTitle("Super Admin", "Announcement"), "Super Admin-Created Announcements");
});

test("local records exclude rejected, fake and archived rows; user records are read-only here", () => {
  for (const status of ["Rejected", "Marked Fake", "Archived"]) assert.equal(matchesRecordFilters({ status }, {}), false);
  assert.equal(matchesRecordFilters({ status: "Verified", actorRole: "user", kind: "Incident" }, recordFilters({ postBy: "User" })), true);
  assert.equal(canManageRecord({ actorRole: "user", kind: "Incident" }), false);
  assert.equal(canManageRecord({ actorRole: "admin", kind: "Incident" }), true);
});

test("shared UI has no All source, locks User type and guards mutation controls", () => {
  const source = readFileSync(new URL("../components/Admin_compo/RecordManagementPage.jsx", import.meta.url), "utf8");
  assert.match(source, /POST_BY_OPTIONS = \["Admin", "Super Admin", "User"\]/);
  assert.match(source, /\[postBy, setPostBy\] = useState\("Admin"\)/);
  assert.match(source, /setReportType\(value === "User" \? "Incident" : "All"\)/);
  assert.match(source, /disabled=\{postBy === "User"\}/);
  assert.match(source, /recordListTitle\(postBy, reportType\)/);
  assert.match(source, /\{canManageRecord\(previewRecord\) \? \(/);
  assert.doesNotMatch(source, /FILTER_STATUSES = [^\n]*(Rejected|Marked Fake|Archived)/);
});

test("Similar Reports attachments use selected-photo viewer shared by both admin roles", () => {
  const source = readFileSync(new URL("../components/Admin_compo/Admin_ViewSimilarReportsModal.jsx", import.meta.url), "utf8");
  assert.match(source, /accessibilityLabel=\{`Open report photo \$\{index \+ 1\}`\}/);
  assert.match(source, /setPhotoViewer\(\{ images: reportImageList\(reportImages\), index \}\)/);
  assert.match(source, /<FullscreenImageViewer images=\{photoViewer.images\} initialIndex=\{photoViewer.index\}/);
});

test("record date presets match Argao Today and rolling seven/thirty-day ranges", () => {
  const now = new Date("2026-11-16T02:30:00Z");
  assert.deepEqual(recordDateRange("All dates", now), {});
  assert.deepEqual(recordDateRange("Today", now), { from: "2026-11-15T16:00:00.000Z", to: now.toISOString() });
  assert.equal(Date.parse(recordDateRange("Past 7 days", now).from), now.getTime() - 7 * 86400000);
  assert.equal(Date.parse(recordDateRange("Past 30 days", now).from), now.getTime() - 30 * 86400000);
  const params = recordFilters({ datePeriod: "Today", dateAnchor: now, postBy: "User" });
  assert.equal(params.from, "2026-11-15T16:00:00.000Z");
  assert.equal(params.kind, "Incident");
  assert.equal(matchesRecordFilters({ kind: "Incident", actorRole: "user", status: "Verified", created_at: "2026-11-15T15:59:59Z" }, params), false);
  const source = readFileSync(new URL("../components/Admin_compo/RecordManagementPage.jsx", import.meta.url), "utf8");
  assert.match(source, /options=\{MAP_DATE_PERIODS\}/);
  assert.doesNotMatch(source, /BatchDateRangeDropdown/);
});
