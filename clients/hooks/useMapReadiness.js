import { useCallback, useEffect, useState } from "react";

export default function useMapReadiness() {
  const [loaded, setLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setError("The map could not finish loading. Check your connection and retry."), 25000);
    return () => clearTimeout(timer);
  }, [ready, revision]);
  const markReady = useCallback(() => { setReady(true); setError(""); }, []);
  const retry = useCallback(() => { setLoaded(false); setReady(false); setError(""); setRevision(value => value + 1); }, []);
  return { loaded, ready, error, revision, markReady, retry,
    markLoaded: () => setLoaded(true),
    markError: () => setError("The map could not load. Check your connection and retry.") };
}
