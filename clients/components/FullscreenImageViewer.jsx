import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, Animated, useWindowDimensions, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ReportImage from "./ReportImage";
import { reportImageList } from "../services/reportImageSource";
import { createPhotoGestures } from "../services/photoGestures";

function ZoomableImage({ image, width, height, onSwipe, controls }) {
  const surface = useRef(null);
  const scale = useRef(new Animated.Value(1)).current;
  const x = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(0)).current;
  const swipeRef = useRef(onSwipe); swipeRef.current = onSwipe;
  const gestures = useMemo(() => createPhotoGestures({ width, height,
    onChange: value => { scale.setValue(value.scale); x.setValue(value.x); y.setValue(value.y); },
    onSwipe: direction => swipeRef.current(direction),
  }), [width, height, scale, x, y]);
  useEffect(() => { controls.current = gestures; return () => { controls.current = null; }; }, [gestures, controls]);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const node = surface.current;
    const wheel = event => { event.preventDefault(); gestures.zoom(event.deltaY < 0 ? 1.15 : 1 / 1.15); };
    node?.addEventListener("wheel", wheel, { passive: false });
    return () => node?.removeEventListener("wheel", wheel);
  }, [gestures]);
  const touches = event => Array.from(event.nativeEvent.touches || []);
  return <View ref={surface} testID="photo-zoom-surface" style={[styles.page, { width, height }, Platform.OS === "web" && { touchAction: "none", userSelect: "none" }]}
    onStartShouldSetResponder={() => true}
    onStartShouldSetResponderCapture={event => touches(event).length >= 2}
    onMoveShouldSetResponderCapture={event => touches(event).length >= 2 || gestures.snapshot().scale > 1}
    onResponderTerminationRequest={() => false}
    onTouchStart={event => gestures.start(touches(event))}
    onResponderGrant={event => gestures.start(touches(event))}
    onResponderMove={event => gestures.move(touches(event))}
    onResponderRelease={event => gestures.end(touches(event))}
    onTouchEnd={event => gestures.end(touches(event))}
    onResponderTerminate={() => gestures.end()}>
    <Animated.View testID="photo-zoom-transform" style={{ width, height, transform: [{ translateX: x }, { translateY: y }, { scale }] }}>
      <ReportImage image={image} style={{ width, height, backgroundColor: "#0B0F19" }} resizeMode="contain" dark />
    </Animated.View>
  </View>;
}

export default function FullscreenImageViewer({ images = [], initialIndex = 0, visible, onClose }) {
  const { width, height } = useWindowDimensions();
  const list = reportImageList(images);
  const startIndex = Math.max(0, Math.min(initialIndex, list.length - 1));
  const [activeIndex, setActiveIndex] = useState(startIndex);
  const controls = useRef(null);
  useEffect(() => { if (visible) setActiveIndex(startIndex); }, [visible, startIndex]);
  const index = Math.min(activeIndex, Math.max(0, list.length - 1));
  const browse = direction => setActiveIndex(current => Math.max(0, Math.min(list.length - 1, current + direction)));
  if (!visible || !list.length) return null;
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.container}>
      <ZoomableImage key={`${index}:${width}:${height}`} image={list[index]} width={width} height={height} controls={controls} onSwipe={browse} />
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.button} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close photo viewer"><Ionicons name="close" size={26} color="#FFFFFF" /></TouchableOpacity>
        {list.length > 1 && <Text style={styles.counter}>{index + 1} / {list.length}</Text>}
        <View style={styles.tools}>
          <TouchableOpacity style={styles.button} accessibilityRole="button" accessibilityLabel="Zoom out" onPress={() => controls.current?.zoom(1 / 1.4)}><Ionicons name="remove" size={22} color="#FFFFFF" /></TouchableOpacity>
          <TouchableOpacity style={styles.button} accessibilityRole="button" accessibilityLabel="Reset photo zoom" onPress={() => controls.current?.reset()}><Ionicons name="refresh" size={20} color="#FFFFFF" /></TouchableOpacity>
          <TouchableOpacity style={styles.button} accessibilityRole="button" accessibilityLabel="Zoom in" onPress={() => controls.current?.zoom(1.4)}><Ionicons name="add" size={22} color="#FFFFFF" /></TouchableOpacity>
        </View>
      </View>
      {list.length > 1 && <View style={styles.browseBar} pointerEvents="box-none">
        <TouchableOpacity style={styles.button} disabled={index === 0} accessibilityRole="button" accessibilityLabel="Previous photo" onPress={() => browse(-1)}><Ionicons name="chevron-back" size={26} color={index === 0 ? "#64748B" : "#FFFFFF"} /></TouchableOpacity>
        <TouchableOpacity style={styles.button} disabled={index === list.length - 1} accessibilityRole="button" accessibilityLabel="Next photo" onPress={() => browse(1)}><Ionicons name="chevron-forward" size={26} color={index === list.length - 1 ? "#64748B" : "#FFFFFF"} /></TouchableOpacity>
      </View>}
      <View style={styles.hintBar} pointerEvents="none"><Text style={styles.hintText}>Pinch to zoom · Drag when zoomed{list.length > 1 ? " · Swipe when unzoomed" : ""}</Text></View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B0F19", justifyContent: "center" },
  page: { justifyContent: "center", alignItems: "center", overflow: "hidden" },
  topBar: { position: "absolute", top: Platform.OS === "ios" ? 52 : 28, left: 0, right: 0, zIndex: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, gap: 8 },
  tools: { flexDirection: "row", gap: 6 },
  button: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  counter: { fontSize: 14, color: "#FFFFFF" },
  browseBar: { position: "absolute", bottom: 78, left: 16, right: 16, flexDirection: "row", justifyContent: "space-between" },
  hintBar: { position: "absolute", bottom: 32, left: 16, right: 16, alignItems: "center" },
  hintText: { fontSize: 11, color: "rgba(255,255,255,0.8)", textAlign: "center" },
});
