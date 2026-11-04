const CLEAR_LABELS = new Set(["positive", "neutral", "negative", "mixed"]);
const normalized = (value) => typeof value === "string" ? value.trim().toLowerCase() : "";

// A succeeded analysis can still abstain with "unclear". Missing/invalid labels
// and any non-success status are also unusable, even if an old label remains.
export function needsCommentSentimentReanalysis(comment) {
  if (!comment || typeof comment.id !== "string" || !comment.id.trim()) return false;
  return normalized(comment.sentiment_status) !== "succeeded"
    || !CLEAR_LABELS.has(normalized(comment.sentiment))
    || Boolean(normalized(comment.sentiment_error));
}

export function getSentimentRetryCommentIds(reports) {
  const ids = new Set();
  for (const report of Array.isArray(reports) ? reports : []) {
    for (const comment of Array.isArray(report?.comments) ? report.comments : []) {
      if (needsCommentSentimentReanalysis(comment)) ids.add(comment.id.trim());
    }
  }
  return [...ids];
}
