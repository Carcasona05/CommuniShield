import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../api/index.js";
import { supabase } from "./config/supabase.js";
import { profileService } from "./services/authService.js";
import { loginVerificationService } from "./services/loginVerificationService.js";

test("GET /api/session is registered, authenticated, uncached and respects account state", async t => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/session`;
  let disabled = false, missing = false, approved = true;
  t.mock.method(supabase.auth, "getUser", async () => ({ data: { user: { id: "verified-user" } }, error: null }) as never);
  t.mock.method(loginVerificationService, "sessionApproved", async () => approved);
  const lookup = t.mock.method(profileService, "getProfile", async () => ({
    data: missing ? null : { id: "verified-user", role: "super_admin", status: disabled ? "Disabled" : "Active" }, error: null,
  }) as never);
  assert.equal((await fetch(url)).status, 401, "missing auth must not be 404");
  const get = () => fetch(url, { headers: { Authorization: "Bearer test-token" } });
  const response = await get();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { userId: "verified-user", role: "super_admin" });
  assert.equal(lookup.mock.callCount(), 1, "reuse middleware profile check");
  disabled = true;
  const denied = await get();
  assert.equal(denied.status, 403);
  assert.match((await denied.json()).error, /disabled/i);
  disabled = false; missing = true;
  assert.equal((await get()).status, 503, "missing profile must not produce a valid session");
  approved = false;
  const verification = await get();
  assert.equal(verification.status, 401);
  assert.equal((await verification.json()).code, "DEVICE_VERIFICATION_REQUIRED");
});
