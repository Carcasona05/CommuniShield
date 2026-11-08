import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, Response } from "express";
import type { User } from "@supabase/supabase-js";
import { manageSupportingModel, previewSupportingModelDeletion } from "./controllers/supportingModelController.js";
import { supportingModelService as service } from "./services/supportingModelService.js";
import { supabaseAdmin } from "./config/supabaseAdmin.js";
import app from "../api/index.js";
import { supabase } from "./config/supabase.js";
import { profileService } from "./services/authService.js";
import { loginVerificationService } from "./services/loginVerificationService.js";
import type { AddressInfo } from "node:net";
const id = "10000000-0000-4000-8000-000000000001";
const datasetId = "10000000-0000-4000-8000-000000000002";
const req = (body: unknown = {}) => ({ user: { id } as User, body, params: { id } }) as unknown as Request & { user: User };
function response() {
  const result = { status: 200, body: undefined as unknown };
  const res = { status(code: number) { result.status = code; return res; }, json(body: unknown) { result.body = body; return res; } } as Response;
  return { res, result };
}
test("deletion handlers require authentication and validate model IDs", async () => {
  for (const handler of [manageSupportingModel, previewSupportingModelDeletion]) {
    const { res, result } = response(); await handler({} as Request, res); assert.equal(result.status,401);
  }
  const { res, result } = response();
  await previewSupportingModelDeletion({ ...req(), params: { id: "invalid" } } as unknown as Request,res);
  assert.equal(result.status,400);
});
test("optional dataset archives require a delete action, unique IDs and positive versions", async (t) => {
  const write = t.mock.method(service,"action",async () => { throw new Error("must not write"); });
  const base = { action: "delete", modelId: id, generation: 3 };
  const good = { id: datasetId, version: 2 };
  for (const body of [
    {...base,archiveDatasets:null}, {...base,archiveDatasets:{}}, {...base,archiveDatasets:[good,good]},
    {...base,archiveDatasets:[{...good,id:"invalid"}]}, {...base,archiveDatasets:[{...good,version:0}]},
    {...base,archiveDatasets:[{...good,version:1.5}]}, {...base,archiveDatasets:[{...good,version:"2"}]},
    {...base,action:"archive",archiveDatasets:[good]}, {...base,archiveDatasets:Array(1001).fill(good)},
  ]) {
    const {res,result}=response(); await manageSupportingModel(req(body),res); assert.equal(result.status,400);
  }
  assert.equal(write.mock.callCount(),0);
});
test("confirmed selection uses authenticated actor and forwards exact versions", async (t) => {
  const selected = [{id:datasetId,version:2}];
  t.mock.method(service,"action",async (...args: unknown[]) => {
    assert.deepEqual(args,[id,"delete",id,3,undefined,selected]);
    return {data:{archivedDatasetIds:[datasetId]},error:null};
  });
  const {res,result}=response();
  await manageSupportingModel(req({action:"delete",modelId:id,generation:3,archiveDatasets:selected,actor:"forged"}),res);
  assert.equal(result.status,200);
});
test("all deletions use the guarded direct-delete RPC, with dataset archiving opt-in", async (t) => {
  const rpc = t.mock.method(supabaseAdmin,"rpc",async () => ({data:{id},error:null}));
  await service.action(id,"delete",id,3);
  assert.equal(rpc.mock.calls[0]!.arguments[0],"delete_sentiment_supporting_with_datasets");
  assert.deepEqual(rpc.mock.calls[0]!.arguments[1],{p_actor:id,p_model:id,p_generation:3,p_datasets:[]});
  const selected = [{id:datasetId,version:2}];
  await service.action(id,"delete",id,3,undefined,selected);
  assert.equal(rpc.mock.calls[1]!.arguments[0],"delete_sentiment_supporting_with_datasets");
  assert.deepEqual(rpc.mock.calls[1]!.arguments[1],{p_actor:id,p_model:id,p_generation:3,p_datasets:selected});
});
test("stale, forbidden and invalid combined deletions surface without fallback deletion", async (t) => {
  for (const [code,status] of [["40001",409],["42501",403],["22023",400]]) {
    const mock = t.mock.method(service,"action",async () => ({data:null,error:{code,message:"Refresh first"}}));
    const {res,result}=response();
    await manageSupportingModel(req({action:"delete",modelId:id,generation:3,archiveDatasets:[{id:datasetId,version:2}]}),res);
    assert.equal(result.status,status); assert.equal(mock.mock.callCount(),1); mock.mock.restore();
  }
});
test("real preview and delete routes require super admin", async (t) => {
  let role = "admin";
  t.mock.method(supabase.auth,"getUser",async () => ({data:{user:{id}},error:null}));
  t.mock.method(loginVerificationService,"sessionApproved",async () => true);
  t.mock.method(profileService,"getProfile",async () => ({data:{role,status:"Active"},error:null}));
  const preview = t.mock.method(service,"deletePreview",async (actor: string, model: string) => {
    assert.equal(actor,id); assert.equal(model,id); return {data:{modelId:id,generation:3,datasets:[]},error:null};
  });
  const action = t.mock.method(service,"action",async () => ({data:{id},error:null}));
  const server=app.listen(0,"127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening",resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/sentiment/supporting-models`;
  const headers={Authorization:"Bearer test-only-token","Content-Type":"application/json"};
  for (const current of ["user","admin"]) {
    role=current;
    assert.equal((await fetch(`${base}/${id}/delete-preview`,{headers})).status,403);
    assert.equal((await fetch(base,{method:"POST",headers,body:JSON.stringify({action:"delete",modelId:id,generation:3})})).status,403);
  }
  assert.equal(preview.mock.callCount(),0); assert.equal(action.mock.callCount(),0);
  role="super_admin";
  assert.equal((await fetch(`${base}/${id}/delete-preview`,{headers})).status,200);
});
