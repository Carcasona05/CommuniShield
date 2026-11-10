import apiClient from "./apiClient";
import { sessionData } from "./sessionData";

// Bound both query-string size and concurrency when a compiled group contains
// many reports. Never send the next batch after logout or an account change.
export async function fetchAdminReportDetails(endpoint, config) {
  const ids = [...new Set(String(config.params.ids || "").split(",").filter(Boolean))];
  const epoch = sessionData.epoch();
  const reports = [];
  for (let offset = 0; offset < ids.length; offset += 50) {
    if (!sessionData.current(epoch)) throw Object.assign(new Error("The signed-in session changed."), { code: "ERR_CANCELED" });
    const response = await apiClient.get(endpoint, { ...config, params: { ids: ids.slice(offset, offset + 50).join(",") } });
    if (!Array.isArray(response.data?.reports)) throw new Error("Incomplete report details. Please retry.");
    reports.push(...response.data.reports);
  }
  const loaded = new Set(reports.map(report => report.id));
  if (ids.some(id => !loaded.has(id))) throw new Error("One or more reports are no longer available. Refresh the report list and try again.");
  return { data: { reports } };
}
