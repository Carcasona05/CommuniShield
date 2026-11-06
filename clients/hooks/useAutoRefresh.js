import { useCallback, useRef } from "react";
import { useFocusEffect } from "expo-router";
import { AppState } from "react-native";
import { sessionData } from "../services/sessionData";

const MIN_INTERVAL = 60000;

export const useAutoRefresh = (loader, interval = 60000, { minimumInterval = MIN_INTERVAL } = {}) => {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const inflight = useRef(false);
  const pending = useRef(false);
  const focused = useRef(false);

  const safeLoad = useCallback(async () => {
    const canLoad = () => focused.current && AppState.currentState !== "background" && AppState.currentState !== "inactive" &&
      (typeof document === "undefined" || document.visibilityState !== "hidden");
    if (!canLoad()) return;
    if (inflight.current) { pending.current = true; return; }
    inflight.current = true;
    try {
      do {
        pending.current = false;
        try { await loaderRef.current(); } catch {}
      } while (pending.current && canLoad() && !sessionData.changing());
    } catch {
    } finally {
      inflight.current = false;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      const ms = Math.max(interval, minimumInterval);

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

      if (!isHidden() && AppState.currentState !== "background" && AppState.currentState !== "inactive") start();

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
      const unsubscribe = sessionData.subscribe(event => {
        if ((event.type === "ready" || event.type === "invalidate") && !isHidden() && AppState.currentState !== "background" && AppState.currentState !== "inactive") {
          void safeLoad();
        }
      });

      return () => {
        focused.current = false;
        pending.current = false;
        unsubscribe();
        stop();
        if (typeof document !== "undefined") {
          document.removeEventListener("visibilitychange", onVisibility);
        }
        appStateSub.remove();
      };
    }, [interval, minimumInterval, safeLoad])
  );
};

export default useAutoRefresh;
