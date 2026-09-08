import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated, useWindowDimensions } from "react-native";

const PRIMARY = "#294880";

const SkeletonPulse = ({ style }) => {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.6,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [opacity]);

  return <Animated.View style={[style, { opacity }]} />;
};

const SkeletonCard = () => {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(width - 24, 430);

  return (
    <View style={[styles.card, { width: cardWidth }]}>
      <View style={styles.header}>
        <View style={styles.userSection}>
          <SkeletonPulse style={styles.avatar} />

          <View style={styles.userTextWrap}>
            <SkeletonPulse style={styles.nameBar} />
            <SkeletonPulse style={styles.locationBar} />
            <SkeletonPulse style={styles.dateBar} />
          </View>
        </View>

        <SkeletonPulse style={styles.statusBadge} />
      </View>

      <View style={styles.content}>
        <SkeletonPulse style={styles.categoryBar} />
        <SkeletonPulse style={styles.typeBar} />
        <SkeletonPulse style={styles.detailBar1} />
        <SkeletonPulse style={styles.detailBar2} />
      </View>

      <View style={styles.actionBar}>
        <SkeletonPulse style={styles.actionBtn} />
        <SkeletonPulse style={styles.actionBtn} />
      </View>
    </View>
  );
};

export const SkeletonFeed = ({ count = 3 }) => (
  <View>
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonCard key={i} />
    ))}
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E7ECF3",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  userSection: {
    flexDirection: "row",
    flex: 1,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#DDE3EE",
  },
  userTextWrap: {
    marginLeft: 10,
    flex: 1,
  },
  nameBar: {
    width: "55%",
    height: 12,
    borderRadius: 6,
    backgroundColor: "#DDE3EE",
    marginBottom: 6,
  },
  locationBar: {
    width: "70%",
    height: 10,
    borderRadius: 5,
    backgroundColor: "#E7ECF3",
    marginBottom: 4,
  },
  dateBar: {
    width: "40%",
    height: 10,
    borderRadius: 5,
    backgroundColor: "#E7ECF3",
  },
  statusBadge: {
    width: 72,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#DDE3EE",
  },
  content: {
    marginBottom: 12,
  },
  categoryBar: {
    width: "35%",
    height: 11,
    borderRadius: 5,
    backgroundColor: "#DDE3EE",
    marginBottom: 6,
  },
  typeBar: {
    width: "60%",
    height: 14,
    borderRadius: 7,
    backgroundColor: "#DDE3EE",
    marginBottom: 8,
  },
  detailBar1: {
    width: "100%",
    height: 10,
    borderRadius: 5,
    backgroundColor: "#E7ECF3",
    marginBottom: 4,
  },
  detailBar2: {
    width: "75%",
    height: 10,
    borderRadius: 5,
    backgroundColor: "#E7ECF3",
  },
  actionBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#EEF2F8",
    paddingTop: 10,
    gap: 20,
  },
  actionBtn: {
    width: 60,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#E7ECF3",
  },
});
