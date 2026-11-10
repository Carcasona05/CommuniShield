import useRetainedApiQuery from "./useRetainedApiQuery";
import { fetchAdminReportDetails } from "../services/adminReportDetails";

const validDetails = data => Array.isArray(data?.reports);
export default function useAdminReportDetails(ids, enabled = true) {
  const selected = [...new Set(ids.filter(Boolean))].sort().join(",");
  return useRetainedApiQuery({ endpoint: "/admin/report-details", params: { ids: selected }, validate: validDetails,
    enabled: enabled && Boolean(selected), fetcher: fetchAdminReportDetails });
}
