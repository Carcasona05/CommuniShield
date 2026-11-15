import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { appendReportPhotos, MAX_REPORT_PHOTOS } from "../services/reportPhotos.js";

test("accepts one, two or three selected photos at once", () => {
  for (const count of [1, 2, 3]) {
    const assets = Array.from({ length: count }, (_, index) => ({ uri: `photo-${index}` }));
    assert.deepEqual(appendReportPhotos([], assets), assets.map(asset => asset.uri));
  }
});

test("existing photos consume slots and oversized picker results cannot exceed three", () => {
  const assets = [{ uri: "new-1" }, { uri: "new-2" }, { uri: "new-3" }, { uri: "new-4" }];
  assert.equal(MAX_REPORT_PHOTOS, 3);
  assert.deepEqual(appendReportPhotos(["existing"], assets), ["existing", "new-1", "new-2"]);
  assert.deepEqual(appendReportPhotos(["a", "b", "c"], assets), ["a", "b", "c"]);
});

test("empty or invalid selections keep existing attachments", () => {
  assert.deepEqual(appendReportPhotos(["existing"], []), ["existing"]);
  assert.deepEqual(appendReportPhotos([], [null, {}, { uri: "" }, { uri: "valid" }]), ["valid"]);
});

test("gallery enables multi-select with remaining capacity while camera keeps single-photo editing", () => {
  const source = readFileSync(new URL("../app/(tabs)/User_PostReport.jsx", import.meta.url), "utf8");
  assert.match(source, /launchImageLibraryAsync\(\{\s*mediaTypes:[^\n]+\n\s*allowsMultipleSelection: true,\s*selectionLimit: MAX_REPORT_PHOTOS - photos.length,\s*allowsEditing: false/);
  assert.match(source, /launchCameraAsync\(\{\s*allowsEditing: true/);
  assert.match(source, /setPhotos\(prev => appendReportPhotos\(prev, result.assets\)\)/);
  assert.match(source, /!result.canceled/);
  assert.match(source, /sessionData.current\(epoch\) && !submitLockRef.current/);
});
