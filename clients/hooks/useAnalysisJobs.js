import { useCallback, useEffect, useRef, useState } from "react";
import apiClient from "../services/apiClient";
import { sessionData } from "../services/sessionData";
import { getCache, setCache } from "../services/dataStore";
import useSessionEpoch from "./useSessionEpoch";
import useAutoRefresh from "./useAutoRefresh";

const active = batch => ["queued", "running"].includes(batch.state);
const CACHE_KEY = "admin-analysis-batches";
const retain = batches => [...batches.filter(active), ...batches.filter(batch => !active(batch)).slice(-3)];
export default function useAnalysisJobs() {
  const epoch = useSessionEpoch();
  const [batches, setBatches] = useState(() => getCache(CACHE_KEY) || []);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const current = useRef({ epoch, mounted: true });
  current.current.epoch = epoch;
  const rows = useRef(batches); rows.current = batches;
  const pending = useRef(false);
  const recovered = useRef(null);
  const submittingRef = useRef(false);
  const valid = useCallback(() => current.current.mounted && sessionData.current(epoch) && current.current.epoch === epoch, [epoch]);
  useEffect(() => {
    current.current.mounted = true;
    rows.current = getCache(CACHE_KEY) || [];
    setBatches(rows.current);
    setError("");
    return () => { current.current.mounted = false; };
  }, [epoch]);
  const save = useCallback(next => {
    if (!valid()) return;
    rows.current = next; setBatches(next); setCache(CACHE_KEY, next);
  }, [valid]);
  const poll = useCallback(async () => {
    if (pending.current || !valid() || sessionData.changing()) return;
    pending.current = true;
    try {
      let previous = rows.current;
      if (recovered.current !== epoch) {
        const response = await apiClient.get("/ai/analysis-jobs/active", { cacheMode: "no-store", background: true });
        if (!valid()) return;
        if (!Array.isArray(response.data?.batches)) throw new Error("Incomplete analysis progress");
        const known = new Set(previous.map(row => row.id));
        previous = [...previous, ...response.data.batches.filter(row => !known.has(row.id))];
        recovered.current = epoch;
      }
      const next = await Promise.all(previous.map(async batch => {
        if (!active(batch)) return batch;
        const { data } = await apiClient.get(`/ai/analysis-jobs/${batch.id}`, { cacheMode: "no-store", background: true });
        if (!data?.id || !Number.isFinite(data.total) || !Number.isFinite(data.done) || !Array.isArray(data.reports) ||
          !["queued", "running", "succeeded", "failed", "partial"].includes(data.state)) throw new Error("Incomplete analysis progress");
        return data;
      }));
      if (!valid()) return;
      // A queue request may finish while a progress poll is in flight.
      const known = new Set(next.map(row => row.id));
      save(retain([...next, ...rows.current.filter(row => !known.has(row.id))]));
      setError("");
      if (next.some((row, index) => !active(row) && active(previous[index]))) {
        sessionData.invalidate({ paths: ["/admin/report-details", "/admin/validation-groups", "/admin/overview", "/admin/analytics", "/admin/sentiment-distribution", "/admin/sentiment-overview", "/admin/clusters", "/admin/risk-outlook", "/admin/logs", "/admin/browse"], preserveProfile: true });
      }
    } catch (error) { if (valid()) setError(error.response?.data?.error || error.message || "Could not check analysis progress"); }
    finally { pending.current = false; }
  }, [epoch, valid, save]);
  useAutoRefresh(poll, 5000, { minimumInterval: 5000 });
  const enqueue = async reportIds => {
    if (submittingRef.current) return;
    submittingRef.current = true; setSubmitting(true);
    try {
      const ids = [...new Set(reportIds)];
      for (let offset = 0; offset < ids.length; offset += 50) {
        if (!valid()) return;
        const selected = ids.slice(offset, offset + 50);
        const { data } = await apiClient.post("/ai/analysis-jobs", { reportIds: selected });
        if (!valid()) return;
        if (!data?.batchId) throw new Error("Analysis was not queued");
        save(retain([...rows.current, { id: data.batchId, state: "queued", total: null, done: 0, reports: selected.map(id => ({ id })) }]));
      }
      setError("");
    } finally { submittingRef.current = false; if (valid()) setSubmitting(false); }
  };
  return { batches, error, submitting, enqueue, retry: poll,
    forReports: ids => batches.filter(batch => batch.reports?.some(row => ids.includes(row.id))),
    isActive: ids => batches.some(batch => active(batch) && batch.reports?.some(row => ids.includes(row.id))) };
}
