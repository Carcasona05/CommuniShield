import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = file => readFileSync(new URL(`../../clients/${file}`, import.meta.url), "utf8");

test("opening comments from user feeds navigates directly without blocking access requests", () => {
  for (const file of ["components/ReportPost_Layout.jsx", "components/User_compo/MyUser_RepPost_Layout.jsx", "components/User_compo/User_RepPost_Layout.jsx"]) {
    const source = read(file);
    assert.match(source, /onPress=\{onComment\}/);
    assert.doesNotMatch(source, /ensureParticipationReady/);
  }
});

test("comment composers still verify participation and submission permissions", () => {
  for (const file of ["components/User_compo/MyUser_RepPostView_Layout.jsx", "components/User_compo/User_RepPostView_Layout.jsx"]) {
    const source = read(file);
    assert.match(source, /await ensureParticipationReady\(\)/);
    assert.match(source, /usePaginatedComments\((?:post|report)\?\.id/);
  }
  assert.match(read("hooks/usePaginatedComments.js"), /await ensureCompleteProfile\("comment"\)/);
});
