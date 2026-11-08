export type FeedCursor = { created_at: string; id: string; source?: "User" | "Admin" };

export function encodeFeedCursor(row: FeedCursor): string {
  return Buffer.from(JSON.stringify(row)).toString("base64url");
}

export function decodeFeedCursor(value: unknown): FeedCursor | null {
  if (value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > 512) throw new Error("Invalid pagination cursor");
  try {
    const row = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(row.created_at) || !Number.isFinite(Date.parse(row.created_at)) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id) ||
      (row.source !== undefined && !["User", "Admin"].includes(row.source))) throw new Error();
    // Preserve PostgreSQL microseconds: converting to JS ISO strings loses ties.
    return { created_at: row.created_at, id: row.id, ...(row.source ? { source: row.source } : {}) };
  } catch { throw new Error("Invalid pagination cursor"); }
}
