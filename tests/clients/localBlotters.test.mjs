import assert from "node:assert/strict";
import { test } from "node:test";
import { createLocalBlotterStore } from "../utils/localBlotters.js";
import { getBlotterFormValues, validateBlotterForm } from "../utils/blotterForm.js";
import { getPoliceCertification } from "../utils/policeCertification.js";

const input = () => ({
  ...getBlotterFormValues(),
  incidentType: "[Case]",
  location: "[Place]",
  incidentDescription: "[First paragraph]\n\n[Second paragraph]",
  actionTaken: "[Disposition]",
  blotterOfficer: "[Officer]",
  incidentDateTime: "2026-10-26T14:30",
  issuanceDate: "2026-10-26",
});
const memoryStorage = () => {
  const values = new Map();
  return {
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); },
  };
};

test("a locally saved record and its generated numbers survive recreating the store", async () => {
  const storage = memoryStorage();
  const store = createLocalBlotterStore(storage);
  const saved = await store.save(input());
  assert.equal(saved.blotter_no, "ARGAO-BLT-000001");
  assert.equal(saved.page_number, "1");
  assert.deepEqual(await createLocalBlotterStore(storage).list(), [saved]);
  assert.deepEqual(getBlotterFormValues(saved), input());
});

test("simultaneous saves allocate distinct numbers without losing records", async () => {
  const store = createLocalBlotterStore(memoryStorage());
  const saved = await Promise.all(Array.from({ length: 20 }, () => store.save(input())));
  assert.equal(new Set(saved.map((record) => record.id)).size, 20);
  assert.equal(new Set(saved.map((record) => record.blotter_no)).size, 20);
  assert.equal(new Set(saved.map((record) => record.page_number)).size, 20);
  assert.equal((await store.list()).length, 20);
});

test("editing keeps assigned numbers and deletion never reuses the last number", async () => {
  const store = createLocalBlotterStore(memoryStorage());
  const first = await store.save(input());
  const edited = await store.save({ ...input(), actionTaken: "[Updated Disposition]", blotterNo: "MANUAL", pageNumber: "99" }, first.id);
  assert.equal(edited.blotter_no, first.blotter_no);
  assert.equal(edited.page_number, first.page_number);
  assert.equal(edited.created_at, first.created_at);
  assert.equal(edited.action_taken, "[Updated Disposition]");
  await store.remove(first.id);
  assert.deepEqual(await store.list(), []);
  const next = await store.save(input());
  assert.equal(next.blotter_no, "ARGAO-BLT-000002");
  assert.equal(next.page_number, "2");
  await assert.rejects(store.save(input(), "missing-id"), /could not be found/);
});

test("a failed storage write rejects the save and does not break subsequent operations", async () => {
  const storage = memoryStorage();
  const write = storage.setItem;
  let fail = true;
  storage.setItem = async (...args) => {
    if (fail) { fail = false; throw new Error("Storage unavailable"); }
    return write(...args);
  };
  const store = createLocalBlotterStore(storage);
  await assert.rejects(store.save(input()), /Storage unavailable/);
  assert.deepEqual(await store.list(), []);
  assert.equal((await store.save(input())).blotter_no, "ARGAO-BLT-000001");
});

test("calendar validation accepts leap days and rejects impossible dates and incomplete occurrence selections", async () => {
  const store = createLocalBlotterStore(memoryStorage());
  assert.deepEqual(validateBlotterForm({ ...input(), issuanceDate: "2024-02-29" }), {});
  assert.ok(validateBlotterForm({ ...input(), issuanceDate: "2025-02-29" }).issuanceDate);
  for (const incidentDateTime of ["2026-02-30T10:00", "2026-10-26T", "T14:30", "2026-10-26T24:00"]) {
    await assert.rejects(store.save({ ...input(), incidentDateTime }), /valid occurrence date and time/);
  }
  assert.deepEqual(await store.list(), []);
});

test("issuance is always Argao, Cebu and location inputs are not part of the form", async () => {
  const values = input();
  assert.ok(!("issuanceCity" in values));
  assert.ok(!("issuanceProvince" in values));
  const store = createLocalBlotterStore(memoryStorage());
  const saved = await store.save(values);
  const certificate = getPoliceCertification({ ...saved, issuanceCity: "[Other City]", issuance_province: "[Other Province]" });
  assert.equal(certificate.issuance, "Issued this 26 day of October, 2026, Argao, Cebu, Philippines.");
  assert.equal(certificate.paragraphs.length, 2);
  assert.equal(certificate.fields[0][1], saved.blotter_no);
  assert.equal(certificate.fields[1][1], saved.page_number);
});
