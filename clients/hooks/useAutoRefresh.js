import { useCallback, useRef } from "react";
import { useFocusEffect } from "expo-router";
import { AppState } from "react-native";

const MIN_INTERVAL = 60000;

export const useAutoRefresh = (loader, interval = 60000) => {
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
      const ms = Math.max(interval, MIN_INTERVAL);

      let timer = null;

      const isHidden = () =>
        typeof document !== "undefined" &&
        document.visibilityState === "hidden";

      const start = () => {
        if (timer) return;
        safeLoad();
        timer = setInterval(safeLoad, ms);
      };

      const stop = () => {
        if (!timer) return;
        clearInterval(timer);
        timer = null;
      };

      if (!isHidden()) start();

      const onVisibility = () => {
        if (isHidden()) stop();
        else start();
      };

      const onAppState = (state) => {
        if (state === "active" && !isHidden()) start();
        else if (state !== "active") stop();
      };

      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", onVisibility);
      }

      const appStateSub = AppState.addEventListener("change", onAppState);

      return () => {
        stop();
        if (typeof document !== "undefined") {
          document.removeEventListener("visibilitychange", onVisibility);
        }
        appStateSub.remove();
      };
    }, [interval, safeLoad])
  );
};

export default useAutoRefresh;
