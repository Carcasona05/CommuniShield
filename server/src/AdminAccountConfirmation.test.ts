import "dotenv/config";
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Request, Response } from "express";
import { toggleStatus } from "./controllers/adminController.js";
import { supabaseAdmin } from "./config/supabaseAdmin.js";
import { profileService } from "./services/authService.js";
import { reportService } from "./services/reportService.js";
import { accountStatusSignal } from "./services/accountStatusSignal.js";

function fixture(t: TestContext, initial = "Active") {
  let status = initial;
  const writes: unknown[] = [];
  t.mock.method(profileService, "getProfile", (async () => ({ data: { role: "super_admin", fullname: "Ada" } })) as never);
  t.mock.method(reportService, "insertAuditLog", (async () => ({ data: true })) as never);
  const publish = t.mock.method(accountStatusSignal, "publish", async () => {});
  t.mock.method(supabaseAdmin, "from", (() => {
    let update: { status: string } | null = null;
    const query = {
      select() { return query; },
      update(value: { status: string }) { update = value; return query; },
      eq() { if (update) { writes.push(update); status = update.status; return Promise.resolve({ error: null }); } return query; },
      async single() { return { data: { status }, error: null }; },
    };
    return query;
  }) as never);
  const run = async (body: unknown) => {
    const output = { status: 200, body: {} as any };
    const res = { status(value: number) { output.status = value; return this; }, json(value: unknown) { output.body = value; return this; } } as unknown as Response;
    await toggleStatus({ user: { id: "actor" }, token: "offline", params: { id: "target" }, body } as unknown as Request, res);
    return output;
  };
  return { run, writes, publish };
}

test("confirmed Disable is idempotent and cannot turn an already-disabled account back on", async t => {
  const f = fixture(t);
  assert.equal((await f.run({ status: "Disabled" })).body.status, "Disabled");
  assert.equal((await f.run({ status: "Disabled" })).body.status, "Disabled");
  assert.deepEqual(f.writes, [{ status: "Disabled" }]);
  assert.equal(f.publish.mock.callCount(), 1);
});

test("confirmed Activate cannot disable an account that became active while confirmation was open", async t => {
  const f = fixture(t, "Active");
  const result = await f.run({ status: "Active" });
  assert.equal(result.status, 200);
  assert.equal(result.body.status, "Active");
  assert.equal(f.writes.length, 0);
  assert.equal(f.publish.mock.callCount(), 0);
});

test("Activate enables a disabled account; unsupported desired statuses do not mutate", async t => {
  const f = fixture(t, "Disabled");
  assert.equal((await f.run({ status: "Active" })).body.status, "Active");
  assert.equal((await f.run({ status: "Pending" })).status, 400);
  assert.deepEqual(f.writes, [{ status: "Active" }]);
});

test("legacy callers without an explicit desired status retain toggle behavior", async t => {
  const f = fixture(t);
  assert.equal((await f.run({})).body.status, "Disabled");
});
