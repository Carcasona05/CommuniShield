/** Read-only aggregation of already-stored sentiment; never calls an AI model,
 * changes cluster membership, or treats negative emotion as proof of danger. */
export const HOTSPOT_SENTIMENT_MIN_CONFIDENCE = 0.7;
const labels = ["negative", "neutral", "positive", "mixed", "unclear"] as const;
const languages = ["english", "filipino", "cebuano"] as const;
type Label = typeof labels[number];
type Language = typeof languages[number];
type Evidence = {
  sentiment?: unknown;
  sentiment_status?: unknown;
  sentiment_confidence?: unknown;
  sentiment_language?: unknown;
  sentiment_error?: unknown;
  sentiment_provider?: unknown;
  sentiment_model?: unknown;
};
export type HotspotEvidenceReport = Evidence & {
  id: string;
  created_at?: string | null;
  status?: string | null;
  is_verified?: unknown;
  comments?: unknown;
};
type Comment = Evidence & { id?: unknown; datePosted?: unknown };
const normalized = (value: unknown) => String(value ?? "").trim().toLowerCase();
const counts = () => ({ negative: 0, neutral: 0, positive: 0, mixed: 0, unclear: 0 });
const languageCounts = () => ({ english: 0, filipino: 0, cebuano: 0 });
const zeroExclusions = () => ({ unavailable: 0, invalidConfidence: 0, lowConfidence: 0, unsupportedLanguage: 0, outsideWindow: 0 });

function inspect(row: Evidence): { label: Label; language: Language } | { excluded: keyof ReturnType<typeof zeroExclusions> } {
  if (normalized(row.sentiment_status) !== "succeeded" || normalized(row.sentiment_error) || !labels.includes(normalized(row.sentiment) as Label)) return { excluded: "unavailable" };
  const value = row.sentiment_confidence;
  if (!(typeof value === "number" || typeof value === "string" && value.trim() !== "") || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 1) return { excluded: "invalidConfidence" };
  if (Number(value) < HOTSPOT_SENTIMENT_MIN_CONFIDENCE) return { excluded: "lowConfidence" };
  if (!languages.includes(normalized(row.sentiment_language) as Language)) return { excluded: "unsupportedLanguage" };
  return { label: normalized(row.sentiment) as Label, language: normalized(row.sentiment_language) as Language };
}

