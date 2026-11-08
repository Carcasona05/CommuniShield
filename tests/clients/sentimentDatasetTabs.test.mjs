import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../../clients/components/Admin_compo/SentimentDatasetManager.jsx", import.meta.url), "utf8");

test("dataset library defaults to current with separate archive pagination and a current-only status filter", () => {
  assert.match(source, /\[datasetTab, setDatasetTab\] = useState\("current"\)/);
  assert.match(source, /useState\(\{ current: 1, archived: 1 \}\)/);
  assert.match(source, /const page = pages\[datasetTab\]/);
  assert.match(source, /Current Datasets.*counts.current/);
  assert.match(source, /Archived Datasets.*counts.archived/);
  const filter = source.match(/placeholder="Filter current datasets" options=\{(.*?)\} selectedValue/)[1];
  assert.doesNotMatch(filter, /archived/);
  assert.match(filter, /pending/); assert.match(filter, /approved/); assert.match(filter, /rejected/);
});

test("restore is confirmed, restricted in UI and refreshes from the network", () => {
  assert.match(source, /const canRestore = isSuperAdmin && batch\?\.status === "archived"/);
  assert.match(source, /title="Restore dataset".*setConfirmation\("restore"\)/);
  assert.match(source, /Approval and training are not automatic/);
  assert.match(source, /await load\(\{ force: true \}\)/);
});
