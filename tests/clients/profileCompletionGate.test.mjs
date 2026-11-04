import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { profileDetailsMissing } from "../../clients/services/profileDetailsValidation.js";
const text = path => readFileSync(new URL(`../../clients/${path}`, import.meta.url), "utf8");
const full = { firstName: "Ana", lastName: "Cruz", username: "ana", contactNumber: "09123456789", birthdate: "2000-02-29", email: "ana@example.test", location: "Argao", locationConfirmed: true };
test("checklist requires actual details, not default birthdate or typed address", () => {
  assert.deepEqual(profileDetailsMissing(full, value => value), []);
  assert.ok(profileDetailsMissing({ ...full, birthdate: "" }, value => value).includes("Birthdate"));
  assert.ok(profileDetailsMissing({ ...full, locationConfirmed: false }, value => value).includes("Address & location permission"));
  assert.ok(profileDetailsMissing({ ...full, contactNumber: "123" }, value => value).length);
});
test("location denial never calls device positioning; successful permission returns coordinates", async () => {
  let granted = false, positions = 0;
  const context = vm.createContext({
    Platform: { OS: "android" }, setTimeout, clearTimeout,
    Location: { Accuracy: { Balanced: 3 }, requestForegroundPermissionsAsync: async () => ({ status: granted ? "granted" : "denied" }),
      getCurrentPositionAsync: async () => { positions++; return { coords: { latitude: 9.88, longitude: 123.59 } }; } },
  });
  vm.runInContext(text("services/profileDeviceLocation.js").replace(/^import .*;\r?\n/gm, "").replace("export async function", "async function") + "\nglobalThis.run = requestProfileDeviceLocation;", context);
  await assert.rejects(context.run(), /permission was not granted/);
  assert.equal(positions, 0);
  granted = true;
  const result = await context.run();
  assert.equal(result.permissionGranted, true);
  assert.equal(result.latitude, 9.88);
});
test("HTTP LAN browser location is explicitly explained, not silently filled", async () => {
  const context = vm.createContext({ Platform: { OS: "web" }, window: { isSecureContext: false }, setTimeout, clearTimeout });
  vm.runInContext(text("services/profileDeviceLocation.js").replace(/^import .*;\r?\n/gm, "").replace("export async function", "async function") + "\nglobalThis.run = requestProfileDeviceLocation;", context);
  await assert.rejects(context.run(), /HTTPS/);
});
test("profile form has a compact checklist and tap-to-unlock manual address with no location button", () => {
  const source = text("app/(tabs)/User_ProfileSettings.jsx");
  assert.match(source, /if \(!value\) return null/);
  assert.match(source, /testID="profile-details-container"/);
  assert.match(source, /testID="profile-complete-badge"/);
  assert.doesNotMatch(source, /You’re all set|Make your profile yours|profile-completion-checklist/);
  assert.match(source, /accessibilityRole="header" style=\{styles.sectionLabel\}>Personal Information/);
  assert.match(source, /accessibilityRole="header" style=\{styles.sectionLabel\}>Contact & Address/);
  assert.match(source, /accessibilityLabel="Address"[\s\S]*?onPress=\{handleAddressPress\}/);
  assert.match(source, /!editMode \? <Text style=\{\[styles.value,[^\n]+\}>\{userDetails.location/);
  assert.match(source, /const \[editMode, setEditMode\] = useState\(false\)/);
  assert.match(source, /if \(!editMode \|\| locationLock.current \|\| saving \|\| deviceCoordinates\) return/);
  assert.match(source, /visible=\{showLocationConsent && editMode\}/);
  assert.match(source, /onPress=\{handleAllowLocation\}/);
  assert.match(source, /address: tempDetails.location.trim\(\)/);
  assert.doesNotMatch(source, /Use my current location/);
  assert.doesNotMatch(source, /location: tempDetails\.location,/);
  assert.match(source, /profileDetailsMissing\(\{ \.\.\.tempDetails, locationConfirmed: Boolean\(deviceCoordinates\)/);
});
test("every comment form preflights profile and preserves comment drafts on a blocked request", () => {
  for (const path of ["components/User_compo/User_RepPostView_Layout.jsx", "components/User_compo/MyUser_RepPostView_Layout.jsx", "components/User_ViewPost.jsx"]) {
    const source = text(path);
    const start = source.indexOf("const handleAddComment =");
    const handler = source.slice(start, source.indexOf("\n  };", start));
    const preflight = handler.indexOf('ensureCompleteProfile("comment")');
    assert.ok(preflight >= 0 && preflight < handler.indexOf("apiClient.post("), path);
    const cleared = Math.max(handler.indexOf('setCommentText("")'), handler.indexOf('setNewComment("")'));
    assert.ok(cleared > handler.indexOf("apiClient.post("), path);
  }
  const report = text("app/(tabs)/User_PostReport.jsx");
  const handler = report.slice(report.indexOf("const handlePostReport ="));
  assert.ok(handler.indexOf("ensureCompleteProfile()") < handler.indexOf("uploadImages("));
});
