import assert from "node:assert/strict";
import { test } from "node:test";
import { sentimentSegments } from "../services/sentimentChart.js";

const source = (counts, shares, usable = Object.values(counts).reduce((sum, count) => sum + count, 0)) => ({ usable, total: usable, counts, shares });

test("segments are ordered, omit empty labels and total exactly 100% of width", () => {
  const segments = sentimentSegments(source(
    { negative: 17, neutral: 9, positive: 8, mixed: 0, unclear: 0 },
    { negative: 17 / 34, neutral: 9 / 34, positive: 8 / 34, mixed: 0, unclear: 0 }
  ));
  assert.deepEqual(segments.map((segment) => segment.key), ["negative", "neutral", "positive"]);
  assert.deepEqual(segments.map((segment) => segment.percent), [50, 26, 24]);
  assert.equal(segments.reduce((sum, segment) => sum + segment.widthPercent, 0), 100);
  assert.equal(segments[0].widthPercent, 50);
});

test("tiny shares keep a visible minimum width and the remainder is absorbed once", () => {
  const segments = sentimentSegments(source(
    { negative: 999, neutral: 0, positive: 1, mixed: 0, unclear: 0 },
    { negative: 0.999, neutral: 0, positive: 0.001, mixed: 0, unclear: 0 }
  ));
  assert.equal(segments.length, 2);
  assert.equal(segments[1].widthPercent, 3, "a single usable analysis must not vanish from the bar");
  assert.equal(segments.reduce((sum, segment) => sum + segment.widthPercent, 0), 100);
});

test("no usable analyses never fabricate a full-width bar", () => {
  assert.deepEqual(sentimentSegments(source({ negative: 0, neutral: 0, positive: 0, mixed: 0, unclear: 0 }, {})), []);
  assert.deepEqual(sentimentSegments({ usable: 0, counts: { negative: 3 }, shares: { negative: 1 } }), []);
  assert.deepEqual(sentimentSegments(source({ negative: 3, neutral: 0, positive: 0, mixed: 0, unclear: 0 }, {})), [], "counts without shares are not charted");
  assert.deepEqual(sentimentSegments(undefined), []);
});

test("counts and shares disagreeing with usable coverage still chart only real evidence", () => {
  const segments = sentimentSegments(source(
    { negative: 2, neutral: 0, positive: 1, mixed: 0, unclear: 0 },
    { negative: 2 / 3, neutral: 0, positive: 1 / 3, mixed: 0, unclear: 0 },
    3
  ));
  assert.deepEqual(segments.map((segment) => segment.count), [2, 1]);
  assert.equal(segments.reduce((sum, segment) => sum + segment.widthPercent, 0), 100);
});
