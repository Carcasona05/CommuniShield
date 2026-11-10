import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { waitForReportImages } from "../../clients/utils/formalReport.js";

const makeImage = ({ complete = true, naturalWidth = 100, alt = "Station logo" } = {}) => {
  const listeners = new Map();
  return {
    complete, naturalWidth, alt, listeners,
    addEventListener: (name, handler) => listeners.set(name, handler),
    removeEventListener: (name) => listeners.delete(name),
    replaceWith(placeholder) { this.placeholder = placeholder; },
  };
};

const makeDocument = (images) => ({
  images,
  createElement: () => ({ style: {}, textContent: "" }),
});

test("PDF image preparation accepts reports without images and loaded images", async () => {
  await waitForReportImages(makeDocument([]));
  const image = makeImage();
  await waitForReportImages(makeDocument([image]));
  assert.equal(image.placeholder, undefined);
});

test("an expired logo does not block PDF export and is explicitly marked", async () => {
  const image = makeImage({ naturalWidth: 0 });
  await waitForReportImages(makeDocument([image]));
  assert.equal(image.placeholder.textContent, "Image unavailable: Station logo");
});

test("loading attachments can succeed or fail without blocking PDF export", async () => {
  const loaded = makeImage({ complete: false });
  const failed = makeImage({ complete: false, alt: "Incident photograph 1" });
  const ready = waitForReportImages(makeDocument([loaded, failed]));
  loaded.listeners.get("load")();
  failed.listeners.get("error")();
  await ready;
  assert.equal(loaded.placeholder, undefined);
  assert.equal(failed.placeholder.textContent, "Image unavailable: Incident photograph 1");
  assert.equal(loaded.listeners.size, 0);
  assert.equal(failed.listeners.size, 0);
});

test("unresponsive images time out with a placeholder instead of aborting export", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const image = makeImage({ complete: false });
  const ready = waitForReportImages(makeDocument([image]));
  t.mock.timers.tick(10000);
  await ready;
  assert.equal(image.placeholder.textContent, "Image unavailable: Station logo");
  assert.equal(image.listeners.size, 0);
});

test("both admin PDF exports wait for images before opening the print dialog", () => {
  for (const path of ["(admin)/Admin_ReportManagement.jsx", "(sadmin)/SAdmin_ReportManagement.jsx"]) {
    const source = readFileSync(new URL(`../../clients/app/${path}`, import.meta.url), "utf8");
    assert.match(source, /await waitForReportImages\(printWindow.document\);\s*printWindow.focus\(\);\s*printWindow.print\(\)/);
    assert.match(source, /try \{\s*const html = buildRecordDocumentHtml\(previewRecord\);/);
  }
});
