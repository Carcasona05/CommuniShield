import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, Response } from "express";
import { profileBirthdateCutoff, validProfileBirthdate, missingProfileFields } from "./services/profileCompletionService.js";
import { updateProfile } from "./controllers/authController.js";
import { profileService } from "./services/authService.js";

test("server accepts exactly 16, rejects younger and malformed dates", () => {
  const now = new Date("2026-11-09T04:00:00Z");
  assert.equal(profileBirthdateCutoff(now), "2010-11-09");
  assert.equal(validProfileBirthdate("2010-11-09", now), true);
  for (const value of ["2010-11-10", "2020-01-01", "2999-01-01", "2010-02-29", "1899-12-31", "", null]) assert.equal(validProfileBirthdate(value, now), false);
});

test("server uses Philippine midnight and calendar-based leap-day age checks", () => {
  assert.equal(profileBirthdateCutoff(new Date("2026-11-08T15:59:59Z")), "2010-11-08");
  assert.equal(profileBirthdateCutoff(new Date("2026-11-08T16:00:00Z")), "2010-11-09");
  assert.equal(validProfileBirthdate("2008-02-29", new Date("2024-02-28T04:00:00Z")), false);
  assert.equal(validProfileBirthdate("2008-02-29", new Date("2024-02-29T04:00:00Z")), true);
});

test("existing underage user profiles are incomplete rather than silently eligible", () => {
  const profile = { role: "user", first_name: "Ana", last_name: "Cruz", user_name: "ana", phone: "09123456789", birthdate: new Date().toISOString().slice(0, 10), location: "Argao", address_barangay: "Lamacan", address_line: "Carlock Street, Argao, Cebu" };
  assert.deepEqual(missingProfileFields(profile, "ana@example.test"), ["Birthdate"]);
});

test("profile API rejects an underage birthdate before writing profile changes", async t => {
  t.mock.method(profileService, "ensureProfile", async () => ({ error: null }) as never);
  t.mock.method(profileService, "getProfile", async () => ({ data: { role: "user" }, error: null }) as never);
  const write = t.mock.method(profileService, "updateProfileFields", async () => { throw new Error("Must not write"); });
  let status = 200, body: { error?: string } = {};
  const res = { status(value: number) { status = value; return this; }, json(value: typeof body) { body = value; return this; } } as unknown as Response;
  await updateProfile({ user: { id: "user" }, token: "token", body: { birthdate: new Date().toISOString().slice(0, 10) } } as unknown as Request, res);
  assert.equal(status, 400); assert.match(body.error || "", /at least 16 years old/); assert.equal(write.mock.callCount(), 0);
});
