import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, Response } from "express";
import { parseProfileAddress } from "./services/profileAddressService.js";
import { profileCompletionService } from "./services/profileCompletionService.js";
import { updateProfile, getProfile } from "./controllers/authController.js";
import { profileService } from "./services/authService.js";
import { supabaseAdmin } from "./config/supabaseAdmin.js";
import { credibilityService } from "./services/credibilityService.js";

function response() {
  const output = { status: 200, body: null as any };
  const res = { status(value: number) { output.status = value; return this; }, json(body: unknown) { output.body = body; return this; }, setHeader() {} } as unknown as Response;
  return { output, res };
}
const request = (body: unknown) => ({ user: { id: "user", email: "ana@example.test" }, token: "token", body }) as unknown as Request;

test("address parser accepts a full non-Argao address and rejects invalid shapes/lengths", () => {
  assert.deepEqual(parseProfileAddress(" Salinas Drive, Lahug, Cebu City, Cebu ").data, {
    location: "Salinas Drive, Lahug, Cebu City, Cebu",
  });
  for (const value of [null, "", {}, 123, " ", "x".repeat(501)]) {
    assert.ok(parseProfileAddress(value).error);
  }
});

test("completed manual address does not query GPS verification or require permission", async t => {
  const database = t.mock.method(supabaseAdmin, "from", () => { throw new Error("Must not read GPS verification"); });
  const profile = { role: "user", first_name: "Ana", last_name: "Cruz", user_name: "ana", birthdate: "2000-01-01", phone: "09123456789", location: "Lahug, Cebu City, Cebu" };
  const result = await profileCompletionService.check("user", profile, "ana@example.test");
  assert.equal(result.data?.complete, true); assert.equal(result.data?.locationConfirmed, false);
  assert.equal(result.data?.addressSource, "user-provided"); assert.equal(database.mock.callCount(), 0);
});

test("profile update saves the full address atomically with other personal details and never saves GPS", async t => {
  t.mock.method(profileService, "ensureProfile", async () => {});
  t.mock.method(profileService, "getProfile", async () => ({ data: { role: "user" }, error: null }) as never);
  const update = t.mock.method(profileService, "updateProfileFields", async () => ({ data: {}, error: null }) as never);
  const { output, res } = response();
  await updateProfile(request({ first_name: "Ana", location: " Lahug, Cebu City, Cebu ", latitude: 10.3, longitude: 123.9 }), res);
  assert.equal(output.status, 200); assert.equal(update.mock.callCount(), 1);
  assert.deepEqual(update.mock.calls[0]?.arguments[1], { first_name: "Ana", location: "Lahug, Cebu City, Cebu" });
});

test("blank, oversized or malformed address does not save any profile fields", async t => {
  t.mock.method(profileService, "ensureProfile", async () => {});
  t.mock.method(profileService, "getProfile", async () => ({ data: { role: "user" }, error: null }) as never);
  const update = t.mock.method(profileService, "updateProfileFields", async () => { throw new Error("Should not write"); });
  for (const body of [{ first_name: "Ana", location: "" }, { location: " " }, { location: null }, { location: {} }, { location: "x".repeat(501) }]) {
    const { output, res } = response(); await updateProfile(request(body), res); assert.equal(output.status, 400);
  }
  assert.equal(update.mock.callCount(), 0);
});

test("legacy one-line addresses remain visible but do not invent a barangay", async t => {
  t.mock.method(profileService, "getProfile", async () => ({ data: { role: "user", user_name: "ana", location: "Old street, Other city" }, error: null }) as never);
  t.mock.method(credibilityService, "getUserCredibility", async () => ({ data: null, error: null }) as never);
  const { output, res } = response(); await getProfile(request({}), res);
  assert.equal(output.body.location, "Old street, Other city");
  assert.equal(output.body.address_source, "user-provided"); assert.equal(output.body.location_confirmed, false);
  assert.equal(output.body.profile_completion.missing.includes("Address"), false);
});
