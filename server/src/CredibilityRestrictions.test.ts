import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Response, Request } from "express";
import { readFileSync } from "node:fs";
import { supabaseAdmin } from "./config/supabaseAdmin.js";
import { credibilityFailure, requireCredibilityWriteAccess, requireCredibilityEditAccess } from "./controllers/credibilityController.js";
import { cleanCredibilityReview } from "./utils/credibilityReview.js";
import { credibilityService, CREDIBILITY_POINTS } from "./services/credibilityService.js";
const user = "10000000-0000-4000-8000-000000000001";
const req = (body = {}) => ({ user: { id: user }, body, params: { id: user } }) as unknown as Request & { user: { id: string } };
function response() {
  const output = { status: 200, body: null as any };
  const res = { status(n: number) { output.status = n; return this; }, json(body: unknown) { output.body = body; return this; } } as unknown as Response;
  return { output, res };
}
test("credibility gate fails closed when verification cannot be loaded", async t => {
  t.mock.method(supabaseAdmin, "rpc", async () => ({ data: null, error: { message: "missing migration" } }) as never);
  for (const gate of [requireCredibilityWriteAccess("report"), requireCredibilityWriteAccess("comment"), requireCredibilityEditAccess]) {
    const { output, res } = response(); await gate(req(), res, () => assert.fail("must block")); assert.equal(output.status, 503);
  }
});
test("score restrictions distinguish suspension, disabled commenting and daily quota", async t => {
  let access = { policyVersion: "timed-v1", suspended: true, reportAllowed: false, commentAllowed: false, commentLimit: 0 };
  t.mock.method(supabaseAdmin, "rpc", async () => ({ data: access, error: null }) as never);
  let r = response(); await requireCredibilityWriteAccess("report")(req(),r.res,()=>assert.fail()); assert.equal(r.output.status,403);
  assert.match(r.output.body.error,/automatically/);
  access = { ...access, suspended: false };
  r=response(); await requireCredibilityWriteAccess("comment")(req(),r.res,()=>assert.fail()); assert.equal(r.output.status,403);
  assert.match(r.output.body.error,/at least 40/);
  r=response(); await requireCredibilityWriteAccess("report")(req(),r.res,()=>assert.fail()); assert.equal(r.output.status,429);
  assert.equal(r.output.body.code,"CREDIBILITY_DAILY_LIMIT");
});
test("a database without the timed policy marker cannot silently serve outdated rules",async t=>{
  t.mock.method(supabaseAdmin,"rpc",async()=>({data:{reportAllowed:true,commentAllowed:true,editAllowed:true},error:null}) as never);
  const r=response();await requireCredibilityWriteAccess("report")(req(),r.res,()=>assert.fail("old policy must block"));
  assert.equal(r.output.status,503);assert.match(r.output.body.error,/migration/);
});
test("eligible accounts continue; database remains responsible for atomic quota consumption",async t=>{
  t.mock.method(supabaseAdmin,"rpc",async()=>({data:{policyVersion:"timed-v1",reportAllowed:true,commentAllowed:true,editAllowed:true},error:null}) as never);
  for(const gate of [requireCredibilityWriteAccess("report"),requireCredibilityWriteAccess("comment"),requireCredibilityEditAccess]) {
    let continued=false; await gate(req(),response().res,()=>{continued=true;}); assert.equal(continued,true);
  }
});
test("AI review omits technical image flags in both generated and stored legacy reviews",()=>{
  assert.equal(cleanCredibilityReview("Specific report details.\n\n Image authenticity flags: MISSING_EXIF_DATA, MISSING_TIMESTAMP"),"Specific report details.");
  assert.equal(cleanCredibilityReview("Useful review.\nMISSING_GPS_LOCATION\nPHOTO_LOCATION_MISMATCH_2.0km\nPHOTO_TOO_OLD_56h"),"Useful review.");
  assert.equal(cleanCredibilityReview("Images: No authenticity issues detected"),"Manual review recommended.");
  const ai=readFileSync(new URL("./services/aiService.ts",import.meta.url),"utf8");
  assert.doesNotMatch(ai,/credibilityReview \+=/);
});
test("content error mapping is explicit and old submission scoring cannot award points",async()=>{
  assert.equal(credibilityFailure("CREDIBILITY_DAILY_LIMIT")?.status,429);
  assert.equal(credibilityFailure("database failure"),null);
  assert.equal(CREDIBILITY_POINTS.report_submitted,0);
  assert.equal(CREDIBILITY_POINTS.report_verified,15);
  assert.equal((await credibilityService.addPoints(user,"report_submitted")).data,0);
  assert.ok((await credibilityService.addPoints(user,"report_verified")).error);
});
test("the credibility API exposes only current access and normal users cannot self-verify",()=>{
  const routes=readFileSync(new URL("./routes/reportRoute.ts",import.meta.url),"utf8");
  const credibilityRoutes=routes.split(/\r?\n/).filter(line=>/router\..*"\/credibility\//.test(line));
  assert.equal(credibilityRoutes.length,1);
  assert.match(credibilityRoutes[0]!,/router.get\("\/credibility\/access", authenticate, getCredibilityAccess\)/);
  const controller=readFileSync(new URL("./controllers/reportController.ts",import.meta.url),"utf8");
  assert.match(controller,/userRole === "user" \? \{ status: "Pending Review", is_verified: false \}/);
  assert.doesNotMatch(controller,/\.addPoints\(/);
});
