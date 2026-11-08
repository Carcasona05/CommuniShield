import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";
import { profileDetailsMissing, hasProfileDetailsChanges } from "../../clients/services/profileDetailsValidation.js";

const source = readFileSync(new URL("../../clients/app/(tabs)/User_ProfileSettings.jsx", import.meta.url), "utf8");
const full = { firstName: "Ana", lastName: "Cruz", username: "ana", birthdate: "2000-01-01", contactNumber: "09123456789", email: "ana@example.test", location: "Salinas Drive, Lahug, Cebu City, Cebu" };

test("manual non-Argao addresses complete a profile without any GPS fields", () => {
  assert.deepEqual(profileDetailsMissing(full, value => value), []);
  for (const location of ["", "   ", null, "x".repeat(501)]) {
    assert.deepEqual(profileDetailsMissing({ ...full, location }, value => value), ["Address"]);
  }
});

test("address changes enable Save, unchanged text does not", () => {
  assert.equal(hasProfileDetailsChanges(full, { ...full }, value => value), false);
  assert.equal(hasProfileDetailsChanges(full, { ...full, location: ` ${full.location} ` }, value => value), false);
  assert.equal(hasProfileDetailsChanges(full, { ...full, location: "Guadalupe, Cebu City, Cebu" }, value => value), true);
});

test("profile keeps one manually editable address and no location shortcut or lookup", () => {
  assert.match(source, /location: profile.location \?\? ""/);
  assert.match(source, /accessibilityLabel="Address" multiline maxLength=\{500\}/);
  assert.match(source, /Enter your home or permanent address/);
  assert.match(source, /House number is optional/);
  assert.doesNotMatch(source, /fieldKey="barangay"|address_barangay|address_line|requestProfileDeviceLocation|Use current location|handleAllowLocation|showLocationConsent|address-suggestion/);
  assert.equal(existsSync(new URL("../../clients/services/profileDeviceLocation.js", import.meta.url)), false);
  assert.match(source, /if \(!editModeRef.current\) setTempDetails/);
});

test("obsolete profile lookup route is removed but unrelated GPS features remain", () => {
  const routes = readFileSync(new URL("../../server/src/routes/authRoute.ts", import.meta.url), "utf8");
  assert.doesNotMatch(routes, /address-suggestion|suggestProfileAddress/);
  const map = readFileSync(new URL("../../clients/app/(tabs)/User_Map.jsx", import.meta.url), "utf8");
  const report = readFileSync(new URL("../../clients/app/(tabs)/User_PostReport.jsx", import.meta.url), "utf8");
  assert.match(map, /getCurrentPositionAsync/);
  assert.match(report, /Location\./);
});
