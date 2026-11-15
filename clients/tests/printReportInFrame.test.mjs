import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { printReportInFrame } from "../utils/printReportInFrame.js";

function fixture() {
  const events = [], listeners = new Map();
  const doc = { open() { events.push("open"); }, write(html) { events.push(html); }, close() { events.push("close"); }, fonts: { ready: Promise.resolve() } };
  const win = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name), focus() { events.push("focus"); }, print() { events.push("print"); } };
  const frame = { style: {}, setAttribute() {}, contentWindow: win, contentDocument: doc, remove() { events.push("remove"); } };
  const host = { createElement(tag) { assert.equal(tag, "iframe"); return frame; }, body: { appendChild() { events.push("append"); } } };
  return { events, listeners, frame, host, win };
}

test("prints a hidden frame after images are prepared, with no new tab", async () => {
  const f = fixture();
  try {
    await printReportInFrame("<html>Report</html>", f.host, async () => { f.events.push("images"); });
    assert.deepEqual(f.events, ["append", "open", "<html>Report</html>", "close", "images", "focus", "print"]);
    assert.match(f.frame.style.cssText, /left:-10000px/);
    assert.doesNotMatch(f.frame.style.cssText, /display:none/);
    f.listeners.get("afterprint")();
    assert.equal(f.events.at(-1), "remove");
    assert.equal(f.listeners.size, 0);
  } finally { f.listeners.get("afterprint")?.(); }
});

test("print failure removes the frame and surfaces the error", async () => {
  const f = fixture();
  f.win.print = () => { throw new Error("Printing unavailable"); };
  await assert.rejects(printReportInFrame("report", f.host, async () => {}), /Printing unavailable/);
  assert.equal(f.events.at(-1), "remove");
  assert.equal(f.listeners.size, 0);
});

test("preparation failure removes the frame without printing", async () => {
  const f = fixture();
  await assert.rejects(printReportInFrame("report", f.host, async () => { throw new Error("Could not prepare"); }), /Could not prepare/);
  assert.equal(f.events.at(-1), "remove");
  assert.ok(!f.events.includes("print"));
});

test("both roles use the shared frame export and native PDF generation stays intact", () => {
  const shared = readFileSync(new URL("../components/Admin_compo/RecordManagementPage.jsx", import.meta.url), "utf8");
  assert.match(shared, /await printReportInFrame\(html\)/);
  assert.doesNotMatch(shared, /window.open|Allow pop-ups/);
  assert.match(shared, /Print.printToFileAsync/);
  for (const route of ["(admin)/Admin_ReportManagement.jsx", "(sadmin)/SAdmin_ReportManagement.jsx"]) {
    assert.match(readFileSync(new URL(`../app/${route}`, import.meta.url), "utf8"), /<RecordManagementPage/);
  }
});
