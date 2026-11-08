import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { profileBirthdateCutoff, validProfileBirthdate, profileDetailsMissing } from "../../clients/services/profileDetailsValidation.js";

test("profile birthdate allows the sixteenth birthday but rejects anyone younger", () => {
  const now = new Date("2026-11-09T04:00:00Z");
  assert.equal(profileBirthdateCutoff(now), "2010-11-09");
  assert.equal(validProfileBirthdate("2010-11-09", now), true);
  assert.equal(validProfileBirthdate("2010-11-10", now), false);
  assert.equal(validProfileBirthdate("2000-02-29", now), true);
  for (const date of ["2026-11-09", "2999-01-01", "2010-02-29", "2010-11-31", "1899-12-31", "", null]) assert.equal(validProfileBirthdate(date, now), false);
});

test("minimum age follows the Philippine calendar day even before midnight UTC", () => {
  assert.equal(profileBirthdateCutoff(new Date("2026-11-08T15:59:59Z")), "2010-11-08");
  assert.equal(profileBirthdateCutoff(new Date("2026-11-08T16:00:00Z")), "2010-11-09");
  assert.equal(validProfileBirthdate("2010-11-09", new Date("2026-11-08T16:00:00Z")), true);
});

test("leap-day birthdays are handled as calendar dates, not 365-day approximations", () => {
  assert.equal(validProfileBirthdate("2008-02-29", new Date("2024-02-28T04:00:00Z")), false);
  assert.equal(validProfileBirthdate("2008-02-29", new Date("2024-02-29T04:00:00Z")), true);
  assert.equal(validProfileBirthdate("2008-03-01", new Date("2024-02-29T04:00:00Z")), false);
  assert.equal(profileBirthdateCutoff(new Date("2104-02-29T04:00:00Z")), "2088-02-29");
});

test("underage birthdate is flagged in the profile completion checklist", () => {
  const details = { firstName: "Ana", lastName: "Cruz", username: "ana", contactNumber: "09123456789", birthdate: "2010-11-10", email: "ana@example.test", location: "Carlock Street, Lamacan, Argao, Cebu" };
  const now = new Date("2026-11-09T04:00:00Z");
  assert.deepEqual(profileDetailsMissing(details, value => value, now), ["Birthdate"]);
  assert.deepEqual(profileDetailsMissing({ ...details, birthdate: "2010-11-09" }, value => value, now), []);
});

test("both web and native birthdate pickers apply the age cutoff and explain the restriction", () => {
  const source = readFileSync(new URL("../../clients/app/(tabs)/User_ProfileSettings.jsx", import.meta.url), "utf8");
  assert.match(source, /max=\{latestBirthdate\}/);
  assert.match(source, /maximumDate=\{latestBirthdateDate\}/);
  assert.match(source, /You must be at least 16 years old\./);
  assert.match(source, /if \(tempDetails.birthdate && !validProfileBirthdate\(toDateString\(tempDetails.birthdate\)\)\)/);
});
