import { DISTRIBUTION_LABELS } from "./sentimentDistribution.js";

// The graph plots individual classifications, not aggregate tie labels.
const GRAPH_LABELS = DISTRIBUTION_LABELS.filter(label => ["positive", "neutral", "negative"].includes(label.key));
const integer = value => Number.isSafeInteger(value) && value >= 0;
export function validSentimentOverview(data, period) {
  const summary = data?.summary;
  return data?.period === period && integer(summary?.sentimentTotal) && integer(summary?.sentimentAnalyzed) &&
    integer(summary?.reportCount) && integer(summary?.commentCount) && summary.reportCount + summary.commentCount === summary.sentimentTotal &&
    summary.sentimentAnalyzed <= summary.sentimentTotal && Array.isArray(summary?.sentimentDistribution) &&
    Array.isArray(data?.trend?.buckets) && ["hour", "day", "month"].includes(data?.trend?.interval) &&
    data.trend.buckets.every(bucket => Number.isFinite(Date.parse(bucket.start)) && Number.isFinite(Date.parse(bucket.end)) &&
      integer(bucket.total) && integer(bucket.usable) && integer(bucket.unclear) && integer(bucket.withoutResult) &&
      DISTRIBUTION_LABELS.every(label => integer(bucket.counts?.[label.key])) &&
      DISTRIBUTION_LABELS.reduce((sum, label) => sum + bucket.counts[label.key], 0) === bucket.usable &&
      bucket.total === bucket.usable + bucket.unclear + bucket.withoutResult);
}
export function bucketSentiments(bucket) {
  const usable = GRAPH_LABELS.reduce((sum, label) => sum + (bucket.counts?.[label.key] || 0), 0);
  return GRAPH_LABELS.map(label => ({ ...label, count: bucket.counts?.[label.key] || 0,
    percent: usable ? (bucket.counts?.[label.key] || 0) / usable * 100 : null }));
}
// Use the exact same classified subjects as the graph. Unclear and aggregate
// tie labels stay outside this overview; unsuccessful records remain separate.
export function sentimentOverviewMetrics(trend) {
  let analyzed = 0, positive = 0, withoutResult = 0;
  for (const bucket of trend?.buckets || []) {
    if (bucket.future) continue;
    const rows = bucketSentiments(bucket);
    analyzed += rows.reduce((sum, row) => sum + row.count, 0);
    positive += rows.find(row => row.key === "positive").count;
    withoutResult += bucket.withoutResult;
  }
  return { total: analyzed + withoutResult, analyzed, withoutResult,
    positiveShare: analyzed ? positive / analyzed * 100 : null };
}
// A positive/negative balance, not an anxiety, health or safety rating.
// Neutral contributes to the denominator but does not tilt the line.
export function smoothSentimentSeries(buckets, width = 800, height = 200) {
  const segments = [];
  let points = [];
  const finish = () => {
    if (!points.length) return;
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], previous = points[i - 2] || a, next = points[i + 1] || b;
      const clamp = value => Math.max(Math.min(a.y, b.y), Math.min(Math.max(a.y, b.y), value));
      const dx = (b.x - a.x) / 3;
      path += ` C ${a.x + dx} ${clamp(a.y + (b.y - previous.y) / 6)} ${b.x - dx} ${clamp(b.y - (next.y - a.y) / 6)} ${b.x} ${b.y}`;
    }
    segments.push({ points, path, area: `${path} L ${points.at(-1).x} ${height - 8} L ${points[0].x} ${height - 8} Z` });
    points = [];
  };
  buckets.forEach((bucket, index) => {
    const rows = bucketSentiments(bucket), usable = rows.reduce((sum, row) => sum + row.count, 0);
    if (!usable || bucket.future) { finish(); return; }
    const balance = ((bucket.counts?.negative || 0) - (bucket.counts?.positive || 0)) / usable;
    points.push({ index, x: (index + 0.5) / buckets.length * width, y: 8 + (1 - balance) / 2 * (height - 16) });
  });
  finish();
  return segments;
}
export function sentimentBucketLabel(bucket, interval, full = false) {
  const start = new Date(bucket.start);
  const options = { timeZone: "Asia/Manila" };
  if (interval === "hour") return start.toLocaleString("en-PH", { ...options, ...(full ? { month: "short", day: "numeric" } : {}), hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  if (interval === "day") return start.toLocaleDateString("en-PH", { ...options, month: "short", day: "numeric", ...(full ? { year: "numeric" } : {}) });
  const format = date => date.toLocaleDateString("en-PH", { ...options, month: "short", year: "numeric" });
  const end = new Date(Date.parse(bucket.end) - 1);
  return format(start) === format(end) ? format(start) : `${format(start)}–${format(end)}`;
}
