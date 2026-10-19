import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, Response } from "express";
import {
  decryptLoginSession, encryptLoginSession, loginHash, loginVerificationDependencies as deps,
  loginVerificationService as service, maskLoginEmail,
} from "./services/loginVerificationService.js";
import { login, adminLogin, verifyLoginCode, register } from "./controllers/authController.js";
import { authenticate } from "./middlewares/authMiddleware.js";
import { supabase } from "./config/supabase.js";
import { supabaseAdmin } from "./config/supabaseAdmin.js";
import { profileService } from "./services/authService.js";
import { notificationService } from "./services/notificationService.js";

process.env.LOGIN_VERIFICATION_SECRET = "test-only-login-verification-secret-not-for-production";

// In-memory adapter tests behavior without sending emails or using live Redis.
class MemoryRedis {
  values = new Map<string, { value: unknown; until: number }>();
  now = Date.now();
  async get(key: string): Promise<unknown> {
    const entry = this.values.get(key);
    if (!entry || entry.until <= this.now) { this.values.delete(key); return null; }
    return entry.value;
  }
  async set(key: string, value: unknown, options?: { ex?: number }) {
    this.values.set(key, { value, until: options?.ex ? this.now + options.ex * 1000 : Infinity });
    return "OK";
  }
  async del(key: string) { return Number(this.values.delete(key)); }
  async eval(script: string, keys: string[], args: string[]) {
    const first = keys[0]!;
    if (script.includes("entry.codeHash")) {
      const raw = await this.get(first);
      if (!raw) return 0;
      const entry = JSON.parse(raw as string);
      if (entry.codeHash !== args[0]) {
        entry.attempts++;
        if (entry.attempts >= 5) { await this.del(first); return -2; }
        const previous = this.values.get(first)!;
        this.values.set(first, { ...previous, value: JSON.stringify(entry) });
        return -1;
      }
      await this.del(first);
      return raw;
    }
    if (await this.get(first)) return 0;
    const count = Number(await this.get(keys[1]!) || 0);
    if (count >= 5) return -1;
    await this.set(first, "1", { ex: 60 });
    const previous = this.values.get(keys[1]!);
    await this.set(keys[1]!, count + 1, { ex: previous ? (previous.until - this.now) / 1000 : 3600 });
    return 1;
  }
}

const token = () => `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.signature`;
const input = () => ({ userId: "user-1", email: "person@example.com", password: "Strong!Pass123", token: token(), admin: false });
const response = () => {
  const result = { status: 200, body: {} as Record<string, unknown> };
  const res = { status(code: number) { result.status = code; return res; }, json(body: Record<string, unknown>) { result.body = body; return res; } } as Response;
  return { res, result };
};

test("login sessions use authenticated encryption and mask email addresses", () => {
  const encrypted = encryptLoginSession("private-session");
  assert.equal(decryptLoginSession(encrypted), "private-session");
  assert.ok(!encrypted.includes("private-session"));
  const damaged = Buffer.from(encrypted, "base64url");
  damaged[15] = damaged[15]! ^ 1;
  assert.throws(() => decryptLoginSession(damaged.toString("base64url")));
  assert.equal(maskLoginEmail("person@example.com"), "p***@example.com");
});

test("device verification storage lifecycle", async (t) => {
  const redis = new MemoryRedis();
  t.mock.method(deps, "getRedis", () => redis as unknown as ReturnType<typeof deps.getRedis>);
  let sentCode = "";
  t.mock.method(deps, "sendEmail", async (email: string, code: string) => {
    assert.equal(email, "person@example.com"); sentCode = code;
  });

  const request = input();
  const challenge = await service.create(request);
  assert.equal(challenge.verification_required, true);
  assert.match(sentCode, /^\d{6}$/);
  assert.equal("access_token" in challenge, false);
  const persisted = JSON.stringify([...redis.values]);
  assert.ok(!persisted.includes(request.password));
  assert.ok(!persisted.includes(request.token));
  assert.ok(!persisted.includes(`"${sentCode}"`));
  await assert.rejects(service.create(request), /Wait 60 seconds/);

  const wrongCode = sentCode === "000000" ? "111111" : "000000";
  await assert.rejects(service.consume(challenge.challenge_id, wrongCode), /Incorrect/);
  const verified = await service.consume(challenge.challenge_id, sentCode);
  assert.equal(verified.token, request.token);
  await assert.rejects(service.consume(challenge.challenge_id, sentCode), /already used/);

  assert.equal(await service.sessionApproved(request.userId, request.token), false);
  await service.approveSession(request.userId, request.token, verified.epoch);
  assert.equal(await service.sessionApproved(request.userId, request.token), true);
  assert.equal(await service.sessionApproved("another-user", request.token), false);
  const proof = await service.remember(request.userId, verified.credentialHash, verified.epoch);
  assert.match(proof, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify([...redis.values]).includes(proof));
  assert.equal(await service.isTrusted(request.userId, request.email, request.password, proof), true);
  assert.equal(await service.isTrusted("other", request.email, request.password, proof), false);
  assert.equal(await service.isTrusted(request.userId, request.email, "changed-password", proof), false);
  assert.equal(await service.isTrusted(request.userId, "changed@example.com", request.password, proof), false);
  assert.equal(await service.isTrusted(request.userId, request.email, request.password, "fabricated"), false);
  const device = [...redis.values].find(([key]) => key.includes(":device:"))![1];
  assert.equal(device.until - redis.now, 30 * 86400000);
  redis.now += 30 * 86400000 + 1;
  assert.equal(await service.isTrusted(request.userId, request.email, request.password, proof), false);
});

