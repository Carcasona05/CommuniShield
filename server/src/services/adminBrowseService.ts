import { supabaseAdmin } from "../config/supabaseAdmin.js";

type BrowseCursor = { created_at: string; kind: string; id: string;
  priority?: { version: number; status_rank: number; severity_rank: number; sort_time: string } };
export type AdminBrowseFilters = { view: "records" | "logs" | "archived"; page: number; pageSize: number;
  from?: string; to?: string; status?: string; kind?: string; actorRole?: string; focusReport?: string; exportAll?: boolean;
  cursor?: BrowseCursor };
export function decodeBrowseCursor(value: string) {
  if (value.length > 512) throw new Error("Invalid record cursor");
  try {
    const row = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(row.created_at) || !Number.isFinite(Date.parse(row.created_at)) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id) || !["Incident", "Announcement", "Activity"].includes(row.kind)) throw new Error();
    if (row.priority !== undefined && (row.priority?.version !== 1 ||
      !Number.isInteger(row.priority.status_rank) || row.priority.status_rank < 0 || row.priority.status_rank > 7 ||
      !Number.isInteger(row.priority.severity_rank) || row.priority.severity_rank < 0 || row.priority.severity_rank > 4 ||
      typeof row.priority.sort_time !== "string" || !/^-?\d{1,15}(?:\.\d{1,6})?$/.test(row.priority.sort_time))) throw new Error();
    return { created_at: String(row.created_at), kind: String(row.kind), id: String(row.id),
      ...(row.priority ? { priority: row.priority } : {}) } as BrowseCursor;
  } catch { throw new Error("Invalid record cursor"); }
}
export async function loadAdminBrowsePage(filters: AdminBrowseFilters) {
  if (filters.view === "records" && filters.cursor && !filters.cursor.priority) throw new Error("Record order changed. Refresh the list before loading more.");
  const { data, error } = await supabaseAdmin.rpc("admin_browse_page", {
    p_view: filters.view, p_page: filters.page, p_page_size: filters.pageSize,
    p_from: filters.from || null, p_to: filters.to || null, p_status: filters.status || null,
    p_kind: filters.kind || null, p_actor_role: filters.actorRole || null,
    p_focus_report: filters.focusReport || null, p_export: Boolean(filters.exportAll),
    p_before_time: filters.cursor?.created_at || null, p_before_kind: filters.cursor?.kind || null, p_before_id: filters.cursor?.id || null,
    p_before_sort: filters.view === "records" ? filters.cursor?.priority || null : null,
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") throw new Error("Record browsing requires the updated admin_view_more.sql database migration.");
    throw new Error(error.message);
  }
  if (!data || !Array.isArray(data.items) || !Number.isFinite(data.total) || typeof data.hasMore !== "boolean" || !data.stats) {
    throw new Error("Complete record page unavailable. Please retry.");
  }
  if (data.hasMore && !data.cursor) throw new Error("Incomplete record cursor. Please retry.");
  if (filters.view === "records" && !filters.exportAll && data.hasMore && !data.cursor?.priority) throw new Error("Apply the updated admin_view_more.sql before browsing reports.");
  const nextCursor = data.hasMore ? Buffer.from(JSON.stringify(data.cursor)).toString("base64url") : null;
  return { ...data, nextCursor };
}
