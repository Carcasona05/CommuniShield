import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { mergeReportDetails, normalizeReportStatus } from "../../clients/services/reportPresentation.js";
import { createSessionData } from "../../clients/services/sessionData.js";
import { querySnapshotKey } from "../../clients/services/querySnapshots.js";

const read = path => readFileSync(new URL(`../../clients/${path}`, import.meta.url), "utf8");
test("report statuses share one normalization, including fake and explicit pending statuses", () => {
  for (const status of ["Pending Review", "Under Verification", "Resolved", "Rejected", "Archived", "Marked Fake"]) {
    assert.equal(normalizeReportStatus(status, true), status);
  }
  assert.equal(normalizeReportStatus("fake"), "Marked Fake");
  assert.equal(normalizeReportStatus("Verified"), "Resolved");
  assert.equal(normalizeReportStatus("not verified"), "Pending Review");
  for (const file of ["components/ReportPost_Layout.jsx", "components/User_compo/MyUser_RepPost_Layout.jsx", "components/User_compo/User_RepPostView_Layout.jsx", "components/User_compo/MyUser_RepPostView_Layout.jsx"]) {
    assert.match(read(file), /return normalizeReportStatus\(/);
    assert.match(read(file), /case "Marked Fake":/);
  }
});
test("fresh database reports preserve the feed presentation and cannot replace another post", () => {
  const first = { id: "a", userName: "Old", datePosted: "old", status: "Pending Review" };
  assert.equal(mergeReportDetails(first, { id: "b", status: "Rejected" }), first);
  const fresh = mergeReportDetails(first, { id: "a", poster_name: "New", created_at: "today", status: "Marked Fake", is_verified: false, is_liked: true });
  assert.equal(fresh.userName, "New");
  assert.equal(fresh.status, "Marked Fake");
  assert.equal(fresh.isLiked, true);
  assert.equal(fresh.datePosted, "today");
});
test("fresh detail statuses update Home and My Reports including filtered transport caches", async () => {
  const data = createSessionData();
  data.begin("a", "user");
  for (const [url, params] of [["/reports", { period: "24h" }], ["/reports/mine", undefined]]) {
    const config = { url, params, sessionToken: "a", sessionEpoch: data.epoch() };
    await data.run(config, async () => ({ status: 200, data: { reports: [{ id: "one", status: "Pending Review" }, { id: "two", status: "Resolved" }] } }));
    data.patchReports("one", report => ({ ...report, status: "Marked Fake" }));
    assert.equal(data.get(querySnapshotKey(url, params)).data.reports[0].status, "Marked Fake");
    const cached = await data.run(config, () => assert.fail("should reuse the patched fresh response"));
    assert.equal(cached.data.reports[0].status, "Marked Fake");
    assert.equal(cached.data.reports[1].status, "Resolved");
  }
});
test("both detail layouts share the paginated, report-scoped comment hook", () => {
  for (const file of ["components/User_compo/User_RepPostView_Layout.jsx", "components/User_compo/MyUser_RepPostView_Layout.jsx"]) {
    assert.match(read(file), /usePaginatedComments\((?:post|report)\?\.id/);
    assert.match(read(file), /\{commentTotal\} Comments/);
  }
  const source = read("hooks/usePaginatedComments.js");
  assert.match(source, /currentId\.current === reportId && generation\.current === ticket/);
  assert.match(source, /return \(\) => \{ generation\.current\+\+; \}/);
});
test("route parameter changes remount detail state and fresh status patches both list caches", () => {
  for (const file of ["app/(tabs)/User_RepPostView.jsx", "app/(tabs)/MyUser_RepPostView.jsx"]) {
    const source = read(file);
    assert.match(source, /Inner key=\{String\(/);
    assert.match(source, /refresh\(\(\) => active\)/);
    assert.match(source, /patchCachedReports\(report.id/);
  }
});
