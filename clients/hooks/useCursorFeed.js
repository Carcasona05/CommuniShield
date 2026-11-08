import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import apiClient from "../services/apiClient";
import { getCachedPage } from "../services/dataStore";
import { mergeUniqueItems } from "../services/pagination";

const cachedPage = (endpoint, params) => {
  const data = getCachedPage(endpoint, params);
  // Ignore snapshots from older releases that downloaded an entire feed.
  return typeof data?.hasMore === "boolean" && typeof data?.total === "number" ? data : undefined;
};

// Cache keys include filters/cursors. Only ten rows are fetched per request;
// refreshing revalidates the already-loaded depth instead of collapsing it.
export default function useCursorFeed(endpoint, params, mapPage) {
  const key = JSON.stringify([endpoint, params]);
  const current = useRef(key);
  current.current = key;
  const cached = cachedPage(endpoint, params);
  const [state, setState] = useState(() => ({ key, rows: cached ? mapPage(cached) : [], meta: cached || {}, loading: !cached, error: "" }));
  const stateRef = useRef(state);
  stateRef.current = state;
  const request = useRef(0);
  const moreBusy = useRef(false);
  const loadBusy = useRef(false);
  const depth = useRef(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // params are primitives, stabilized by their serialized request key.
  const stableParams = useMemoParams(params, key);

  const load = useCallback(async ({ force = true } = {}) => {
    const ticket = ++request.current;
    loadBusy.current = true;
    moreBusy.current = false;
    setLoadingMore(false);
    const valid = () => current.current === key && ticket === request.current;
    const sameFilter = stateRef.current.key === key;
    const targetDepth = sameFilter ? depth.current : 1;
    const snapshot = cachedPage(endpoint, stableParams);
    if (!sameFilter) { depth.current = 1; setState({ key, rows: snapshot ? mapPage(snapshot) : [], meta: snapshot || {}, loading: !snapshot, error: "" }); }
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token || !valid()) return;
      let cursor, rows = [], first, last, pages = 0;
      do {
        const { data } = await apiClient.get(endpoint, {
          params: { ...stableParams, ...(cursor ? { cursor } : {}) },
          ...(force ? { cacheMode: "network" } : {}),
          headers: { Authorization: `Bearer ${token}` },
        });
        const currentToken = await AsyncStorage.getItem("access_token");
        if (!valid() || token !== currentToken) return;
        first ||= data; last = data;
        rows = mergeUniqueItems(rows, mapPage(data));
        cursor = data.nextCursor;
        pages++;
      } while (last.hasMore && cursor && pages < targetDepth);
      depth.current = pages;
      setState({ key, rows, meta: { ...first, hasMore: last.hasMore, nextCursor: last.nextCursor }, loading: false, error: "" });
    } catch (error) {
      if (valid() && error.code !== "ERR_CANCELED") setState(previous => ({ ...previous, key, loading: false, error: "Could not load reports. Please retry." }));
    } finally {
      if (valid()) { loadBusy.current = false; setRefreshing(false); setState(previous => ({ ...previous, loading: false })); }
    }
  }, [endpoint, key, stableParams, mapPage]);

  useEffect(() => { void load(); return () => { request.current++; }; }, [load]);

  const loadMore = useCallback(async () => {
    const previous = stateRef.current;
    if (previous.key !== key || loadBusy.current || moreBusy.current || !previous.meta.hasMore || !previous.meta.nextCursor) return;
    moreBusy.current = true;
    setLoadingMore(true);
    const ticket = request.current;
    const valid = () => current.current === key && ticket === request.current;
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token || !valid()) return;
      const { data } = await apiClient.get(endpoint, { params: { ...stableParams, cursor: previous.meta.nextCursor }, cacheMode: "network", headers: { Authorization: `Bearer ${token}` } });
      const currentToken = await AsyncStorage.getItem("access_token");
      if (!valid() || token !== currentToken) return;
      depth.current++;
      setState(latest => ({ ...latest, rows: mergeUniqueItems(latest.rows, mapPage(data)), meta: { ...latest.meta, ...data }, error: "" }));
    } catch (error) {
      if (valid() && error.code !== "ERR_CANCELED") setState(latest => ({ ...latest, error: "Could not load more reports. Please retry." }));
    } finally { if (valid()) { moreBusy.current = false; setLoadingMore(false); } }
  }, [endpoint, key, stableParams, mapPage]);

  const setRows = useCallback(update => setState(previous => ({ ...previous, rows: typeof update === "function" ? update(previous.rows) : update })), []);
  const refresh = useCallback(() => { setRefreshing(true); void load({ force: true }); }, [load]);
  const visible = state.key === key ? state : { rows: [], meta: {}, loading: true, error: "" };
  return { rows: visible.rows, setRows, meta: visible.meta, loading: visible.loading, error: visible.error, load, loadMore, loadingMore, refreshing, refresh };
}

function useMemoParams(params, key) {
  const ref = useRef({ key, params });
  if (ref.current.key !== key) ref.current = { key, params };
  return ref.current.params;
}
