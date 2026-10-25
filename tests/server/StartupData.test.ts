import "../helpers/serverEnvironment.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, Response } from "express";
import { authenticate, requireRole } from "../../server/src/middlewares/authMiddleware.js";
import { getSession } from "../../server/src/controllers/authController.js";
import { getAdminOverview } from "../../server/src/controllers/reportController.js";
import { supabase } from "../../server/src/config/supabase.js";
import { supabaseAdmin } from "../../server/src/config/supabaseAdmin.js";
import { profileService } from "../../server/src/services/authService.js";
import { loginVerificationService } from "../../server/src/services/loginVerificationService.js";
import { reportService } from "../../server/src/services/reportService.js";

function response() {
  const result = { status: 200, body: {} as Record<string, unknown>, headers: {} as Record<string, string> };
  const res = { locals: {}, status(code: number) { result.status = code; return this; },
    setHeader(key: string, value: string) { result.headers[key] = value; },
    json(body: Record<string, unknown>) { result.body = body; return this; } } as unknown as Response;
  return { res, result };
}

test("startup session probe reuses verified identity without profile/credibility/report payload reads", async t => {
  t.mock.method(supabase.auth, "getUser", async () => ({ data: { user: { id: "verified-user" } }, error: null }));
  t.mock.method(loginVerificationService, "sessionApproved", async () => true);
  const profiles = t.mock.method(profileService, "getProfile", async () => ({ data: { role: "admin", status: "Active" }, error: null }));
  const { res, result } = response();
  const req = { headers: { authorization: "Bearer approved-token" } } as Request;
  let accepted = false;
  await authenticate(req, res, () => { accepted = true; });
  assert.equal(accepted, true);
  await getSession(req, res);
  assert.deepEqual(result.body, { userId: "verified-user", role: "admin" });
  assert.equal(result.headers["Cache-Control"], "no-store");
  await requireRole(["admin", "super_admin"])(req, res, () => {});
  assert.equal(profiles.mock.callCount(), 1, "role guard must reuse this request's authorized profile");
});

test("session probe cannot unlock saved data with an unverified or missing profile", async () => {
  const missing = response();
  await getSession({} as Request, missing.res);
  assert.equal(missing.result.status, 401);
  const noProfile = response();
  await getSession({ user: { id: "user" }, token: "a" } as unknown as Request, noProfile.res);
  assert.equal(noProfile.result.status, 503);
});

test("overview service uses exact head counts and never loads narratives or comment relations", async t => {
  const operations: { table: string; select: string; filters: unknown[] }[] = [];
  const counts = [1200, 200, 800, 100, 30];
  const from = (table: string) => {
    const index = operations.length;
    const operation = { table, select: "", filters: [] as unknown[] };
    operations.push(operation);
    const builder = {
      select(columns: string, options: unknown) { operation.select = columns; assert.deepEqual(options, { count: "exact", head: true }); return builder; },
      neq(...args: unknown[]) { operation.filters.push(["neq", ...args]); return builder; },
      eq(...args: unknown[]) { operation.filters.push(["eq", ...args]); return builder; },
      or(...args: unknown[]) { operation.filters.push(["or", ...args]); return builder; },
      not(...args: unknown[]) { operation.filters.push(["not", ...args]); return builder; },
      in(...args: unknown[]) { operation.filters.push(["in", ...args]); return builder; },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve({ count: counts[index], error: null }).then(resolve); },
    };
    return builder;
  };
  t.mock.method(supabaseAdmin, "from", from as unknown as typeof supabaseAdmin.from);
  const result = await reportService.getAdminOverview();
  assert.deepEqual(result, { data: { summary: { total: 1200, pending: 200, verified: 800, rejected: 100, hotspots: 30 } }, error: null });
  assert.equal(operations.length, 5);
  assert.ok(operations.every(op => op.table === "reports" && !/details|images|comments|profiles/.test(op.select)));
  assert.deepEqual(operations[0]!.filters, [["neq", "status", "Archived"]]);
});

test("unavailable overview counts fail explicitly rather than returning successful zeroes", async t => {
  t.mock.method(reportService, "getAdminOverview", async () => ({ data: null, error: "Database unavailable" }));
  const { res, result } = response();
  await getAdminOverview({} as Request, res);
  assert.equal(result.status, 503);
  assert.deepEqual(result.body, { error: "Database unavailable" });
});
