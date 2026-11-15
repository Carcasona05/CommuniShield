import assert from "node:assert/strict";
import { test } from "node:test";
import { sentimentDistribution } from "../../clients/services/sentimentDistribution.js";
import { DISTRIBUTION_PERIODS, philippineDay } from "../../clients/services/sentimentDistribution.js";
import { readFileSync } from "node:fs";

test("distribution percentages exclude unclear and no-data without losing coverage", () => {
  const model = sentimentDistribution({ sentimentTotal: 130, sentimentDistribution: [
    { label: "positive", count: 50 }, { label: "neutral", count: 30 }, { label: "negative", count: 20 },
    { label: "unclear", count: 10 }, { label: "none", count: 20 },
  ] });
  assert.equal(model.usable, 100);
  assert.deepEqual(model.rows.map(row => row.percent), [50, 30, 20]);
  assert.equal(model.coverage[0].count, 10);
  assert.equal(model.coverage[1].count, 20);
});
test("mixed stays visible when present; empty results never fabricate full bars", () => {
  const model = sentimentDistribution({ sentimentDistribution: [{ label: "mixed", count: 5 }, { label: "positive", count: 5 }] });
  assert.equal(model.rows.find(row => row.key === "mixed").percent, 50);
  assert.ok(sentimentDistribution({}).rows.every(row => row.percent === 0));
});
test("precise status coverage uses authoritative buckets instead of calling all missing results pending", () => {
  const model = sentimentDistribution({ sentimentCoverage: { version: 1, unclear: 5, unavailable: 3, pending: 2, failed: 1, missing: 4 } });
  assert.deepEqual(model.coverage.map(row => row.count), [5, 3, 2, 1, 4]);
});
test("distribution offers the four requested periods and partitions cache dates by Philippine midnight", () => {
  assert.deepEqual(DISTRIBUTION_PERIODS.map(row => row.label), ["Today", "Past 7 Days", "Past 30 Days", "All Time"]);
  assert.equal(philippineDay(Date.parse("2026-11-12T15:59:59.999Z")), "2026-11-12");
  assert.equal(philippineDay(Date.parse("2026-11-12T16:00:00Z")), "2026-11-13");
});
test("filter is local to distribution and does not parameterize overview, trend or training", () => {
  const read = path => readFileSync(new URL(`../../clients/${path}`, import.meta.url), "utf8");
  const card = read("components/Admin_compo/SentimentDistributionCard.jsx");
  assert.match(card, /useState\("today"\)/);
  assert.match(card, /endpoint: "\/admin\/sentiment-distribution", params: \{ period, day \}/);
  assert.match(card, /loading \? <View testID="sentiment-distribution-loading"/);
  const page = read("app/(admin)/Admin_ince_Anaytics.jsx");
  assert.match(page, /<SentimentDistributionCard \/>/);
  assert.match(page, /<SentimentOverviewCard \/>/);
  assert.doesNotMatch(page, /params: \{ period|setPeriod|DISTRIBUTION_PERIODS/);
});
