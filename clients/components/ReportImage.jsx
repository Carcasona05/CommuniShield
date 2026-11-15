import React, { useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { reportImageSource } from "../services/reportImageSource";

export default function ReportImage({ image, style, resizeMode = "cover", dark = false }) {
  const source = reportImageSource(image);
  const key = typeof source === "number" ? String(source) : source?.uri || "missing";
  return <ImageContent key={key} source={source} style={style} resizeMode={resizeMode} dark={dark} />;
}

function ImageContent({ source, style, resizeMode, dark }) {
  const [state, setState] = useState(source ? "loading" : "error");
  const [attempt, setAttempt] = useState(0);
  const color = dark ? "#FFFFFF" : "#294880";
  return <View style={[styles.container, style]}>
    {!!source && <Image key={attempt} source={source} style={styles.image} resizeMode={resizeMode}
      onLoad={() => setState("ready")} onError={() => setState("error")} />}
    {state === "loading" && <View pointerEvents="none" style={styles.overlay}><ActivityIndicator color={color} /></View>}
    {state === "error" && <View style={styles.overlay}>
      <Text style={[styles.message, { color }]}>Photo unavailable</Text>
      {!!source && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retry photo" style={styles.retry} onPress={(event) => { event.stopPropagation?.(); setState("loading"); setAttempt(value => value + 1); }}>
        <Text style={[styles.message, { color, textDecorationLine: "underline" }]}>Retry</Text>
      </TouchableOpacity>}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  container: { overflow: "hidden", backgroundColor: "#E4EBF7" },
  image: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  message: { fontSize: 12, textAlign: "center" },
  retry: { padding: 10 },
});
