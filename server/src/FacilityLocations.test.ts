import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import { facilityService } from "./services/facilityService.js";
import { supabaseAdmin } from "./config/supabaseAdmin.js";

test("nearby endpoint replaces old station seeds and hides explicit sample records", async t => {
  const data = [
    { id: "old-police", name: "Argao Municipal Police Station", type: "police", latitude: 9.8721, longitude: 123.5986, phone: "911" },
    { id: "old-fire", name: "Argao Fire Station", type: "fire", latitude: 9.8738, longitude: 123.5998, phone: "911" },
    { id: "sample", name: "Sample Police Station", type: "police", latitude: 9.88, longitude: 123.6 },
    { id: "other", name: "Other Police Station", type: "police", latitude: 9.89, longitude: 123.6 },
  ];
  t.mock.method(supabaseAdmin, "from", (() => {
    const query = { select() { return query; }, order: async () => ({ data, error: null }) }; return query;
  }) as never);
  const result = await facilityService.getNearby(9.8816, 123.5953, 8100);
  assert.equal(result.data.length, 3);
  const police = result.data.find(row => row.id === "fac-argaopolicestation")!;
  assert.equal(police.phone, "09425533464"); assert.equal(police.lat, 9.8807935); assert.equal(police.lng, 123.6087917);
  const fire = result.data.find(row => row.type === "fire")!;
  assert.equal(fire.phone, "(032)8872837"); assert.match(fire.name, /Old Railway/);
  assert.ok(result.data.some(row => row.id === "other"));
});

test("empty facility table still returns the two sourced stations", async t => {
  t.mock.method(supabaseAdmin, "from", (() => {
    const query = { select() { return query; }, order: async () => ({ data: [], error: null }) }; return query;
  }) as never);
  const result = await facilityService.getNearby(9.8816, 123.5953, 8200);
  assert.equal(result.data.length, 2);
  assert.ok(result.data.every(row => Number.isFinite(row.distanceKm)));
});
