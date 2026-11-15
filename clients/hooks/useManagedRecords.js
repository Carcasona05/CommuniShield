import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useViewMoreQuery from "./useViewMoreQuery";
import useAutoRefresh from "./useAutoRefresh";
import apiClient from "../services/apiClient";
import localBlotterStore from "../services/localBlotterStore";
import { sessionData } from "../services/sessionData";
import { compareRecords, localBlotterRecord, matchesRecordFilters, recordFilters, validBrowsePage } from "../services/adminBrowsing";

export default function useManagedRecords(filters) {
  const params = recordFilters(filters);
  const key = `${sessionData.epoch()}:${JSON.stringify(params)}`;
  const query = useViewMoreQuery({ endpoint: "/admin/browse", params, validate: validBrowsePage });
  const [blotters, setBlotters] = useState([]);
  const [localLoaded, setLocalLoaded] = useState(false);
  const [localError, setLocalError] = useState("");
  const [visibility, setVisibility] = useState({ key, count: 10 });
  const visibleCount = visibility.key === key ? visibility.count : 10;
  const current = useRef(key); current.current = key;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; current.current = null; }; }, []);
  const loadLocal = useCallback(async () => {
    const epoch = sessionData.epoch();
    try {
      const records = await localBlotterStore.list();
      if (!mounted.current || !sessionData.current(epoch)) return;
      setBlotters(records); setLocalLoaded(true); setLocalError("");
    } catch (error) { if (mounted.current && sessionData.current(epoch)) setLocalError(error.message || "Local blotters could not be loaded."); }
  }, []);
  useAutoRefresh(loadLocal, 60000);
  const localRecords = useMemo(() => blotters.map(localBlotterRecord).filter(record => matchesRecordFilters(record, params)), [blotters, key]);
  const combined = useMemo(() => [...query.items, ...localRecords].sort(compareRecords), [query.items, localRecords]);
  const loadMore = async () => {
    if (query.refreshing) return;
    if (query.hasMore && !await query.loadMore()) return;
    if (mounted.current && current.current === key) setVisibility({ key, count: visibleCount + 10 });
  };
  const exportRecords = async () => {
    const epoch = sessionData.epoch();
    const [response, local] = await Promise.all([
      apiClient.get("/admin/browse", { params: { ...params, exportAll: "1" }, cacheMode: "no-store" }), localBlotterStore.list(),
    ]);
    if (!sessionData.current(epoch)) throw Object.assign(new Error("The signed-in session changed."), { code: "ERR_CANCELED" });
    if (!validBrowsePage(response.data)) throw new Error("Incomplete export data. Please retry.");
    return [...response.data.items, ...local.map(localBlotterRecord).filter(record => matchesRecordFilters(record, params))].sort(compareRecords);
  };
  return { ...query, blotters, setBlotters, filteredRecords: combined, displayedRecords: combined.slice(0, visibleCount),
    totalRecords: query.data && localLoaded ? query.data.total + localRecords.length : "—",
    metrics: query.data && localLoaded ? { ...query.data.stats, reports: query.data.stats.reports + localRecords.length } : null,
    hasMore: query.hasMore || combined.length > visibleCount, loadMore, exportRecords,
    loading: query.loading || (!localLoaded && !localError), errorMessage: [query.errorMessage, localError].filter(Boolean).join(" "),
    loadRecords: async () => { await loadLocal(); return query.reload(); } };
}
