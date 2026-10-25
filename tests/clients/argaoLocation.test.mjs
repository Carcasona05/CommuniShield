import assert from "node:assert/strict";
import { test } from "node:test";
import { ARGAO_BARANGAYS } from "../../clients/constants/argaoMapData.js";
import { getReportBarangay, getReportLocationHierarchy } from "../../clients/services/argaoLocation.js";
import { barangaysAtCoordinates, hasReportCoordinates, pointInRing } from "../../clients/services/argaoBoundary.js";
import boundaries from "../../clients/constants/argaoBarangayBoundaries.json" with { type: "json" };
import { readFileSync } from "node:fs";

test("Carlock addresses use their pin, not a whole-street assumption", () => {
  for (const location of ["Carlock Street, Argao, Cebu", "624 Carlock St., Argao", "CARLOCK STREET"]) {
    assert.equal(getReportBarangay({ location, latitude: 9.8784487, longitude: 123.5950192 }), "Lamacan");
    assert.equal(getReportBarangay({ location }), "");
  }
  // Older API responses incorrectly stored a street in the barangay field.
  assert.equal(getReportBarangay({ barangay: "Carlock street", location: "Carlock Street, Argao", latitude: 9.8784487, longitude: 123.5950192 }), "Lamacan");
});

test("recognized address barangays are used when coordinates are missing", () => {
  assert.equal(getReportBarangay({ barangay: "Canbanua", location: "Carlock Street, Argao" }), "Canbanua");
  assert.equal(getReportBarangay({ location: "Carlock Street, Brgy. Canbanua, Argao" }), "Canbanua");
});

test("every map barangay is recognized without substring guessing", () => {
  for (const { name } of ARGAO_BARANGAYS) {
    assert.equal(getReportBarangay({ location: `Unknown Road, ${name}, Argao` }), name);
  }
  assert.equal(getReportBarangay({ location: "Apo Street, Argao" }), "");
  assert.equal(getReportBarangay({ location: "Lamacan Road, Argao" }), "");
});

test("barangay is displayed above the street in the hierarchy", () => {
  assert.deepEqual(getReportLocationHierarchy({ location: "Carlock Street, Argao, Cebu", latitude: 9.8784487, longitude: 123.5950192 }), {
    barangay: "Lamacan", street: "Carlock Street", label: "Lamacan → Carlock Street",
  });
  assert.equal(getReportLocationHierarchy({ location: "Poblacion, Ortega Street, Argao" }).label, "Poblacion → Ortega Street");
});

test("Isidro Kintanar and all other street names follow the actual pin", () => {
  for (const location of ["Isidro Kintanar Street, Argao", "Other Street, Argao", "Unnamed Road, Argao"]) {
    const reports = [
      { id: "lamacan", location, latitude: 9.881969, longitude: 123.600326 },
      { id: "canbanua", location, latitude: 9.88525, longitude: 123.598033 },
      { id: "poblacion", location, latitude: 9.8802091, longitude: 123.605901 },
    ];
    for (const name of ["Lamacan", "Canbanua", "Poblacion"]) {
      assert.deepEqual(reports.filter((report) => getReportBarangay(report) === name).map(({ id }) => id), [name.toLowerCase()]);
    }
  }
});

test("coordinates correct stale address and cached barangay labels", () => {
  assert.equal(getReportBarangay({ barangay: "Canbanua", location: "Isidro Kintanar Street, Canbanua", latitude: 9.881969, longitude: 123.600326 }), "Lamacan");
  assert.equal(getReportBarangay({ barangay: "Lamacan", latitude: 0, longitude: 0 }), "");
});

test("missing and invalid coordinates do not become zero or nearest-hall assignments", () => {
  for (const latitude of [null, undefined, "", " ", "bad", Infinity, 91, false]) {
    assert.equal(hasReportCoordinates({ latitude, longitude: 123.6 }), false);
    assert.equal(getReportBarangay({ location: "Isidro Kintanar Street, Argao", latitude, longitude: 123.6 }), "");
  }
  assert.deepEqual(barangaysAtCoordinates(10.3, 123.9), []);
});

test("all 45 boundary names match the filters and each has selectable interior points", () => {
  assert.deepEqual(boundaries.features.map(({ name }) => name).sort(), ARGAO_BARANGAYS.map(({ name }) => name).sort());
  for (const feature of boundaries.features) {
    const [west, south, east, north] = feature.bounds;
    let found = false;
    for (let x = 1; x < 20 && !found; x++) {
      for (let y = 1; y < 20 && !found; y++) {
        const longitude = west + (east - west) * x / 20;
        const latitude = south + (north - south) * y / 20;
        if (barangaysAtCoordinates(latitude, longitude).join() === feature.name) {
          assert.equal(getReportBarangay({ location: "Unknown Street", latitude, longitude }), feature.name);
          found = true;
        }
      }
    }
    assert.ok(found, `No selectable interior for ${feature.name}`);
  }
});

test("shared boundaries require a matching explicit barangay", () => {
  let shared;
  for (const feature of boundaries.features) {
    for (const polygon of feature.polygons) {
      for (const [longitude, latitude] of polygon[0]) {
        const matches = barangaysAtCoordinates(latitude, longitude);
        if (matches.length > 1) { shared = { longitude, latitude, matches }; break; }
      }
      if (shared) break;
    }
    if (shared) break;
  }
  assert.ok(shared);
  assert.equal(getReportBarangay({ ...shared, location: "Unknown Street" }), "");
  assert.equal(getReportBarangay({ ...shared, barangay: shared.matches[0] }), shared.matches[0]);
});

test("ring hit testing distinguishes inside, outside, and boundaries", () => {
  const ring = [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]];
  assert.equal(pointInRing(1, 1, ring), 1);
  assert.equal(pointInRing(3, 1, ring), -1);
  assert.equal(pointInRing(0, 1, ring), 0);
});

test("client and independently deployed server bundle identical polygons", () => {
  const server = JSON.parse(readFileSync(new URL("../../server/src/data/argaoBarangayBoundaries.json", import.meta.url), "utf8"));
  assert.deepEqual(server, boundaries);
});

test("unknown locations remain unspecified instead of becoming barangays", () => {
  assert.equal(getReportBarangay({ location: "Unknown Street, Argao" }), "");
  assert.equal(getReportBarangay({ location: "9.88, 123.59" }), "");
  assert.equal(getReportBarangay(null), "");
  assert.equal(getReportLocationHierarchy(null).label, "Location not specified");
});
