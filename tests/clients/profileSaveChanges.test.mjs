import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { hasProfileDetailsChanges } from "../../clients/services/profileDetailsValidation.js";

const saved = { firstName: "Ana", middleName: "", lastName: "Cruz", username: "ana", contactNumber: "09123456789", location: "Carlock Street, Lamacan, Argao, Cebu", birthdate: new Date(2000, 1, 29), email: "ana@example.test" };
const dateString = value => value ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}` : "";

test("unchanged values and a newly selected identical birthdate do not enable Save", () => {
  assert.equal(hasProfileDetailsChanges(saved, { ...saved }, dateString), false);
  assert.equal(hasProfileDetailsChanges(saved, { ...saved, birthdate: new Date(2000, 1, 29, 12) }, dateString), false);
  assert.equal(hasProfileDetailsChanges(saved, { ...saved, middleName: null, firstName: " Ana " }, dateString), false);
  assert.equal(hasProfileDetailsChanges({ ...saved, birthdate: null }, { ...saved, birthdate: undefined }, dateString), false);
});

test("editing a persisted field enables Save, and reverting it disables Save again", () => {
  for (const field of ["firstName", "middleName", "lastName", "username", "contactNumber", "location"]) {
    const draft = { ...saved, [field]: `${saved[field]} changed` };
    assert.equal(hasProfileDetailsChanges(saved, draft, dateString), true, field);
    draft[field] = saved[field];
    assert.equal(hasProfileDetailsChanges(saved, draft, dateString), false, field);
  }
  assert.equal(hasProfileDetailsChanges(saved, { ...saved, birthdate: new Date(2000, 2, 1) }, dateString), true);
});

test("GPS metadata cannot activate Save when the address fields remain unchanged", () => {
  assert.equal(hasProfileDetailsChanges(saved, { ...saved, locationConfirmed: true }, dateString), false);
  assert.equal(hasProfileDetailsChanges(saved, { ...saved, latitude: 9.88, longitude: 123.6 }, dateString), false);
});

test("read-only email changes cannot activate the profile Save button", () => {
  assert.equal(hasProfileDetailsChanges(saved, { ...saved, email: "other@example.test" }, dateString), false);
});

test("profile button styling, disabled state and submission guard use actual value changes", () => {
  const source = readFileSync(new URL("../../clients/app/(tabs)/User_ProfileSettings.jsx", import.meta.url), "utf8");
  assert.match(source, /hasProfileDetailsChanges\(userDetails, tempDetails, toDateString\)/);
  assert.match(source, /if \(saving \|\| !editMode \|\| !hasChanges\(\)\) return/);
  assert.match(source, /disabled=\{saveDisabled\}/);
  assert.match(source, /saveDisabled && styles.saveButtonDisabled/);
});
