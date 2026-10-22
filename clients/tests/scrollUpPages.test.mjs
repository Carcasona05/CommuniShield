import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const pages = [
  "(admin)/Admin_Risk_Prediction.jsx",
  "(admin)/Admin_ReportManagement.jsx",
  "(admin)/Admin_Logs.jsx",
  "(admin)/Admin_Validation.jsx",
  "(sadmin)/SAdmin_AuditLogs.jsx",
  "(sadmin)/SAdmin_Validation.jsx",
  "(tabs)/User_Home.jsx",
  "(tabs)/User_MyReports.jsx",
];

for (const page of pages) {
  test(`${page} connects its scroll-up button to the shared animation`, () => {
    const source = readFileSync(new URL(`../app/${page}`, import.meta.url), "utf8");
    assert.match(source, /useSmoothScrollToTop\(scroll(?:View)?Ref\)/);
    assert.match(source, /onPress=\{scrollToTop\}/);
    assert.match(source, /trackScroll\((?:event|e)\)/);
    assert.match(source, /onScrollBeginDrag=\{stopScrollAnimation\}/);
    assert.match(source, /onTouchStart=\{stopScrollAnimation\}/);
    assert.match(source, /accessibilityLabel="Back to top"/);
  });
}