export function summarizeHotspotEvidence(input: HotspotEvidenceReport[], options: { now: number; windowDays: number | null }) {
  const { now, windowDays } = options;
  const earliest = windowDays === null ? -Infinity : now - windowDays * 86400000;
  const inWindow = (value: unknown) => {
    const timestamp = typeof value === "string" ? Date.parse(value) : NaN;
    return Number.isFinite(timestamp) && timestamp >= earliest && timestamp <= now;
  };
  const reports = [...new Map(input.map((row) => [row.id, row])).values()];
  const reportCounts = counts();
  const reportLanguages = languageCounts();
  const reportExclusions = zeroExclusions();
  const commentCounts = counts();
  const commentLanguages = languageCounts();
  const commentExclusions = zeroExclusions();
  const commentShares = counts();
  const verification = { verified: 0, pendingReview: 0, underVerification: 0, other: 0 };
  const models = new Set<string>();
  const providers = new Set<string>();
  const recent = { reports: 0, usable: 0, negative: 0 };
  const previous = { reports: 0, usable: 0, negative: 0 };
  let usableReports = 0;
  let totalComments = 0;
  let usableComments = 0;
  let reportsWithUsableComments = 0;
  let missingCommentIds = 0;
  const seenComments = new Set<string>();
  const recordProvenance = (row: Evidence) => {
    if (typeof row.sentiment_model === "string" && row.sentiment_model.trim() && row.sentiment_model !== "none") models.add(row.sentiment_model);
    if (typeof row.sentiment_provider === "string" && row.sentiment_provider.trim() && row.sentiment_provider !== "none") providers.add(row.sentiment_provider);
  };
  for (const report of reports) {
    const status = normalized(report.status);
    if (report.is_verified === true || status === "resolved") verification.verified++;
    else if (status === "pending review") verification.pendingReview++;
    else if (status === "under verification") verification.underVerification++;
    else verification.other++;
    const age = now - Date.parse(report.created_at || "");
    const bucket = age >= 0 && age < 7 * 86400000 ? recent : age >= 7 * 86400000 && age < 14 * 86400000 ? previous : null;
    if (bucket) bucket.reports++;
    const evidence = inWindow(report.created_at) ? inspect(report) : { excluded: "outsideWindow" as const };
    if ("excluded" in evidence) reportExclusions[evidence.excluded]++;
    else {
      usableReports++;
      reportCounts[evidence.label]++;
      reportLanguages[evidence.language]++;
      recordProvenance(report);
      if (bucket) { bucket.usable++; if (evidence.label === "negative") bucket.negative++; }
    }
    const localCounts = counts();
    let localUsable = 0;
    for (const item of Array.isArray(report.comments) ? report.comments : []) {
      if (!item || typeof item !== "object") continue;
      const comment = item as Comment;
      if (typeof comment.id !== "string" || !comment.id.trim()) { missingCommentIds++; continue; }
      if (seenComments.has(comment.id)) continue;
      seenComments.add(comment.id);
      totalComments++;
      const commentEvidence = inWindow(comment.datePosted) ? inspect(comment) : { excluded: "outsideWindow" as const };
      if ("excluded" in commentEvidence) commentExclusions[commentEvidence.excluded]++;
      else {
        usableComments++; localUsable++;
        localCounts[commentEvidence.label]++;
        commentCounts[commentEvidence.label]++;
        commentLanguages[commentEvidence.language]++;
        recordProvenance(comment);
      }
    }
    if (localUsable) {
      reportsWithUsableComments++;
      for (const label of labels) commentShares[label] += localCounts[label] / localUsable;
    }
  }
  const shares = (values: ReturnType<typeof counts>, denominator: number) => Object.fromEntries(labels.map((label) => [label, denominator ? values[label] / denominator : null])) as Record<Label, number | null>;
  const comparableWindow = windowDays === null || windowDays >= 14;
  const enoughSentiment = comparableWindow && recent.usable >= 3 && previous.usable >= 3;
  const negativeShareChangePoints = enoughSentiment ? 100 * (recent.negative / recent.usable - previous.negative / previous.usable) : null;
  return {
    policy: { minimumConfidence: HOTSPOT_SENTIMENT_MIN_CONFIDENCE, confidenceIsAccuracy: false, commentsWeighting: "equal-per-report", comparisonDays: 7, minimumUsablePerComparison: 3 },
    reports: { total: reports.length, usable: usableReports, counts: reportCounts, shares: shares(reportCounts, usableReports), languages: reportLanguages, excluded: reportExclusions },
    comments: { total: totalComments, usable: usableComments, reportsWithUsableComments, counts: commentCounts, shares: shares(commentShares, reportsWithUsableComments), languages: commentLanguages, excluded: commentExclusions, missingIds: missingCommentIds },
    verification,
    activity: {
      recent, previous, comparableWindow,
      countTrend: !comparableWindow || previous.reports < 2 || recent.reports < 2 ? "insufficient_data" : recent.reports > previous.reports ? "rising" : recent.reports < previous.reports ? "falling" : "stable",
      sentimentTrend: negativeShareChangePoints === null ? "insufficient_data" : negativeShareChangePoints > 5 ? "more_negative" : negativeShareChangePoints < -5 ? "less_negative" : "similar",
      negativeShareChangePoints,
      scope: "Current active cluster members only, not a reconstruction of past hotspot boundaries or all historical incidents.",
    },
    provenance: { models: [...models].sort(), providers: [...providers].sort() },
    note: "Sentiment context only, not evidence of danger or a future-risk probability. Confidence threshold and trend rules are provisional. Unknown-language/failed/low-confidence analyses are excluded, never filled as neutral.",
  };
}
