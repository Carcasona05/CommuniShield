import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import apiClient from "../services/apiClient";
import { getCache, setCache } from "../services/dataStore";
import { sessionData } from "../services/sessionData";
import { querySnapshotKey, usableQuerySnapshot } from "../services/querySnapshots";
import { mergeUniqueItems } from "../services/pagination";
import useAutoRefresh from "./useAutoRefresh";

// A loaded prefix, not a larger pageSize: View more fetches only the next batch.
// Refresh replaces the whole loaded prefix atomically so deleted/changed rows
// do not linger, without collapsing the list or remounting the scroll view.
export default function useViewMoreQuery({ endpoint, params = {}, itemsKey = "items", validate, enabled = true, pageSize = 10 }) {
  const [epoch, setEpoch] = useState(() => sessionData.epoch());
  const serialized = JSON.stringify(params);
  const cacheKey = querySnapshotKey(endpoint, { ...params, __viewMore: true, pageSize });
  const key = `${epoch}:${cacheKey}`;
  const current = useRef({ key, enabled });
  current.current = { key, enabled };
  const validator = useRef(validate);
  validator.current = validate;
  const read = () => {
    const snapshot = getCache(cacheKey);
    return usableQuerySnapshot(snapshot) && validator.current(snapshot.data) && Number.isInteger(snapshot.depth) && snapshot.depth > 0 ? snapshot : null;
  };
  const [state, setState] = useState(() => ({ key, snapshot: read(), busy: "", error: "" }));
  const stateRef = useRef(state);
  stateRef.current = state;
  const sequence = useRef(0);
  const inFlight = useRef(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = sessionData.subscribe(event => {
      if (event.type === "session" || event.type === "ready") setEpoch(sessionData.epoch());
      if (event.type === "denied" && event.path === endpoint) {
        sequence.current++;
        setState({ key: current.current.key, snapshot: null, busy: "", error: "Access denied. Please sign in again." });
      }
    });
    return () => { mounted.current = false; sequence.current++; unsubscribe(); };
  }, [endpoint]);

  const run = useCallback(({ more = false, force = false, retry = false } = {}) => {
    if (!enabled || sessionData.changing() || !sessionData.current(epoch)) return Promise.resolve(false);
    if (inFlight.current?.key === key && inFlight.current.version === sequence.current) return inFlight.current.promise;
    const previous = stateRef.current.key === key ? stateRef.current.snapshot : read();
    if (more && (!previous || !previous.data.hasMore)) return Promise.resolve(false);
    const base = JSON.parse(serialized);
    if (!more && !force && previous && sessionData.fresh({ url: endpoint, params: { ...base, page: 1, pageSize } })) return Promise.resolve(true);
    const version = ++sequence.current;
    const valid = () => mounted.current && current.current.enabled && current.current.key === key && sessionData.current(epoch) && sequence.current === version;
    setState({ key, snapshot: previous, busy: more ? "more" : "refresh", error: "" });
    const promise = (async () => {
      try {
        const token = await AsyncStorage.getItem("access_token");
        if (!token) throw Object.assign(new Error("Please sign in to load records."), { status: 401 });
        const start = more ? previous.depth + 1 : 1;
        const target = more ? start : previous?.depth || 1;
        let rows = more ? previous.data[itemsKey] : [], last, depth = start;
        let cursor = more ? previous.data.nextCursor : null;
        for (let page = start; page <= target; page++) {
          if (!valid()) return false;
          const response = await apiClient.get(endpoint, { params: { ...base, page, pageSize, ...(cursor ? { cursor } : {}) },
            headers: { Authorization: `Bearer ${token}` }, background: Boolean(previous) && !more,
            ...(force || more ? { cacheMode: "network" } : {}) });
          if (!valid()) return false;
          if (!validator.current(response.data) || !Array.isArray(response.data[itemsKey])) throw new Error("The server returned incomplete records. Please retry.");
          last = response.data;
          cursor = last.nextCursor;
          rows = mergeUniqueItems(rows, last[itemsKey], row => String(row.id));
          depth = page;
          if (!last.hasMore) break;
        }
        const snapshot = { data: { ...last, [itemsKey]: rows }, depth, checkedAt: Date.now() };
        if (!valid()) return false;
        setCache(cacheKey, snapshot);
        setState({ key, snapshot, busy: "", error: "" });
        return true;
      } catch (error) {
        if (!valid()) return false;
        const denied = [401, 403].includes(error.response?.status || error.status);
        const cancelled = error.code === "ERR_CANCELED" || error.__CANCEL__;
        const transient = [502, 503, 504].includes(error.response?.status) || ["ECONNABORTED", "ETIMEDOUT", "ERR_NETWORK"].includes(error.code);
        if (denied) setCache(cacheKey, undefined);
        setState({ key, snapshot: denied ? null : previous, busy: "", error: denied ? "Access denied. Please sign in again." :
          error.response?.data?.error || (cancelled ? "Records changed while loading. Please retry." : error.message) || "Could not load records. Please retry." });
        // One immediate retry; never retry denied or stale-session requests.
        if (!retry && (cancelled || transient)) {
          inFlight.current = null;
          return run({ more, force: true, retry: true });
        }
        return false;
      } finally {
        if (inFlight.current?.version === version) inFlight.current = null;
      }
    })();
    inFlight.current = { key, version, promise };
    return promise;
  }, [key, cacheKey, epoch, endpoint, serialized, itemsKey, enabled, pageSize]);

  useAutoRefresh(run, 60000);
  const previousKey = useRef(enabled ? key : null);
  useEffect(() => {
    const next = enabled ? key : null;
    if (next === previousKey.current) return;
    previousKey.current = next;
    sequence.current++;
    if (enabled) void run();
  }, [key, enabled, run]);
  const scoped = state.key === key ? state : { snapshot: read(), busy: "refresh", error: "" };
  const data = enabled ? scoped.snapshot?.data || null : null;
  return { data, items: data?.[itemsKey] || [], hasMore: Boolean(data?.hasMore),
    loading: enabled && !data && (Boolean(scoped.busy) || !scoped.error), loadingMore: scoped.busy === "more",
    refreshing: Boolean(data && scoped.busy === "refresh"), errorMessage: scoped.error,
    reload: () => run({ force: true }), loadMore: () => run({ more: true }), checkedAt: scoped.snapshot?.checkedAt || null };
}
