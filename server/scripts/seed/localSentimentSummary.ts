/** Local-only inference includes the built-in and the ONNX supporting cascade.
 * Gemini-assisted ensembles are deliberately excluded from local-only success.
 */
export type LocalSentimentResult = {
  status: string; provider: string; model: string; label: string; error_code?: string;
};
export type LocalSentimentOutcome = "succeeded" | "unavailable" | "pending" | "failed";
export function localSentimentOutcome(result: LocalSentimentResult): LocalSentimentOutcome {
  if (result.status === "pending") return "pending";
  if (result.status === "unavailable" || result.status === "skipped") return "unavailable";
  const localProvider = result.provider === "local" ||
    (result.provider === "ensemble" && /^cascade:(supporting|unclear)\|/.test(result.model));
  if (result.status !== "succeeded" || !localProvider || result.error_code) return "failed";
  return "succeeded";
}

export function createLocalSentimentSummary(total: number) {
  return { total, succeeded: 0, unavailable: 0, pending: 0, failed: 0,
    labels: {} as Record<string, number>,
    origins: { builtin: 0, supporting: 0, unresolved: 0 } };
}
export type LocalSentimentSummary = ReturnType<typeof createLocalSentimentSummary>;
export function recordLocalSentimentResult(summary: LocalSentimentSummary, result: LocalSentimentResult) {
  const outcome = localSentimentOutcome(result);
  summary[outcome]++;
  if (outcome === "succeeded") {
    summary.labels[result.label] = (summary.labels[result.label] || 0) + 1;
    if (result.model.startsWith("cascade:unclear|")) summary.origins.unresolved++;
    else if (result.model.startsWith("cascade:supporting|")) summary.origins.supporting++;
    else summary.origins.builtin++;
  }
  return outcome;
}
