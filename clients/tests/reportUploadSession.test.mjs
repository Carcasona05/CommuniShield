import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

function fixture(manipulate = async () => ({ uri: "data:image/jpeg;base64,AAAA" })) {
  let token = "owner";
  const requests = [];
  const context = vm.createContext({
    ImageManipulator: { manipulateAsync: manipulate, SaveFormat: { JPEG: "jpeg" } },
    AsyncStorage: { getItem: async () => token },
    apiClient: { post: async (...args) => { requests.push(args); return { data: { url: "uploaded-url" } }; } },
  });
  const source = readFileSync(new URL("../services/imageUpload.js", import.meta.url), "utf8")
    .replace(/^import .*;\r?\n/gm, "").replace(/export async function/g, "async function");
  vm.runInContext(`${source}\nglobalThis.upload = uploadImage;`, context);
  return { upload: context.upload, requests, setToken: value => { token = value; } };
}

test("background photo uploads retain the owner token and abort signal", async () => {
  const f = fixture();
  const controller = new AbortController();
  assert.equal(await f.upload("photo", { expectedToken: "owner", signal: controller.signal }), "uploaded-url");
  assert.equal(f.requests[0][2].headers.Authorization, "Bearer owner");
  assert.equal(f.requests[0][2].signal, controller.signal);
});

test("a stale queued photo cannot be uploaded with a different user's token", async () => {
  const f = fixture();
  f.setToken("replacement");
  await assert.rejects(f.upload("photo", { expectedToken: "owner" }), /account changed/);
  assert.equal(f.requests.length, 0);
});

test("logout during image compression prevents upload", async () => {
  let finish;
  const compressed = new Promise(resolve => { finish = resolve; });
  const f = fixture(() => compressed);
  const pending = f.upload("photo", { expectedToken: "owner" });
  await Promise.resolve();
  f.setToken(null);
  finish({ uri: "data:image/jpeg;base64,AAAA" });
  await assert.rejects(pending, /account changed/);
  assert.equal(f.requests.length, 0);
});

test("existing single-image callers work without background options", async () => {
  const f = fixture();
  assert.equal(await f.upload("photo"), "uploaded-url");
});

test("three concurrent photos upload their own encoded bytes, not temporary URIs", async () => {
  const f = fixture(async uri => ({ uri: "blob:temporary-result", base64: Buffer.from(uri).toString("base64") }));
  await Promise.all(["first-photo", "second-photo", "third-photo"].map(uri => f.upload(uri, { expectedToken: "owner" })));
  assert.deepEqual(f.requests.map(request => request[1].base64).sort(), ["first-photo", "second-photo", "third-photo"].map(value => Buffer.from(value).toString("base64")).sort());
  const source = readFileSync(new URL("../services/imageUpload.js", import.meta.url), "utf8");
  assert.match(source, /format: ImageManipulator.SaveFormat.JPEG, base64: true/);
});
