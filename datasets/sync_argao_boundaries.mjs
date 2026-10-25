import { mkdir, writeFile } from "node:fs/promises";

// Pin the source blob so a future upstream edit cannot silently move reports.
const source = "https://api.github.com/repos/faeldon/philippines-json-maps/git/blobs/f399a677989cad33235169e0e8f5954c42f23df9";
const response = await fetch(source);
if (!response.ok) throw new Error(`Boundary download failed: ${response.status}`);
const blob = await response.json();
const geojson = JSON.parse(Buffer.from(blob.content, "base64").toString("utf8"));
if (geojson.features.length !== 45) throw new Error("Expected all 45 Argao barangays");
const features = geojson.features.map(({ properties, geometry }) => {
  if (properties.ADM3_PCODE !== "PH072205000") throw new Error("Non-Argao geometry");
  if (!["Polygon", "MultiPolygon"].includes(geometry.type)) throw new Error("Invalid geometry");
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const positions = polygons.flat(2);
  if (positions.some(([lng, lat]) => lng < 123 || lng > 124 || lat < 9 || lat > 11)) throw new Error("Expected WGS84 longitude/latitude");
  return {
    name: properties.ADM4_EN,
    code: properties.ADM4_PCODE,
    bounds: [Math.min(...positions.map(([x]) => x)), Math.min(...positions.map(([, y]) => y)), Math.max(...positions.map(([x]) => x)), Math.max(...positions.map(([, y]) => y))],
    polygons,
  };
});
const data = JSON.stringify({ source, vintage: "2019", features }) + "\n";
for (const path of ["../clients/constants/argaoBarangayBoundaries.json", "../server/src/data/argaoBarangayBoundaries.json"]) {
  const url = new URL(path, import.meta.url);
  await mkdir(new URL(".", url), { recursive: true });
  await writeFile(url, data);
}
console.log(`Synced ${features.length} barangay polygons (${Buffer.byteLength(data)} bytes per app)`);
