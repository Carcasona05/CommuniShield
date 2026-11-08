import { useRef } from "react";

// Older comments are inserted above the current batch. Offset the scroll by
// the added content height so the reader keeps the same comment in view.
export default function usePrependScroll(itemCount, identity) {
  const ref = useRef(null);
  const metrics = useRef({ height: 0, y: 0 });
  const anchor = useRef(null);
  const current = useRef(identity);
  if (current.current !== identity) { current.current = identity; anchor.current = null; }
  return {
    ref,
    onScroll: event => { metrics.current.y = event.nativeEvent.contentOffset.y; },
    onContentSizeChange: (_width, height) => {
      metrics.current.height = height;
      if (anchor.current && itemCount > anchor.current.count) {
        const y = Math.max(0, anchor.current.y + height - anchor.current.height);
        anchor.current = null;
        metrics.current.y = y;
        ref.current?.scrollTo({ y, animated: false });
      }
    },
    preserve: async action => {
      const snapshot = { ...metrics.current, count: itemCount };
      anchor.current = snapshot;
      const loaded = await action();
      if (!loaded && anchor.current === snapshot) anchor.current = null;
    },
  };
}
