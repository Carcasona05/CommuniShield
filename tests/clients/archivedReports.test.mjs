import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../../clients/${path}`, import.meta.url), "utf8");

// Archived reports live only in Logs > Archived reports. Every other screen
// filters them out on its own, so a stale cache or an outdated server cannot
// leak them back into a feed.
const screens = [
  {
    page: "app/(tabs)/User_Home.jsx",
    patterns: [
      /const statusOptions = \[[^\]]*?"Rejected",\s*\];/,
      /report\.status === "Archived"\) return false;/,
    ],
  },
  {
    page: "app/(tabs)/User_MyReports.jsx",
    patterns: [
      /const statusOptions = \[[^\]]*?"Rejected",\s*\];/,
      /report\.status !== "Archived"/,
    ],
  },
  {
    page: "app/(admin)/Admin_Validation.jsx",
    patterns: [
      /\.filter\(\(r\) => r\.status !== "Archived"\)/,
      /handleArchiveReport = \(report, group, message\) => \{\s*applyValidation\(report, "Archived", message\);/,
    ],
  },
  {
    page: "app/(sadmin)/SAdmin_Validation.jsx",
    patterns: [
      /\.filter\(\(r\) => r\.status !== "Archived"\)/,
      /handleArchiveReport = \(report, group, message\) => \{\s*applyValidation\(report, "Archived", message\);/,
    ],
  },
  {
    page: "app/(admin)/Admin_ReportManagement.jsx",
    patterns: [/\.filter\(\(item\) => item\.status !== "Archived"\)/],
  },
  {
    page: "app/(admin)/Admin_Dashboard.jsx",
    patterns: [
      /\.filter\(\(r\) => r\.status !== "Archived"\)/,
      /r\.status !== "Archived"\r?\n\s*\);/,
    ],
  },
  {
    page: "app/(admin)/Admin_Ince_Map.jsx",
    patterns: [/report\.status === "Archived"\)\r?\n\s*return false;/],
  },
];

for (const screen of screens) {
  test(`${screen.page} keeps archived reports out of its list`, () => {
    const source = read(screen.page);
    for (const pattern of screen.patterns) {
      assert.match(source, pattern);
    }
  });
}

test("the archive action is wired from the similar-reports menu", () => {
  const source = read("components/Admin_compo/Admin_ViewSimilarReportsModal.jsx");
  assert.match(source, /onArchiveReport\(report, compiledGroup, "Moved to archived reports"\)/);
  assert.match(source, /Move to Archived Reports/);
});

test("the super admin status filter no longer offers Archived", () => {
  const source = read("app/(sadmin)/SAdmin_Validation.jsx");
  const filters = /const statusFilters = \[[^\]]*\]/.exec(source);
  assert.ok(filters, "statusFilters must exist");
  assert.doesNotMatch(filters[0], /"Archived"/);
});

test("admin Logs asks the server for archived reports explicitly", () => {
  const source = read("app/(admin)/Admin_Logs.jsx");
  assert.match(source, /params: \{ status: "Archived" \}/);
  assert.match(source, /\{ key: "archived", label: "Archived reports"/);
  assert.match(source, /\{ key: "activity", label: "Activity logs"/);
  assert.match(source, /testID="archived-report-row"/);
  assert.match(source, /status: "Pending Review", is_verified: false/);
});
