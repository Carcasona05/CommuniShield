import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

for (const file of ["components/MapView.jsx", "components/Admin_compo/AdminHeatMap.jsx"]) {
  test(`${file} removes only the Leaflet prefix, retaining map-provider credits`, () => {
    const source = readFileSync(new URL(`../../clients/${file}`, import.meta.url), "utf8");
    assert.match(source, /map\.attributionControl\.setPrefix\(false\)/);
    assert.match(source, /attribution: "&copy; OpenStreetMap contributors"/);
    assert.doesNotMatch(source, /attributionControl:\s*false/);
  });
}
