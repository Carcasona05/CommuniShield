export const DISTRIBUTION_LABELS = [
  { key: "positive", title: "Positive", color: "#218052" },
  { key: "neutral", title: "Neutral", color: "#356EC0" },
  { key: "negative", title: "Negative", color: "#C44343" },
  { key: "mixed", title: "Mixed", color: "#8654AD" },
];
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
export function sentimentDistribution(summary) {
  const counts = new Map();
  for (const row of Array.isArray(summary?.sentimentDistribution) ? summary.sentimentDistribution : []) {
    counts.set(row.label, (counts.get(row.label) || 0) + count(row.count));
  }
  const usable = DISTRIBUTION_LABELS.reduce((sum, label) => sum + (counts.get(label.key) || 0), 0);
  const rows = DISTRIBUTION_LABELS.filter(label => label.key !== "mixed" || counts.get("mixed") > 0)
    .map(label => ({ ...label, count: counts.get(label.key) || 0,
      percent: usable ? (counts.get(label.key) || 0) / usable * 100 : 0 }));
  const coverage = summary?.sentimentCoverage;
  return { rows, usable, total: count(summary?.sentimentTotal),
    coverage: coverage?.version === 1 ? [
      ["Unclear", coverage.unclear], ["Unavailable", coverage.unavailable], ["Pending", coverage.pending],
      ["Failed", coverage.failed], ["Missing analysis", coverage.missing],
    ].map(([label, value]) => ({ label, count: count(value) })) : [
      { label: "Unclear", count: counts.get("unclear") || 0 },
      { label: "No usable result · status not provided", count: counts.get("none") || 0 },
    ] };
}
