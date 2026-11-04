// Keep technical image flags out of new and legacy AI review text.
export function cleanCredibilityReview(value: unknown): string {
  const text = typeof value === "string" ? value : "";
  const flags = /\b(?:MISSING_EXIF_DATA|MISSING_GPS_LOCATION|MISSING_TIMESTAMP|EDITED_WITH_SOFTWARE|FETCH_FAILED|ANALYSIS_ERROR|PHOTO_LOCATION_MISMATCH_[\w.]+|PHOTO_TOO_OLD_[\w.]+)\b/i;
  return text.split(/\r?\n/).filter(line => !/image authenticity flags\s*:|images:\s*no authenticity issues detected/i.test(line) && !flags.test(line))
    .join("\n").replace(/\n{3,}/g, "\n\n").trim() || "Manual review recommended.";
}
