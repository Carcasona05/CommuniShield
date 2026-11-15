import assert from "node:assert/strict";
import { test } from "node:test";
import { compareRecords, localBlotterRecord, recordFilters } from "../services/adminBrowsing.js";

test("Report Management sorts by status, severity, then oldest creation date", () => {
  const statuses = ["Pending Review", "Under Verification", "Verified", "Resolved", "Rejected", "Marked Fake"];
  const rows = statuses.flatMap((status, rank) => ["Critical", "High", "Medium", "Low", "Unknown"].map((severity, level) => ({
    id: `${rank}-${level}`, kind: "Incident", status, severity, created_at: "2026-11-15T00:00:00Z",
  })));
  assert.deepEqual([...rows].reverse().sort(compareRecords).map(row => row.id), rows.map(row => row.id));
  const old = { ...rows[0], id: "old", created_at: "2026-11-01T00:00:00.123455Z" };
  const newer = { ...rows[0], id: "new", created_at: "2026-11-01T00:00:00.123456Z" };
  assert.deepEqual([newer, old].sort(compareRecords).map(row => row.id), ["old", "new"]);
});

test("rejecting an incident moves it below unresolved and resolved incidents", () => {
  const first = { id: "top", kind: "Incident", status: "Pending Review", severity: "Critical", created_at: "2026-11-01" };
  const second = { ...first, id: "other", severity: "Low" };
  const resolved = { ...first, id: "resolved", status: "Resolved" };
  assert.equal([resolved, first, second].sort(compareRecords)[0].id, "top");
  assert.equal([resolved, { ...first, status: "Rejected" }, second].sort(compareRecords).at(-1).id, "top");
});

test("announcements and blotters follow incidents and keep newest-first without severity priority", () => {
  const incident = { id: "incident", kind: "Incident", status: "Marked Fake", severity: "Unknown", created_at: "2020-01-01" };
  const blotter = localBlotterRecord({ id: "local", created_at: "2026-11-15" });
  const announcement = { id: "announcement", kind: "Announcement", severity: "Critical", created_at: "2026-11-14" };
  assert.deepEqual([announcement, blotter, incident].sort(compareRecords).map(row => row.id), ["incident", "local", "announcement"]);
  assert.equal(recordFilters({}).sort, "status-priority-v1", "Discard retained pages from the old chronological ordering");
});
