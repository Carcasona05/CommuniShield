import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, Response } from "express";
import type { User } from "@supabase/supabase-js";
import { getProfile, register } from "./controllers/authController.js";
import { profileService } from "./services/authService.js";
import { profileCompletionService } from "./services/profileCompletionService.js";
import { credibilityService } from "./services/credibilityService.js";
import { supabaseAdmin } from "./config/supabaseAdmin.js";

function response() {
  const output = { status: 200, body: null as any };
  const res = { status(value: number) { output.status = value; return this; }, json(body: unknown) { output.body = body; return this; } } as unknown as Response;
  return { output, res };
}

test("registration initializes the profile from auth metadata", async t => {
  t.mock.method(supabaseAdmin.auth.admin, "createUser", async () => ({ data: { user: { id: "new-user" } }, error: null }) as never);
  const ensure = t.mock.method(profileService, "ensureProfile", async () => {});
  t.mock.method(profileService, "recordTermsAcceptance", async () => ({ error: null }));
  const { output, res } = response();
  await register({ body: { userName: "new-member", email: "member@example.com", password: "Strong!Pass123", termsVersion: "1.0" } } as Request, res);
  assert.equal(output.status, 200);
  assert.equal(ensure.mock.calls[0]?.arguments[0], "new-user");
});

test("existing blank usernames are repaired, without overwriting an edited username", async t => {
  let row = { user_name: "" };
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: row, error: null }) };
  t.mock.method(supabaseAdmin, "from", () => query as never);
  const ensure = t.mock.method(profileService, "ensureProfile", async () => { row = { user_name: "registered-name" }; });
  assert.equal((await profileService.getProfile("new-user")).data?.user_name, "registered-name");
  assert.equal(ensure.mock.callCount(), 1);
  row = { user_name: "edited-name" };
  assert.equal((await profileService.getProfile("new-user")).data?.user_name, "edited-name");
  assert.equal(ensure.mock.callCount(), 1);
});

test("profile details include the authenticated email and registration username for a blank row", async t => {
  t.mock.method(profileService, "getProfile", async () => ({ data: { role: "user", user_name: "" }, error: null }) as never);
  t.mock.method(profileCompletionService, "check", async () => ({ data: { complete: false, missing: ["First name"], locationConfirmed: false }, error: null }));
  t.mock.method(credibilityService, "getUserCredibility", async () => ({ data: null, error: null }) as never);
  const { output, res } = response();
  const req = { token: "verified-token", user: { id: "new-user", email: "member@example.com", user_metadata: { userName: "registered-name" } } as unknown as User };
  await getProfile(req as Request & typeof req, res);
  assert.equal(output.body.user_name, "registered-name");
  assert.equal(output.body.email, "member@example.com");
});

test("database errors are not returned as successful empty profiles", async t => {
  t.mock.method(profileService, "getProfile", async () => ({ data: null, error: { message: "offline" } }) as never);
  const { output, res } = response();
  await getProfile({ token: "token", user: { id: "new-user" } as User } as Request & { token: string; user: User }, res);
  assert.equal(output.status, 503);
  assert.match(output.body.error, /Could not load your profile/);
});
