import "../helpers/serverEnvironment.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, Response } from "express";
import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "../../server/src/config/supabaseAdmin.js";
import { profileService } from "../../server/src/services/authService.js";
import { reportService } from "../../server/src/services/reportService.js";
import { accountStatusSignal } from "../../server/src/services/accountStatusSignal.js";
import { toggleStatus, updateAccount } from "../../server/src/controllers/adminController.js";

test("publisher sends an identity-free hint through HTTP and releases its channel", async t => {
  const sent: unknown[][] = [];
  const channel = { httpSend: async (...args: unknown[]) => { sent.push(args); return { success: true }; } };
  const opened = t.mock.method(supabaseAdmin, "channel", () => channel as never);
  const removed = t.mock.method(supabaseAdmin, "removeChannel", async () => "ok" as const);
  await accountStatusSignal.publish();
  assert.equal(opened.mock.calls[0]?.arguments[0], "cs-account-status");
  assert.deepEqual(sent, [["account-status-changed", {}, { timeout: 2500 }]]);
  assert.equal(removed.mock.callCount(), 1);
});

test("realtime outages do not fail the account update and still clean up", async t => {
  const channel = { httpSend: async () => { throw new Error("offline"); } };
  t.mock.method(supabaseAdmin, "channel", () => channel as never);
  const removed = t.mock.method(supabaseAdmin, "removeChannel", async () => "ok" as const);
  const warning = t.mock.method(console, "warn", () => {});
  await accountStatusSignal.publish();
  assert.equal(removed.mock.callCount(), 1);
  assert.equal(warning.mock.callCount(), 1);
});

for (const mode of ["toggle", "edit"] as const) {
  for (const failure of [false, true]) {
    test(`${mode} publishes only after a successful status write (failure=${failure})`, async t => {
      const events: string[] = [];
      t.mock.method(profileService, "getProfile", async () => ({ data: { role: "super_admin", fullname: "Supervisor" }, error: null }) as never);
      t.mock.method(reportService, "insertAuditLog", async () => ({ data: null, error: null }) as never);
      t.mock.method(accountStatusSignal, "publish", async () => { events.push("signal"); });
      const query = {
        select() { return this; },
        update() { events.push("write"); return this; },
        eq() { return this; },
        single: async () => ({ data: { status: "Active" }, error: null }),
        then(resolve: (value: unknown) => unknown) {
          events.push("committed");
          return Promise.resolve(resolve({ error: failure ? { message: "write failed" } : null }));
        },
      };
      t.mock.method(supabaseAdmin, "from", () => query as never);
      let status = 200;
      const response = {
        status(code: number) { status = code; return this; },
        json() { return this; },
      } as unknown as Response;
      const request = { user: { id: "super" } as User, token: "token", params: { id: "target" }, body: { status: "Disabled" } } as unknown as Request & { user: User; token: string };
      await (mode === "toggle" ? toggleStatus : updateAccount)(request, response);
      assert.equal(status, failure ? 500 : 200);
      assert.deepEqual(events, failure ? ["write", "committed"] : ["write", "committed", "signal"]);
    });
  }
}

test("ordinary profile edits do not broadcast account-status changes", async t => {
  t.mock.method(profileService, "getProfile", async () => ({ data: { role: "super_admin" }, error: null }) as never);
  t.mock.method(reportService, "insertAuditLog", async () => ({ data: null, error: null }) as never);
  const signal = t.mock.method(accountStatusSignal, "publish", async () => {});
  const query = { update() { return this; }, eq: async () => ({ error: null }) };
  t.mock.method(supabaseAdmin, "from", () => query as never);
  const response = { status() { return this; }, json() { return this; } } as unknown as Response;
  const request = { user: { id: "super" } as User, token: "token", params: { id: "target" }, body: { name: "Updated" } } as unknown as Request & { user: User; token: string };
  await updateAccount(request, response);
  assert.equal(signal.mock.callCount(), 0);
});
