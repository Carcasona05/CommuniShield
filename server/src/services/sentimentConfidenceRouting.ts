/** User-selected raw-score policy. Scores across providers are NOT calibrated. */
export const MINIMUM_SENTIMENT_CONFIDENCE = 0.45;
export const HIGH_SENTIMENT_CONFIDENCE = 0.85;
export type ConfidenceLabel = "positive" | "neutral" | "negative" | "mixed" | "unclear";
export type ConfidenceSource = "builtin" | "supporting" | "gemini";
export type ConfidenceBand = "low" | "moderate" | "high" | "invalid";
export type ConfidenceCandidate = {
  id: string;
  source: ConfidenceSource;
  model: string;
  label: ConfidenceLabel;
  confidence: number | null;
  scores?: { negative: number; neutral: number; positive: number };
};
export type SentimentDecision = {
  policy: "raw-confidence-v1";
  minimumConfidence: number;
  highConfidence: number;
  reason: "highest_raw_confidence" | "below_minimum" | "conflicting_top_tie" | "no_candidates";
  winnerId: string | null;
  candidates: Array<ConfidenceCandidate & { band: ConfidenceBand; eligible: boolean }>;
};

export function confidenceBand(value: number | null): ConfidenceBand {
  if (value === null || !Number.isFinite(value) || value < 0 || value > 1) return "invalid";
  if (value < MINIMUM_SENTIMENT_CONFIDENCE) return "low";
  return value < HIGH_SENTIMENT_CONFIDENCE ? "moderate" : "high";
}

export function chooseRawConfidenceWinner(input: ConfidenceCandidate[]) {
  const candidates: SentimentDecision["candidates"] = input.map(candidate => {
    const band = confidenceBand(candidate.confidence);
    return {
      ...candidate,
      // Keep invalid scores explicitly unavailable, rather than clamp to 100%.
      confidence: band === "invalid" ? null : candidate.confidence,
      band,
      eligible: ["positive", "neutral", "negative", "mixed"].includes(candidate.label) &&
        (band === "moderate" || band === "high"),
    };
  });
  const eligible = candidates.filter(candidate => candidate.eligible)
    .sort((a, b) => b.confidence! - a.confidence! || a.id.localeCompare(b.id));
  const highest = eligible[0];
  const top = highest ? eligible.filter(candidate => candidate.confidence === highest.confidence) : [];
  const conflict = new Set(top.map(candidate => candidate.label)).size > 1;
  const winner = highest && !conflict ? highest : null;
  const decision: SentimentDecision = {
    policy: "raw-confidence-v1",
    minimumConfidence: MINIMUM_SENTIMENT_CONFIDENCE,
    highConfidence: HIGH_SENTIMENT_CONFIDENCE,
    reason: winner ? "highest_raw_confidence" : conflict ? "conflicting_top_tie" : candidates.length ? "below_minimum" : "no_candidates",
    winnerId: winner?.id ?? null,
    candidates,
  };
  return { label: winner?.label ?? "unclear" as ConfidenceLabel,
    confidence: winner?.confidence ?? 0, winner, decision };
}
