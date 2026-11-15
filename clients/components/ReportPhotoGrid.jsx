import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import ReportImage from "./ReportImage";
import { reportImageList } from "../services/reportImageSource";

export default function ReportPhotoGrid({ images, onPress, height = 220 }) {
  const list = reportImageList(images).slice(0, 3);
  if (!list.length) return null;
  const photo = index => <TouchableOpacity key={index} style={styles.cell} activeOpacity={0.95}
    accessibilityRole="button" accessibilityLabel={`Open photo ${index + 1} of ${list.length}`} onPress={() => onPress(index)}>
    <ReportImage image={list[index]} style={styles.image} />
  </TouchableOpacity>;
  return <View style={[styles.grid, { height }]}>
    {photo(0)}
    {list.length === 2 && photo(1)}
    {list.length === 3 && <View style={styles.column}>{photo(1)}{photo(2)}</View>}
  </View>;
}

const styles = StyleSheet.create({
  grid: { width: "100%", flexDirection: "row", gap: 4, borderRadius: 14, overflow: "hidden" },
  cell: { flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" },
  column: { flex: 1, gap: 4 },
  image: { width: "100%", height: "100%" },
});
