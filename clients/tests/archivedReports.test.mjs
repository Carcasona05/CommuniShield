import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// Archived reports live only in Logs > Archived reports. Every other screen
// filters them out in its screen or shared server read model.
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
      /endpoint: "\/admin\/validation-groups"/,
      /handleArchiveReport = \(report, group, message\) => \{\s*applyValidation\(report, "Archived", message\);/,
    ],
  },
  {
    page: "app/(sadmin)/SAdmin_Validation.jsx",
    patterns: [
      /endpoint: "\/admin\/validation-groups"/,
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
    const route = read(screen.page);
    const source = /<ValidationPage Layout=/.test(route) ? read("components/Admin_compo/ValidationPage.jsx") : route;
    if (/<ValidationPage Layout=/.test(route)) {
      const service = readFileSync(new URL("../../server/src/services/validationGroupsService.ts", import.meta.url), "utf8");
      assert.match(service, /report\.status !== "Archived"/);
    }
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
  const source = read("components/Admin_compo/ValidationPage.jsx");
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
