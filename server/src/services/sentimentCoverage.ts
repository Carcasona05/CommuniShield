type Analysis = { status?: string; label?: string } | null | undefined;

export function sentimentCoverage(analyses: Analysis[]) {
  const result = { version: 1, total: analyses.length, usable: 0, unclear: 0, unavailable: 0, pending: 0, failed: 0, missing: 0 };
  for (const row of analyses) {
    if (!row) result.missing++;
    else if (row.status === "pending") result.pending++;
    else if (row.status === "failed") result.failed++;
    else if (row.status === "succeeded" && ["positive", "neutral", "negative", "mixed"].includes(row.label || "")) result.usable++;
    else if (row.status === "succeeded" && row.label === "unclear") result.unclear++;
    else result.unavailable++;
  }
  return result;
}
