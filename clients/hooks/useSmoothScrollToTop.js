import { useCallback, useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";

// Shared by every page with a scroll-up button. Keep page-specific visibility
// and navigation handling in that page's existing onScroll callback.
export default function useSmoothScrollToTop(scrollRef) {
  const offset = useRef(0);
  const animationRef = useRef(null);
  const position = useRef(new Animated.Value(0)).current;
  const attachedNode = useRef(null);

  const stopScrollAnimation = useCallback(() => {
    animationRef.current?.stop();
  }, []);

  const trackScroll = useCallback((event) => {
    offset.current = event.nativeEvent.contentOffset.y;
  }, []);

  const scrollToTop = useCallback(() => {
    stopScrollAnimation();
    const node = scrollRef.current?.getScrollableNode?.();
    const start = typeof node?.scrollTop === "number" ? node.scrollTop : offset.current;
    if (start <= 0) return;
    position.setValue(start);
    const listener = position.addListener(({ value }) => {
      scrollRef.current?.scrollTo({ y: value, animated: false });
    });
    const animation = Animated.timing(position, {
      toValue: 0,
      duration: 650,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    });
    animationRef.current = animation;
    animation.start(() => {
      position.removeListener(listener);
      if (animationRef.current === animation) animationRef.current = null;
    });
  }, [position, scrollRef, stopScrollAnimation]);

  // ScrollViews can mount after fonts/loading skeletons finish. Check the ref
  // after each commit, but attach listeners only when the DOM node changes.
  useEffect(() => {
    const node = scrollRef.current?.getScrollableNode?.();
    if (node === attachedNode.current) return;
    attachedNode.current?.removeEventListener?.("wheel", stopScrollAnimation);
    attachedNode.current?.removeEventListener?.("pointerdown", stopScrollAnimation);
    attachedNode.current = node || null;
    node?.addEventListener?.("wheel", stopScrollAnimation, { passive: true });
    node?.addEventListener?.("pointerdown", stopScrollAnimation, { passive: true });
  });

  useEffect(() => () => {
    stopScrollAnimation();
    attachedNode.current?.removeEventListener?.("wheel", stopScrollAnimation);
    attachedNode.current?.removeEventListener?.("pointerdown", stopScrollAnimation);
  }, [stopScrollAnimation]);

  return { scrollToTop, trackScroll, stopScrollAnimation };
}
