import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBlotterUpdates } from "./utils/blotterFields.js";

const certification = {
  location: "[Place of Occurrence]",
  incidentType: "[Nature of Case]",
  incidentDescription: "[First paragraph]\n\n[Second paragraph]",
  actionTaken: "[Disposition]",
  blotterOfficer: "[Attending Officer]",
};

test("a certification can be created without unrelated legacy complaint fields", () => {
  const result = buildBlotterUpdates(certification, true);
  assert.equal(result.error, undefined);
  assert.ok(!("blotter_no" in result.updates!), "the database assigns the entry number");
  assert.ok(!("page_number" in result.updates!), "the database assigns the log-book page");
  assert.equal(result.updates?.incident_description, certification.incidentDescription);
  for (const column of ["complainant_name", "complainant_age", "complainant_contact", "respondent", "reported_by", "date_reported", "date_recorded"]) {
    assert.ok(!(column in result.updates!));
  }
});

test("certification metadata persists and blank optional details become null", () => {
  const result = buildBlotterUpdates({
    ...certification,
    requestedBy: "[Concerned Person]",
    certificationPurpose: "[Purpose]",
    issuanceDate: "2024-02-29",
    issuanceCity: "[City]",
    issuanceProvince: "[Province]",
    commanderName: "[Commander]",
    commanderRank: "Police [Rank]",
    commanderPosition: "[Position]",
    incidentDateTime: "",
  }, true);
  assert.equal(result.error, undefined);
  assert.equal(result.updates?.requested_by, "[Concerned Person]");
  assert.equal(result.updates?.issuance_date, "2024-02-29");
  assert.equal(result.updates?.commander_name, "[Commander]");
  assert.equal(result.updates?.incident_datetime, null);
});

test("metadata edits do not overwrite historical incident or people information", () => {
  const result = buildBlotterUpdates({ certificationPurpose: " [Revised Purpose] ", commanderName: "" });
  assert.deepEqual(result.updates, { certification_purpose: "[Revised Purpose]", commander_name: null });
  assert.equal(result.error, undefined);
});

test("clients cannot override station details or automatically assigned numbers", () => {
  const result = buildBlotterUpdates({
    ...certification,
    blotterNo: "[Client Number]",
    pageNumber: "999",
    policeStation: "[Other Station]",
    policeProvincialOffice: "[Other Office]",
    stationAddress: "[Other Address]",
    pnpLogoUri: "https://example.test/logo.png",
  }, true);
  assert.equal(result.error, undefined);
  for (const column of ["blotter_no", "page_number", "police_station", "police_provincial_office", "station_address", "pnp_logo_uri"]) {
    assert.ok(!(column in result.updates!));
  }
  assert.ok(buildBlotterUpdates({ blotterNo: "[Replacement]", pageNumber: "999" }).error);
});

test("required incident details and malformed dates are rejected", () => {
  assert.ok(buildBlotterUpdates({ ...certification, location: " " }, true).error?.includes("location"));
  assert.ok(buildBlotterUpdates({ issuanceDate: "2025-02-29" }).error);
  assert.ok(buildBlotterUpdates({ incidentDateTime: "2026-02-30T10:00" }).error);
  assert.ok(buildBlotterUpdates({ incidentDateTime: "2026-10-26T25:00" }).error);
  assert.equal(buildBlotterUpdates({ incidentDateTime: "2026-10-26T10:00:00.000Z" }).error, undefined);
});
