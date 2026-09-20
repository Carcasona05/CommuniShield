import { useCallback, useRef } from "react";
import { useFocusEffect } from "expo-router";

export const useAutoRefresh = (loader, interval = 30000) => {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const inflight = useRef(false);

  const safeLoad = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      await loaderRef.current();
    } catch {
    } finally {
      inflight.current = false;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      safeLoad();
      const id = setInterval(safeLoad, interval);
      return () => clearInterval(id);
    }, [interval, safeLoad])
  );
};

export default useAutoRefresh;
