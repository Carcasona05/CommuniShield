import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, Response } from "express";
import type { User } from "@supabase/supabase-js";
import { missingProfileFields, validProfileBirthdate, profileCompletionService } from "./services/profileCompletionService.js";
import { requireCompleteUserProfile, setProfileLocation } from "./controllers/profileCompletionController.js";
import { profileService } from "./services/authService.js";
import { supabaseAdmin } from "./config/supabaseAdmin.js";
import { readFileSync } from "node:fs";

const complete = { role: "user", first_name: "Ana", last_name: "Cruz", user_name: "ana", phone: "09123456789", birthdate: "2000-02-29", location: "Carlock Street, Lamacan, Argao, Cebu" };
const req = (body = {}) => ({ user: { id: "user", email: "ana@example.test" } as User, body }) as unknown as Request & { user: User };
function response() {
  const result = { status: 200, body: undefined as any };
  const res = { status(value: number) { result.status = value; return this; }, json(value: unknown) { result.body = value; return this; }, setHeader() {} } as unknown as Response;
  return { res, result };
}
test("required details include a manually entered full address, not GPS permission", () => {
  assert.deepEqual(missingProfileFields(complete, "ana@example.test"), []);
  for (const field of ["first_name", "last_name", "user_name", "phone", "birthdate", "location"]) {
    assert.ok(missingProfileFields({ ...complete, [field]: "" }, "ana@example.test").length > 0, field);
  }
  assert.ok(missingProfileFields({ ...complete, location: "" }, "ana@example.test").includes("Address"));
  assert.ok(missingProfileFields(complete, "").includes("Email"));
  assert.equal(validProfileBirthdate("2025-02-29"), false);
  assert.equal(validProfileBirthdate("2999-01-01"), false);
  assert.equal(validProfileBirthdate(null), false);
});
test("normal-user gate rejects incomplete profiles before writes", async t => {
  t.mock.method(profileService, "getProfile", async () => ({ data: complete, error: null }) as never);
  t.mock.method(profileCompletionService, "check", async () => ({ data: { complete: false, missing: ["Birthdate"], locationConfirmed: false }, error: null }));
  const { res, result } = response(); let called = false;
  await requireCompleteUserProfile(req(), res, () => { called = true; });
  assert.equal(called, false); assert.equal(result.status, 403);
  assert.equal(result.body.code, "PROFILE_INCOMPLETE");
});
test("complete profiles proceed and unavailable verification fails closed", async t => {
  t.mock.method(profileService, "getProfile", async () => ({ data: complete, error: null }) as never);
  const check = t.mock.method(profileCompletionService, "check", async () => ({ data: { complete: true, missing: [], locationConfirmed: true }, error: null }));
  let called = false;
  await requireCompleteUserProfile(req(), response().res, () => { called = true; });
  assert.equal(called, true);
  check.mock.restore();
  t.mock.method(profileCompletionService, "check", async () => ({ data: null, error: "offline" }) as never);
  const { res, result } = response();
  await requireCompleteUserProfile(req(), res, () => assert.fail("must not continue"));
  assert.equal(result.status, 503);
});
test("admin roles are exempt without needing location-table access", async t => {
  const database = t.mock.method(supabaseAdmin, "from", () => { throw new Error("Must not query location metadata for admins"); });
  for (const role of ["admin", "super_admin"]) {
    assert.equal((await profileCompletionService.check("admin", { role }, "")).data?.complete, true);
  }
  assert.equal(database.mock.callCount(), 0);
});
test("manual address rejects empty, oversized and malformed fields before writes", async t => {
  const save = t.mock.method(profileCompletionService, "saveAddress", async () => ({ error: null }));
  for (const body of [{}, { address: "" }, { address: " " }, { address: 1 }, { address: {} }, { address: "x".repeat(501) }]) {
    const { res, result } = response(); await setProfileLocation(req(body), res); assert.equal(result.status, 400);
  }
  assert.equal(save.mock.callCount(), 0);
});
test("manual address saves outside Argao without consent or device coordinates", async t => {
  t.mock.method(profileService, "getProfile", async () => ({ data: complete, error: null }) as never);
  const save = t.mock.method(profileCompletionService, "saveAddress", async () => ({ error: null }));
  const r = response();
  await setProfileLocation(req({ address: "  Salinas Drive, Lahug, Cebu City, Cebu  " }), r.res);
  assert.equal(r.result.status, 200);
  assert.equal(r.result.body.location, "Salinas Drive, Lahug, Cebu City, Cebu");
  assert.equal(r.result.body.locationConfirmed, false);
  assert.equal(save.mock.calls[0]?.arguments[1]?.location, "Salinas Drive, Lahug, Cebu City, Cebu");
});
test("all user content-write routes enforce the gate while reads and likes remain available", () => {
  const source = readFileSync(new URL("./routes/reportRoute.ts", import.meta.url), "utf8");
  assert.match(source, /post\("\/reports", authenticate, requireCompleteUserProfile, requireCredibilityWriteAccess\("report"\), createReport/);
  assert.match(source, /post\("\/reports\/:id\/comments", authenticate, requireCompleteUserProfile, requireCredibilityWriteAccess\("comment"\), addComment/);
  assert.match(source, /put\("\/reports\/:id", authenticate, requireCompleteUserProfile, requireCredibilityEditAccess, updateReport/);
  assert.match(source, /post\("\/reports\/:id\/like", authenticate, toggleLike/);
});