test("five incorrect attempts invalidate a code and cooldown is account-wide", async (t) => {
  const redis = new MemoryRedis();
  t.mock.method(deps, "getRedis", () => redis as unknown as ReturnType<typeof deps.getRedis>);
  let code = "";
  t.mock.method(deps, "sendEmail", async (_email: string, value: string) => { code = value; });
  const request = input();
  const challenge = await service.create(request);
  const wrong = code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 4; i++) await assert.rejects(service.consume(challenge.challenge_id, wrong), /Incorrect/);
  await assert.rejects(service.consume(challenge.challenge_id, wrong), /Too many/);
  await assert.rejects(service.consume(challenge.challenge_id, code), /already used/);
  for (let i = 0; i < 4; i++) { redis.now += 61000; await service.create(request); }
  redis.now += 61000;
  await assert.rejects(service.create(request), /in an hour/);
});

test("codes expire after ten minutes and mail failures do not leave valid challenges", async (t) => {
  const redis = new MemoryRedis();
  t.mock.method(deps, "getRedis", () => redis as unknown as ReturnType<typeof deps.getRedis>);
  let code = "";
  const mail = t.mock.method(deps, "sendEmail", async (_email: string, value: string) => { code = value; });
  const challenge = await service.create(input());
  redis.now += 601000;
  await assert.rejects(service.consume(challenge.challenge_id, code), /expired/);
  mail.mock.mockImplementation(async () => { throw new Error("SMTP failure"); });
  await assert.rejects(service.create(input()), /Could not send/);
  for (const [key] of redis.values) {
    if (key.includes(":challenge:")) assert.equal(await redis.get(key), null);
  }
});

test("credential changes revoke device proofs, pending codes, and approved sessions", async (t) => {
  const redis = new MemoryRedis();
  t.mock.method(deps, "getRedis", () => redis as unknown as ReturnType<typeof deps.getRedis>);
  let code = "";
  t.mock.method(deps, "sendEmail", async (_email: string, value: string) => { code = value; });
  const request = input();
  const challenge = await service.create(request);
  const proof = await service.remember(request.userId, loginHash(JSON.stringify([request.email, request.password])), "0");
  await service.approveSession(request.userId, request.token);
  await service.revokeAll(request.userId);
  assert.equal(await service.isTrusted(request.userId, request.email, request.password, proof), false);
  assert.equal(await service.sessionApproved(request.userId, request.token), false);
  await assert.rejects(service.consume(challenge.challenge_id, code), /Credentials changed/);
  await assert.rejects(service.approveSession(request.userId, request.token, "0"), /Credentials changed/);
});

test("User, Admin, and Super Admin receive no access token before device verification", async (t) => {
  const request = input();
  t.mock.method(supabase.auth, "signInWithPassword", async () => ({ data: { user: { id: request.userId, email: request.email }, session: { access_token: request.token } }, error: null }));
  t.mock.method(service, "isTrusted", async () => false);
  t.mock.method(service, "create", async () => ({ verification_required: true, challenge_id: "challenge" }));
  const approval = t.mock.method(service, "approveSession", async () => {});
  for (const role of ["user", "admin", "super_admin"]) {
    const profile = t.mock.method(profileService, "getProfile", async () => ({ data: { role, status: "Active" }, error: null }));
    const { res, result } = response();
    await (role === "user" ? login : adminLogin)({ body: request, headers: {} } as Request, res);
    assert.equal(result.status, 200);
    assert.equal(result.body.verification_required, true);
    assert.equal("access_token" in result.body, false);
    profile.mock.restore();
  }
  assert.equal(approval.mock.callCount(), 0);
});

