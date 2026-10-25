const LABELS = [
  { key: "negative", title: "Negative", color: "#A63D40" },
  { key: "neutral", title: "Neutral", color: "#52667F" },
  { key: "positive", title: "Positive", color: "#21764D" },
  { key: "mixed", title: "Mixed", color: "#7555A2" },
  { key: "unclear", title: "Unclear", color: "#866B35" },
];

/**
 * Converts evidence counts/shares into chart segments.
 * Categories without usable analyses are omitted rather than drawn at zero,
 * widths always total 100%, and no share is invented when coverage is missing.
 */
export function sentimentSegments(source) {
  const usable = Number(source?.usable) || 0;
  if (!usable || !source?.counts) return [];
  const segments = LABELS
    .map((label) => {
      const count = Number(source.counts[label.key]) || 0;
      const share = Number(source.shares?.[label.key]);
      if (!count || !(share > 0)) return null;
      return { ...label, count, share, percent: Math.round(share * 100) };
    })
    .filter(Boolean);
  if (!segments.length) return [];
  const widths = segments.map((segment) => Math.max(3, Math.round(segment.share * 100)));
  const drift = 100 - widths.reduce((sum, width) => sum + width, 0);
  const largest = widths.indexOf(Math.max(...widths));
  widths[largest] = Math.max(1, widths[largest] + drift);
  return segments.map((segment, index) => ({ ...segment, widthPercent: widths[index] }));
}
