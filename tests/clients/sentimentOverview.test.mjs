import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { bucketSentiments, sentimentBucketLabel, sentimentOverviewMetrics, smoothSentimentSeries, validSentimentOverview } from "../../clients/services/sentimentOverview.js";
const bucket = { start: "2026-11-12T16:00:00Z", end: "2026-11-12T17:00:00Z", total: 5, usable: 3, unclear: 1, withoutResult: 1,
  counts: { positive: 1, neutral: 0, negative: 2, mixed: 0 } };
test("chart displays real proportions while missing-data intervals remain gaps", () => {
  const rows = bucketSentiments(bucket);
  assert.ok(Math.abs(rows[0].percent - 100 / 3) < 1e-10); assert.ok(Math.abs(rows[2].percent - 200 / 3) < 1e-10);
  assert.ok(bucketSentiments({ counts: {} }).every(row => row.percent === null));
  assert.match(sentimentBucketLabel(bucket, "hour"), /00:00/);
  assert.match(sentimentBucketLabel(bucket, "day", true), /13/);
});
test("overview validates period and count consistency before displaying totals", () => {
  const data = { period: "today", summary: { sentimentTotal: 5, sentimentAnalyzed: 4, reportCount: 2, commentCount: 3, sentimentDistribution: [] },
    trend: { interval: "hour", buckets: [bucket] } };
  assert.equal(validSentimentOverview(data, "today"), true);
  assert.equal(validSentimentOverview(data, "30d"), false);
  assert.equal(validSentimentOverview({ ...data, summary: { ...data.summary, reportCount: 7 } }, "today"), false);
  assert.equal(validSentimentOverview({ ...data, trend: { interval: "hour", buckets: [{ ...bucket, usable: 10 }] } }, "today"), false);
});
test("overview excludes unclear from both totals and uses the graph's three classes for positive share", () => {
  const trend = { buckets: [{ counts: { positive: 6, neutral: 3, negative: 1, mixed: 0 }, unclear: 1, withoutResult: 0 }] };
  assert.deepEqual(sentimentOverviewMetrics(trend), { total: 10, analyzed: 10, withoutResult: 0, positiveShare: 60 });
  assert.deepEqual(sentimentOverviewMetrics({ buckets: [{ ...trend.buckets[0], withoutResult: 2, counts: { ...trend.buckets[0].counts, mixed: 4 } }] }),
    { total: 12, analyzed: 10, withoutResult: 2, positiveShare: 60 });
  assert.deepEqual(sentimentOverviewMetrics({ buckets: [{ counts: {}, unclear: 11, withoutResult: 0 }] }),
    { total: 0, analyzed: 0, withoutResult: 0, positiveShare: null });
  assert.deepEqual(sentimentOverviewMetrics(), { total: 0, analyzed: 0, withoutResult: 0, positiveShare: null });
  assert.equal(sentimentOverviewMetrics({ buckets: [bucket, bucket] }).analyzed, 6);
  const source = readFileSync(new URL("../../clients/components/Admin_compo/SentimentOverviewCard.jsx", import.meta.url), "utf8");
  assert.match(source, /\{overview.analyzed\}\/\{overview.total\} Analyzed/);
  assert.doesNotMatch(source, /including unclear results|summary\.sentimentAnalyzed\.toLocaleString/);
});
test("graph excludes aggregate tie labels from counts, percentages and line balance", () => {
  const counts = { positive: 6, neutral: 2, negative: 2, mixed: 10 };
  const rows = bucketSentiments({ counts });
  assert.deepEqual(rows.map(row => row.key), ["positive", "neutral", "negative"]);
  assert.deepEqual(rows.map(row => row.percent), [60, 20, 20]);
  const point = smoothSentimentSeries([{ counts }])[0].points[0];
  assert.equal(point.y, smoothSentimentSeries([{ counts: { ...counts, mixed: 0 } }])[0].points[0].y);
  assert.deepEqual(smoothSentimentSeries([{ counts: { mixed: 10 } }]), []);
  const source = readFileSync(new URL("../../clients/components/Admin_compo/SentimentTrendChart.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /mixed|Mixed/);
});
test("overview owns its filter and replaces the misleading health metric and hardcoded graph", () => {
  const source = readFileSync(new URL("../../clients/components/Admin_compo/SentimentOverviewCard.jsx", import.meta.url), "utf8");
  assert.match(source, /useState\("today"\)/);
  assert.match(source, /endpoint: "\/admin\/sentiment-overview", params: \{ period, day \}/);
  assert.match(source, /Positive Sentiment/); assert.doesNotMatch(source, /Avg\. Health|Anxious|Calm|\/ 5\.0/);
  assert.match(source, /<SentimentTrendChart key=\{period\} trend=\{data.trend\}/);
});
test("overview preserves the original compact single-row banner instead of metric tiles", () => {
  const source = readFileSync(new URL("../../clients/components/Admin_compo/SentimentOverviewCard.jsx", import.meta.url), "utf8");
  assert.match(source, /metrics: \{ flexDirection: "row", alignItems: "center", backgroundColor: "#F4F7FC"/);
  assert.match(source, /divider: \{ width: 1, height: 24/);
  assert.match(source, /value: \{ fontFamily: "PoppinsSemiBold", fontSize: 14/);
  assert.doesNotMatch(source, /flexBasis: "45%"|metricHeading|fontSize: 24/);
});
test("smooth line keeps original direction, uses curves and does not connect missing-data intervals", () => {
  const point = counts => ({ counts });
  const segments = smoothSentimentSeries([
    point({ positive: 10 }), point({ neutral: 10 }), point({ negative: 10 }), point({}), point({ positive: 5, negative: 5 }),
  ]);
  assert.equal(segments.length, 2);
  assert.equal(segments[0].points[0].y, 192, "Positive results are at the bottom");
  assert.equal(segments[0].points[1].y, 100, "Neutral results are centered");
  assert.equal(segments[0].points[2].y, 8, "Negative results are at the top");
  assert.equal(segments[1].points[0].y, 100, "Equal positive and negative results balance at center");
  assert.match(segments[0].path, / C /);
  assert.equal(segments[1].points.length, 1);
  assert.equal(smoothSentimentSeries([point({})]).length, 0);
});
test("line chart fits its container and uses an animated, motion-aware hover tooltip", () => {
  const source = readFileSync(new URL("../../clients/components/Admin_compo/SentimentTrendChart.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /ScrollView|showsHorizontalScrollIndicator|buckets\.length \* 22/);
  assert.match(source, /testID="sentiment-trend-tooltip"/);
  assert.match(source, /onHoverIn=\{\(\) => setSelected\(index\)\}/);
  assert.match(source, /onHoverOut=\{\(\) => setSelected\(null\)\}/);
  assert.match(source, /Animated\.timing/);
  assert.match(source, /AccessibilityInfo\.isReduceMotionEnabled/);
  assert.match(source, /"Negative"[\s\S]*?"Neutral"[\s\S]*?"Positive"/);
});