test("trusted devices log in without sending another email", async (t) => {
  const request = input();
  t.mock.method(supabase.auth, "signInWithPassword", async () => ({ data: { user: { id: request.userId, email: request.email }, session: { access_token: request.token } }, error: null }));
  t.mock.method(profileService, "getProfile", async () => ({ data: { role: "user", status: "Active" }, error: null }));
  t.mock.method(service, "isTrusted", async () => true);
  const approval = t.mock.method(service, "approveSession", async () => {});
  const create = t.mock.method(service, "create", async () => { throw new Error("Must not send email"); });
  t.mock.method(notificationService, "createLoginActivity", async () => ({ data: true }));
  const { res, result } = response();
  await login({ body: request, headers: {} } as Request, res);
  assert.equal(result.body.access_token, request.token);
  assert.equal(approval.mock.callCount(), 1);
  assert.equal(create.mock.callCount(), 0);
});

test("disabled accounts and wrong login roles cannot request or bypass verification", async (t) => {
  const request = input();
  t.mock.method(supabase.auth, "signInWithPassword", async () => ({ data: { user: { id: request.userId, email: request.email }, session: { access_token: request.token } }, error: null }));
  const create = t.mock.method(service, "create", async () => { throw new Error("Must not send email"); });
  for (const [role, status, handler] of [["user", "Disabled", login], ["admin", "Active", login], ["user", "Active", adminLogin]] as const) {
    const profile = t.mock.method(profileService, "getProfile", async () => ({ data: { role, status }, error: null }));
    const { res, result } = response();
    await handler({ body: request, headers: {} } as Request, res);
    assert.equal(result.status, 403);
    profile.mock.restore();
  }
  assert.equal(create.mock.callCount(), 0);
});

test("the API rejects a valid Supabase token without approved email verification", async (t) => {
  t.mock.method(supabase.auth, "getUser", async () => ({ data: { user: { id: "user-1" } }, error: null }));
  t.mock.method(service, "sessionApproved", async () => false);
  const { res, result } = response();
  let called = false;
  await authenticate({ headers: { authorization: "Bearer password-only-token" } } as Request, res, () => { called = true; });
  assert.equal(result.status, 401);
  assert.equal(result.body.code, "DEVICE_VERIFICATION_REQUIRED");
  assert.equal(called, false);
});

test("verification endpoint rejects malformed requests before consuming a code", async () => {
  for (const body of [{}, { challenge_id: "bad", code: "123456" }, { challenge_id: "a".repeat(64), code: "123" }]) {
    const { res, result } = response();
    await verifyLoginCode({ body } as Request, res);
    assert.equal(result.status, 400);
  }
});

test("verification rechecks account status and only then approves a session", async (t) => {
  const request = input();
  t.mock.method(service, "consume", async () => ({ ...request, epoch: "0", credentialHash: "hash", admin: true }));
  t.mock.method(supabase.auth, "getUser", async () => ({ data: { user: { id: request.userId, email: request.email } }, error: null }));
  const remember = t.mock.method(service, "remember", async () => "device-proof");
  const approval = t.mock.method(service, "approveSession", async () => {});
  t.mock.method(notificationService, "createLoginActivity", async () => ({ data: true }));
  for (const status of ["Disabled", "Active"]) {
    const profile = t.mock.method(profileService, "getProfile", async () => ({ data: { status, role: "super_admin", fullname: "Test Admin" }, error: null }));
    const { res, result } = response();
    await verifyLoginCode({ body: { challenge_id: "a".repeat(64), code: "123456" }, headers: {} } as Request, res);
    if (status === "Disabled") {
      assert.equal(result.status, 403);
      assert.equal(approval.mock.callCount(), 0);
      assert.equal(remember.mock.callCount(), 0);
    } else {
      assert.equal(result.status, 200);
      assert.equal(result.body.access_token, request.token);
      assert.equal(result.body.device_token, "device-proof");
      assert.equal(approval.mock.callCount(), 1);
    }
    profile.mock.restore();
  }
});

test("a verification-storage outage fails closed instead of admitting a password-only session", async (t) => {
  t.mock.method(supabase.auth, "getUser", async () => ({ data: { user: { id: "user-1" } }, error: null }));
  t.mock.method(service, "sessionApproved", async () => { throw new Error("Redis unavailable"); });
  const { res, result } = response();
  let called = false;
  await authenticate({ headers: { authorization: "Bearer token" } } as Request, res, () => { called = true; });
  assert.equal(result.status, 503);
  assert.equal(called, false);
});

test("registration never issues a password-only access token", async (t) => {
  t.mock.method(supabaseAdmin.auth.admin, "createUser", async () => ({ data: { user: { id: "user-1" } }, error: null }));
  t.mock.method(profileService, "recordTermsAcceptance", async () => ({ error: null }));
  const { res, result } = response();
  await register({ body: { userName: "Test User", email: "person@example.com", password: "Strong!Pass123", termsVersion: "1.0" } } as Request, res);
  assert.equal(result.status, 200);
  assert.equal(result.body.login_required, true);
  assert.equal("access_token" in result.body, false);
});
