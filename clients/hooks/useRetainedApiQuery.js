import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import apiClient from "../services/apiClient";
import { getCache, setCache } from "../services/dataStore";
import { querySnapshotKey, retainUnchangedQueryData, usableQuerySnapshot } from "../services/querySnapshots";
import useAutoRefresh from "./useAutoRefresh";
import { sessionData } from "../services/sessionData";

/** Short-lived, filter-specific stale-while-revalidate display. Shared auth
 * logout clears dataStore. No tokens are stored in snapshot keys or values.
 * Never use a different filter's payload, an expired/previous-day forecast,
 * or cached results after an authorization error. */
export default function useRetainedApiQuery({ endpoint, params, validate, interval = 60000 }) {
  const key = querySnapshotKey(endpoint, params);
  const validator = useRef(validate);
  validator.current = validate;
  const readSnapshot = useCallback(() => {
    const cached = getCache(key);
    return usableQuerySnapshot(cached) && validator.current(cached.data) ? cached : null;
  }, [key]);
  const [state, setState] = useState(() => ({ key, snapshot: readSnapshot(), error: "", fetching: false }));
  const stateRef = useRef(state);
  stateRef.current = state;
  const activeKey = useRef(key);
  activeKey.current = key;
  const sequence = useRef(0);
  const inFlight = useRef(null);
  const mounted = useRef(true);
  const serializedParams = JSON.stringify(params || {});

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; sequence.current++; };
  }, []);

  const load = useCallback(() => {
    if (inFlight.current?.key === key && inFlight.current.version === sequence.current) return inFlight.current.promise;
    const version = ++sequence.current;
    const sessionEpoch = sessionData.epoch();
    const previous = stateRef.current.key === key && usableQuerySnapshot(stateRef.current.snapshot) ? stateRef.current.snapshot : readSnapshot();
    setState({ key, snapshot: previous, error: "", fetching: true });
    const current = () => mounted.current && activeKey.current === key && sequence.current === version && sessionData.current(sessionEpoch);
    const promise = (async () => {
      try {
        const token = await AsyncStorage.getItem("access_token");
        if (!token) {
          const error = new Error("Please sign in to load this page.");
          error.status = 401;
          throw error;
        }
        const response = await apiClient.get(endpoint, {
          params: JSON.parse(serializedParams), headers: { Authorization: `Bearer ${token}` }, cacheMode: "network",
        });
        if (!current()) return;
        if (!validator.current(response.data)) throw new Error("The server returned incomplete page data.");
        const snapshot = { data: retainUnchangedQueryData(previous?.data, response.data), checkedAt: Date.now() };
        setCache(key, snapshot);
        setState({ key, snapshot, error: "", fetching: false });
      } catch (error) {
        if (!current()) return;
        const status = error?.response?.status || error.status;
        const denied = status === 401 || status === 403;
        if (denied) setCache(key, undefined);
        setState({ key, snapshot: denied ? null : previous,
          error: denied ? "Access denied. Please sign in with an administrator account." : error?.response?.data?.error || error.message || "Could not refresh this page.", fetching: false });
      } finally {
        if (inFlight.current?.version === version) inFlight.current = null;
      }
    })();
    inFlight.current = { key, version, promise };
    return promise;
  }, [key, endpoint, serializedParams, readSnapshot]);

  useAutoRefresh(load, interval);
  const previousKey = useRef(key);
  useEffect(() => {
    if (previousKey.current === key) return;
    previousKey.current = key;
    load();
  }, [key, load]);

  const scoped = state.key === key ? state : { snapshot: readSnapshot(), error: "", fetching: true };
  const snapshot = usableQuerySnapshot(scoped.snapshot) ? scoped.snapshot : null;
  return {
    data: snapshot?.data || null,
    loading: !snapshot && (scoped.fetching || !scoped.error),
    refreshing: Boolean(snapshot && scoped.fetching),
    checkedAt: snapshot?.checkedAt || null,
    errorMessage: scoped.error,
    reload: load,
  };
}
