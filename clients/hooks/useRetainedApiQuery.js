import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import apiClient from "../services/apiClient";
import { getCache, setCache } from "../services/dataStore";
import { querySnapshotKey, retainUnchangedQueryData, usableQuerySnapshot } from "../services/querySnapshots";
import useAutoRefresh from "./useAutoRefresh";
import { sessionData } from "../services/sessionData";

/** Session-retained, filter-specific stale-while-revalidate display. Shared auth
 * logout clears dataStore. No tokens are stored in snapshot keys or values.
 * Never use a different filter's payload, an expired/previous-day forecast,
 * or cached results after an authorization error. Forecasts still expire. */
export default function useRetainedApiQuery({ endpoint, params, validate, interval = 60000 }) {
  const cacheKey = querySnapshotKey(endpoint, params);
  const [epoch, setEpoch] = useState(() => sessionData.epoch());
  const key = `${epoch}:${cacheKey}`;
  const validator = useRef(validate);
  validator.current = validate;
  const readSnapshot = useCallback(() => {
    const cached = getCache(cacheKey);
    return usableQuerySnapshot(cached) && validator.current(cached.data) ? cached : null;
  }, [cacheKey, epoch]);
  const [state, setState] = useState(() => ({ key, snapshot: readSnapshot(), error: "", fetching: false }));
  const stateRef = useRef(state);
  stateRef.current = state;
  const activeKey = useRef(key);
  activeKey.current = key;
  const sequence = useRef(0);
  const inFlight = useRef(null);
  const mounted = useRef(true);
  const retryTimer = useRef(null);
  const serializedParams = JSON.stringify(params || {});

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = sessionData.subscribe(event => {
      if (event.type === "session" || event.type === "ready") setEpoch(sessionData.epoch());
    });
    return () => { mounted.current = false; sequence.current++; clearTimeout(retryTimer.current); unsubscribe(); };
  }, []);

  // Idle prefetches also update mounted pages, without clearing the map/list.
  useEffect(() => sessionData.subscribe(event => {
    if (!sessionData.current(epoch)) return;
    if (event.type === "denied" && event.path === endpoint) {
      setState({ key, snapshot: null, error: "Access denied. Please sign in with an administrator account.", fetching: false });
    } else if (event.type === "snapshot" && event.key === cacheKey &&
      usableQuerySnapshot(event.snapshot) && validator.current(event.snapshot.data)) {
      setState(previous => ({ key, snapshot: event.snapshot, error: "",
        fetching: previous.key === key && previous.fetching }));
    }
  }), [key, cacheKey, epoch, endpoint]);

  const load = useCallback(({ force = false, cancelRetry = false } = {}) => {
    if (sessionData.changing()) return Promise.resolve();
    if (inFlight.current?.key === key && inFlight.current.version === sequence.current) return inFlight.current.promise;
    const version = ++sequence.current;
    const previous = stateRef.current.key === key && usableQuerySnapshot(stateRef.current.snapshot) ? stateRef.current.snapshot : readSnapshot();
    if (!force && previous && sessionData.fresh({ url: endpoint, params: JSON.parse(serializedParams) })) return Promise.resolve();
    setState({ key, snapshot: previous, error: "", fetching: true });
    const current = () => mounted.current && sessionData.current(epoch) && activeKey.current === key && sequence.current === version;
    const promise = (async () => {
      try {
        const token = await AsyncStorage.getItem("access_token");
        if (!token) {
          const error = new Error("Please sign in to load this page.");
          error.status = 401;
          throw error;
        }
        const response = await apiClient.get(endpoint, {
          params: JSON.parse(serializedParams), headers: { Authorization: `Bearer ${token}` },
          background: Boolean(previous),
          ...(force ? { cacheMode: "network" } : {}),
        });
        if (!current()) return;
        if (!validator.current(response.data)) throw new Error("The server returned incomplete page data.");
        const snapshot = { data: retainUnchangedQueryData(previous?.data, response.data),
          checkedAt: Number.isFinite(response.cacheCheckedAt) ? response.cacheCheckedAt : Date.now() };
        setCache(cacheKey, snapshot);
        setState({ key, snapshot, error: "", fetching: false });
      } catch (error) {
        if (!current()) return;
        if (error.code === "ERR_CANCELED" || error.__CANCEL__) {
          setState({ key, snapshot: previous, error: cancelRetry ? "Data changed while loading. Please retry." : "", fetching: false });
          if (!cancelRetry) {
            clearTimeout(retryTimer.current);
            retryTimer.current = setTimeout(() => { if (current()) load({ force: true, cancelRetry: true }); }, 100);
          }
          return;
        }
        const status = error?.response?.status || error.status;
        const denied = status === 401 || status === 403;
        if (denied) setCache(cacheKey, undefined);
        setState({ key, snapshot: denied ? null : previous,
          error: denied ? "Access denied. Please sign in with an administrator account." : error?.response?.data?.error || error.message || "Could not refresh this page.", fetching: false });
      } finally {
        if (inFlight.current?.version === version) inFlight.current = null;
      }
    })();
    inFlight.current = { key, version, promise };
    return promise;
  }, [key, cacheKey, epoch, endpoint, serializedParams, readSnapshot]);

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
    reload: () => load({ force: true }),
  };
}
