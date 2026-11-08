import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { ARGAO_BARANGAYS, ARGAO_HELP_FACILITIES } from "../../clients/constants/argaoMapData.js";
import { barangaysAtCoordinates } from "../../clients/services/argaoBoundary.js";
import { mergeMapFacilities, facilityDirectionsUrl, facilityPhoneUrl, mapDistanceKm } from "../../clients/services/mapFacilities.js";

const stations = ARGAO_HELP_FACILITIES.filter(facility => ["police", "fire"].includes(facility.type));

test("map recenter button clears the floating navigation bar and device safe area", () => {
  const source = readFileSync(new URL("../../clients/app/(tabs)/User_Map.jsx", import.meta.url), "utf8");
  assert.match(source, /const insets = useSafeAreaInsets\(\)/);
  assert.match(source, /const recenterBottom = navigationHeight \+ navigationBottom \+ 12/);
  assert.match(source, /style=\{\[styles\.recenterButton, \{ bottom: recenterBottom \}\]\}/);
});

test("all 45 barangay area pins belong to their named boundary, not invented halls", () => {
  assert.equal(ARGAO_BARANGAYS.length, 45);
  assert.equal(new Set(ARGAO_BARANGAYS.map(row => row.name)).size, 45);
  for (const row of ARGAO_BARANGAYS) {
    assert.ok(barangaysAtCoordinates(row.lat, row.lng).includes(row.name), row.name);
    assert.equal(row.locationKind, "barangay-area");
    assert.match(row.locationNote, /not a verified barangay hall/);
    assert.ok(new URL(row.mapsUrl).searchParams.get("query").includes(row.name));
    assert.equal(facilityDirectionsUrl(row), row.mapsUrl);
    assert.equal(facilityPhoneUrl(row), null, "do not invent a direct barangay phone number");
  }
});

test("station contact details are supplied values, and fire pin is inside the Plus Code cell", () => {
  const police = stations.find(row => row.type === "police"), fire = stations.find(row => row.type === "fire");
  assert.equal(police.phone, "09425533464");
  assert.equal(police.address, "Baluarte Beach Resort, General Ortega St, Argao, 6021 Cebu");
  assert.equal(facilityPhoneUrl(police), "tel:09425533464");
  assert.equal(facilityPhoneUrl(fire), "tel:0328872837");
  assert.equal(fire.plusCode, "6QX5VJJ2+Q4");
  assert.ok(fire.lat >= 9.881875 && fire.lat < 9.882);
  assert.ok(fire.lng >= 123.60025 && fire.lng < 123.600375);
  for (const station of stations) {
    assert.match(station.sourceUrl, /^https:\/\/www\.openstreetmap\.org\/way\//);
    assert.match(station.mapsUrl, /^https:\/\/www\.google\.com\/maps\/search/);
    assert.ok(facilityDirectionsUrl(station).includes(encodeURIComponent(`${station.lat},${station.lng}`)));
  }
});

test("client and server ship identical station coordinates and contacts", () => {
  const server = JSON.parse(readFileSync(new URL("../../server/src/data/argaoEmergencyFacilities.json", import.meta.url), "utf8"));
  for (const station of stations) {
    const remote = server.find(row => row.id === station.id);
    assert.equal(remote.name, station.name); assert.equal(remote.latitude, station.lat); assert.equal(remote.longitude, station.lng);
    assert.equal(remote.address, station.address); assert.equal(remote.phone, station.phone);
  }
});

test("old database/cached seed pins cannot override sourced stations or duplicate them", () => {
  const remote = [
    { id: "old-police", name: "Argao Municipal Police Station", type: "police", lat: 9.8721, lng: 123.5986, phone: "911" },
    { id: "old-fire", name: "Argao Fire Station", type: "fire", lat: 9.8738, lng: 123.5998, phone: "911" },
    { id: "sample", name: "Sample police station", type: "police", lat: 9.88, lng: 123.6 },
    { id: "invalid", name: "Invalid coordinates", type: "police", lat: null, lng: 123.6 },
    { id: "real-other", name: "Other Police Station", type: "police", lat: 9.89, lng: 123.6 },
  ];
  const merged = mergeMapFacilities(remote, stations, ARGAO_BARANGAYS, [9.88, 123.6]);
  assert.equal(merged.length, 48);
  assert.equal(merged.some(row => row.id === "old-police" || row.id === "old-fire" || row.id === "sample" || row.id === "invalid"), false);
  assert.equal(merged.find(row => row.id === "fac-argaopolicestation").phone, "09425533464");
  assert.ok(merged.some(row => row.id === "real-other"));
});

test("distinct nearby clinics survive deduplication and distances require actual device coordinates", () => {
  const clinics = [
    { id: "clinic-a", name: "Clinic A", type: "clinic", lat: 9.88, lng: 123.6 },
    { id: "clinic-b", name: "Clinic B", type: "clinic", lat: 9.8801, lng: 123.6001 },
  ];
  assert.equal(mergeMapFacilities(clinics.slice(0, 1), clinics.slice(1), [], null).length, 2);
  assert.ok(mergeMapFacilities(clinics, [], [], null).every(row => row.distanceKm === undefined));
  const actual = [14.5995, 120.9842];
  const merged = mergeMapFacilities([], stations, [], actual);
  assert.ok(merged.every(row => row.distanceKm > 500), "never calculate user distances from a Cebu-clamped placeholder");
  assert.equal(mapDistanceKm(9.88, 123.6, 9.88, 123.6), 0);
});

test("map does not show the default Argao viewport as the user's current location", () => {
  const source = readFileSync(new URL("../../clients/components/MapView.jsx", import.meta.url), "utf8");
  const html = source.match(/const MAP_HTML = `([\s\S]*?)`;/)[1];
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
  const markers = [], messages = [];
  const map = { attributionControl: { setPrefix() {} }, on() {}, setView() {} };
  const layer = { addTo() { return layer; }, on() {}, isLoading: () => false, clearLayers() {} };
  const window = { addEventListener() {}, ReactNativeWebView: { postMessage: message => messages.push(JSON.parse(message)) } };
  const context = vm.createContext({ window, navigator: {}, document: {}, L: {
    map: () => map, tileLayer: () => layer, layerGroup: () => layer,
    marker(position) { const marker = { position, addTo() { return marker; }, bindPopup() {}, setLatLng(value) { marker.position = value; } }; markers.push(marker); return marker; },
  } });
  vm.runInContext(script, context);
  assert.equal(markers.length, 0);
  window.__communishieldInit({ markers: [] }); assert.equal(markers.length, 0);
  window.__communishieldInit({ markers: [], lat: 14.5995, lng: 120.9842 });
  assert.equal(markers.length, 1); assert.equal(markers[0].position[0], 14.5995); assert.equal(markers[0].position[1], 120.9842);
  assert.equal(messages.at(-1).lat, 14.5995); assert.equal(messages.at(-1).lng, 120.9842);
});
