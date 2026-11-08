import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import apiClient from "../services/apiClient";
import { ensureCompleteProfile } from "../services/profileCompletion";
import { patchCachedReports } from "../services/dataStore";
import { mergeComments } from "../services/pagination";
import { triggerRefresh } from "../services/refreshBus";

export default function usePaginatedComments(reportId, initialTotal, toast) {
  const [comments, setComments] = useState([]);
  const [total, setTotal] = useState(initialTotal || 0);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);
  const currentId = useRef(reportId);
  currentId.current = reportId;
  const generation = useRef(0);
  const moreBusy = useRef(false);
  const sendBusy = useRef(false);
  const initialBusy = useRef(true);
  const rowsRef = useRef(comments);
  rowsRef.current = comments;

  const fetchPage = useCallback(async (before = null) => {
    const ticket = generation.current;
    const valid = () => currentId.current === reportId && generation.current === ticket;
    if (before && moreBusy.current) return;
    if (before) { moreBusy.current = true; setLoadingMore(true); }
    else { initialBusy.current = true; setLoading(true); }
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token || !valid()) return;
      const { data } = await apiClient.get(`/reports/${reportId}/comments`, {
        params: before ? { cursor: before } : {},
        cacheMode: "network", headers: { Authorization: `Bearer ${token}` },
      });
      const currentToken = await AsyncStorage.getItem("access_token");
      if (!valid() || token !== currentToken) return;
      setComments(previous => before ? mergeComments(data.comments || [], previous) : data.comments || []);
      setTotal(data.total);
      setCursor(data.nextCursor);
      setHasMore(data.hasMore);
      setError("");
      patchCachedReports(reportId, row => ({ ...row, comments: data.total }));
      return true;
    } catch (error) {
      if (valid() && error.code !== "ERR_CANCELED") setError("Could not load comments. Tap to retry.");
    } finally {
      if (valid()) { initialBusy.current = false; moreBusy.current = false; setLoading(false); setLoadingMore(false); }
    }
  }, [reportId]);

  useEffect(() => {
    generation.current++;
    moreBusy.current = false;
    sendBusy.current = false;
    setComments([]); setCommentText(""); setTotal(initialTotal || 0);
    setCursor(null); setHasMore(false); setError(""); setSending(false); setLoadingMore(false);
    if (reportId) void fetchPage();
    return () => { generation.current++; };
    // initialTotal is only a placeholder; authoritative totals come from the API.
  }, [reportId, fetchPage]);

  // Poll ONLY pending analysis metadata for loaded comments, never the thread.
  useFocusEffect(useCallback(() => {
    let active = true, busy = false, next = 0;
    const ticket = generation.current;
    const poll = async () => {
      if (AppState.currentState === "background" || AppState.currentState === "inactive" || (typeof document !== "undefined" && document.visibilityState === "hidden")) return;
      const pending = rowsRef.current.filter(row => row.sentiment_status === "pending").reverse();
      const start = pending.length ? next % pending.length : 0;
      const ids = [...pending.slice(start), ...pending.slice(0, start)].slice(0, 10).map(row => row.id);
      next = start + ids.length;
      if (!ids.length || busy) return;
      busy = true;
      try {
        const token = await AsyncStorage.getItem("access_token");
        if (!token || !active) return;
        const { data } = await apiClient.get(`/reports/${reportId}/comment-status`, { params: { ids: ids.join(",") }, headers: { Authorization: `Bearer ${token}` } });
        const currentToken = await AsyncStorage.getItem("access_token");
        if (!active || generation.current !== ticket || currentId.current !== reportId || token !== currentToken) return;
        const updates = new Map((data.comments || []).map(row => [row.id, row]));
        setComments(previous => previous.map(row => updates.has(row.id) ? { ...row, ...updates.get(row.id) } : row));
      } catch { /* Pending work can be retried on the next poll. */ }
      finally { busy = false; }
    };
    const timer = setInterval(poll, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [reportId]));

  const submit = useCallback(async () => {
    const text = commentText.trim();
    if (!text || !reportId || sendBusy.current || initialBusy.current || moreBusy.current) return;
    sendBusy.current = true; setSending(true);
    const ticket = generation.current;
    const valid = () => currentId.current === reportId && generation.current === ticket;
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) { if (valid()) toast.error("Please sign in to comment."); return; }
      if (!await ensureCompleteProfile("comment") || !valid()) return;
      const { data } = await apiClient.post(`/reports/${reportId}/comments`, { content: text }, { headers: { Authorization: `Bearer ${token}` } });
      const currentToken = await AsyncStorage.getItem("access_token");
      if (!valid() || token !== currentToken) return;
      setComments(previous => mergeComments(previous, [data.comment]));
      setTotal(previous => typeof data.total === "number" ? data.total : previous + 1);
      setCommentText(previous => previous.trim() === text ? "" : previous);
      patchCachedReports(reportId, row => ({ ...row, comments: typeof data.total === "number" ? data.total : (row.comments || 0) + 1 }));
      triggerRefresh();
    } catch (error) {
      if (valid()) toast.error(error.response?.data?.error || "Could not add comment.");
    } finally { if (valid()) { sendBusy.current = false; setSending(false); } }
  }, [commentText, reportId, toast]);

  return { comments, total, hasMore, loading, loadingMore, error, commentText, setCommentText, sending, submit,
    loadMore: () => { if (hasMore && cursor && !sending) return fetchPage(cursor); },
    retry: () => { if (!sending) return fetchPage(comments.length && cursor ? cursor : null); } };
}
