import assert from "node:assert/strict";
import { test } from "node:test";
import { uploadBatch } from "../../clients/services/uploadBatch.js";

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

test("three photo uploads overlap while result ordering matches the user's photo order", async () => {
  const gates = Array.from({ length: 3 }, deferred);
  const started = [];
  const progress = [];
  const pending = uploadBatch([0, 1, 2], async (index) => {
    started.push(index);
    await gates[index].promise;
    return `photo-${index}`;
  }, { onProgress: (value) => progress.push(value) });
  assert.deepEqual(started, [0, 1, 2]);
  gates[2].resolve(); gates[1].resolve(); gates[0].resolve();
  assert.deepEqual(await pending, ["photo-0", "photo-1", "photo-2"]);
  assert.deepEqual(progress.map((value) => value.completed), [0, 1, 2, 3]);
});

test("larger batches stay within the configured concurrency limit", async () => {
  let active = 0;
  let peak = 0;
  const result = await uploadBatch([0, 1, 2, 3, 4, 5], async (index) => {
    active++; peak = Math.max(peak, active);
    await Promise.resolve(); active--;
    return index;
  }, { concurrency: 2 });
  assert.equal(peak, 2);
  assert.deepEqual(result, [0, 1, 2, 3, 4, 5]);
});

test("a failed photo is never silently omitted and all in-flight work settles before retry", async () => {
  const gate = deferred();
  let settled = false;
  const pending = uploadBatch([0, 1], async (index) => {
    if (index === 0) throw new Error("Network down");
    await gate.promise;
    return "photo-1";
  });
  const rejection = assert.rejects(pending, /Photo 1 could not upload/).then(() => { settled = true; });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(settled, false);
  gate.resolve();
  await rejection;
});

test("empty photo selection makes no requests and invalid concurrency is rejected", async () => {
  assert.deepEqual(await uploadBatch([], () => { throw new Error("must not run"); }), []);
  await assert.rejects(uploadBatch([], () => {}, { concurrency: 0 }), /between 1 and 3/);
});
