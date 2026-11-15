import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { reportImageSource, reportImageList } from "../services/reportImageSource.js";
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("all supported saved photo representations resolve to usable image sources", () => {
  for (const value of [" https://example.test/a.jpg ", { uri: "https://example.test/a.jpg" }, { url: "https://example.test/a.jpg" }, { image_url: "https://example.test/a.jpg" }]) {
    assert.equal(reportImageSource(value).uri, "https://example.test/a.jpg");
  }
  assert.equal(reportImageSource(42), 42);
  assert.deepEqual(reportImageList([null, {}, "", { uri: " " }]), []);
  assert.deepEqual(reportImageList(["a", { url: "b" }, { image_url: "c" }]).map(image => image.uri), ["a", "b", "c"]);
});

test("one photo fills the grid, two share equal cells, three have one tall and two stacked cells", () => {
  const grid = read("components/ReportPhotoGrid.jsx");
  assert.match(grid, /\{photo\(0\)\}/);
  assert.match(grid, /list.length === 2 && photo\(1\)/);
  assert.match(grid, /list.length === 3 && <View style=\{styles.column\}>\{photo\(1\)\}\{photo\(2\)\}/);
  assert.match(grid, /cell: \{ flex: 1/);
  assert.match(grid, /column: \{ flex: 1/);
  assert.match(grid, /onPress=\{\(\) => onPress\(index\)\}/);
});

test("Home, My Reports and both detail pages use the same complete three-photo layout", () => {
  for (const path of ["components/ReportPost_Layout.jsx", "components/User_compo/MyUser_RepPost_Layout.jsx"]) {
    assert.match(read(path), /<ReportPhotoGrid images=\{imageList\} onPress=\{setViewerIndex\}/);
    assert.match(read(path), /<FullscreenImageViewer/);
  }
  for (const path of ["components/User_compo/User_RepPostView_Layout.jsx", "components/User_compo/MyUser_RepPostView_Layout.jsx"]) {
    assert.match(read(path), /import ReportPhotoGallery/);
    assert.match(read(path), /<ReportPhotoGallery images=/);
    assert.doesNotMatch(read(path), /images.slice\(0, 2\)/);
  }
});

test("failed loads show an explicit error and retry instead of an unlabelled gray box", () => {
  const image = read("components/ReportImage.jsx");
  assert.match(image, /onError=\{\(\) => setState\("error"\)\}/);
  assert.match(image, /Photo unavailable/);
  assert.match(image, /accessibilityLabel="Retry photo"/);
  assert.match(image, /onLoad=\{\(\) => setState\("ready"\)\}/);
  const viewer = read("components/FullscreenImageViewer.jsx");
  assert.match(viewer, /<ReportImage image=\{image\}/);
  assert.match(viewer, /image=\{list\[index\]\}/);
  assert.match(viewer, /createPhotoGestures/);
});
