import { supabaseAdmin } from "../config/supabaseAdmin.js";
import type { HistoryReport } from "./riskOutlookService.js";
import { utcDay } from "./riskOutlookService.js";

export const riskOutlookHistory = {
  async load(now: number): Promise<{ data: HistoryReport[] | null; error: string | null }> {
    const end = utcDay(now);
    const rows: HistoryReport[] = [];
    let expectedCount: number | null = null;
    let offset = 0;
    // Explicit pagination, unlike the dashboard snapshot. Never return a
    // successful forecast based on an accidentally truncated first page.
    for (let page = 0; page < 50; page++) {
      const { data, error, count } = await supabaseAdmin.from("reports")
        .select("id, created_at, status, location, latitude, longitude", offset === 0 ? { count: "exact" } : undefined)
        .gte("created_at", new Date(end - 365 * 86400000).toISOString())
        .lt("created_at", new Date(end).toISOString())
        .neq("status", "Archived").neq("status", "Rejected").neq("status", "Marked Fake")
        .order("created_at", { ascending: true }).order("id", { ascending: true })
        .range(offset, offset + 999);
      if (error) return { data: null, error: error.message };
      if (offset === 0) {
        if (count === null || !Number.isInteger(count) || count < 0) return { data: null, error: "Unable to verify complete history count." };
        expectedCount = count;
      }
      rows.push(...(data || []));
      if (rows.length === expectedCount) return { data: rows, error: null };
      if (!data?.length || rows.length > expectedCount!) return { data: null, error: "History changed or was truncated during reading; no partial forecast was computed." };
      // Respect a database-configured page cap smaller than our requested size.
      offset += data.length;
    }
    return { data: null, error: "History exceeds the safe read limit; no partial forecast was computed." };
  },
};
