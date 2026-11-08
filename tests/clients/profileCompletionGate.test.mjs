import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { profileDetailsMissing } from "../../clients/services/profileDetailsValidation.js";
const text = path => readFileSync(new URL(`../../clients/${path}`, import.meta.url), "utf8");
const full = { firstName: "Ana", lastName: "Cruz", username: "ana", contactNumber: "09123456789", birthdate: "2000-02-29", email: "ana@example.test", location: "Salinas Drive, Lahug, Cebu City, Cebu" };
test("checklist accepts a manual full address without GPS", () => {
  assert.deepEqual(profileDetailsMissing(full, value => value), []);
  assert.ok(profileDetailsMissing({ ...full, birthdate: "" }, value => value).includes("Birthdate"));
  assert.ok(profileDetailsMissing({ ...full, location: "" }, value => value).includes("Address"));
  assert.ok(profileDetailsMissing({ ...full, contactNumber: "123" }, value => value).length);
});
test("profile form has one manually editable address and no GPS shortcut", () => {
  const source = text("app/(tabs)/User_ProfileSettings.jsx");
  assert.match(source, /if \(!value\) return null/);
  assert.match(source, /testID="profile-details-container"/);
  assert.match(source, /testID="profile-complete-badge"/);
  assert.doesNotMatch(source, /You’re all set|Make your profile yours|profile-completion-checklist/);
  assert.match(source, /accessibilityRole="header" style=\{styles.sectionLabel\}>Personal Information/);
  assert.match(source, /accessibilityRole="header" style=\{styles.sectionLabel\}>Contact & Address/);
  assert.doesNotMatch(source, /fieldKey="barangay"/);
  assert.match(source, /accessibilityLabel="Address"/);
  assert.doesNotMatch(source, /Use current location|requestProfileDeviceLocation/);
  assert.match(source, /const \[editMode, setEditMode\] = useState\(false\)/);
  assert.doesNotMatch(source, /locationLock|showLocationConsent|handleAllowLocation/);
  assert.match(source, /location: tempDetails.location.trim\(\)/);
  assert.match(source, /Enter your home or permanent address/);
  assert.match(source, /profileDetailsMissing\(tempDetails, toDateString\)/);
  assert.doesNotMatch(source, /apiClient.put\("\/profile\/location"/);
});
test("every comment form preflights profile and preserves comment drafts on a blocked request", () => {
  for (const path of ["hooks/usePaginatedComments.js", "components/User_ViewPost.jsx"]) {
    const source = text(path);
    const start = source.indexOf(path.includes("hooks/") ? "const submit =" : "const handleAddComment =");
    const handler = source.slice(start, source.indexOf("\n  };", start));
    const preflight = handler.indexOf('ensureCompleteProfile("comment")');
    assert.ok(preflight >= 0 && preflight < handler.indexOf("apiClient.post("), path);
    const cleared = Math.max(handler.indexOf('setCommentText('), handler.indexOf('setNewComment('));
    assert.ok(cleared > handler.indexOf("apiClient.post("), path);
  }
  const report = text("app/(tabs)/User_PostReport.jsx");
  const handler = report.slice(report.indexOf("const handlePostReport ="));
  assert.ok(handler.indexOf("ensureCompleteProfile()") < handler.indexOf("uploadImages("));
});
