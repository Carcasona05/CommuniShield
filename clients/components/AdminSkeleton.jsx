import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated, useWindowDimensions } from "react-native";

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

export const AdminDashboardSkeleton = () => {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min((width - 40) / 2, 200);

  return (
    <View style={styles.container}>
      <View style={styles.summaryRow}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={[styles.summaryCard, { width: cardWidth }]}>
            <SkeletonPulse style={styles.iconCircle} />
            <View style={styles.cardTextWrap}>
              <SkeletonPulse style={styles.cardTitle} />
              <SkeletonPulse style={styles.cardValue} />
              <SkeletonPulse style={styles.cardSub} />
            </View>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <SkeletonPulse style={styles.sectionTitle} />
        <SkeletonPulse style={styles.mapPlaceholder} />
      </View>

      <View style={styles.section}>
        <SkeletonPulse style={styles.sectionTitle} />
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={styles.feedRow}>
            <SkeletonPulse style={styles.feedDot} />
            <View style={styles.feedTextWrap}>
              <SkeletonPulse style={styles.feedTitle} />
              <SkeletonPulse style={styles.feedSub} />
            </View>
            <SkeletonPulse style={styles.feedBadge} />
          </View>
        ))}
      </View>
    </View>
  );
};

export const SAdminDashboardSkeleton = () => {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min((width - 44) / 3, 150);

  return (
    <View style={styles.container}>
      <View style={styles.summaryRow}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <View key={i} style={[styles.summaryCard, { width: cardWidth }]}>
            <SkeletonPulse style={styles.iconCircle} />
            <View style={styles.cardTextWrap}>
              <SkeletonPulse style={styles.cardTitle} />
              <SkeletonPulse style={styles.cardValue} />
              <SkeletonPulse style={styles.cardSub} />
            </View>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <SkeletonPulse style={styles.sectionTitle} />
        {[1, 2, 3].map((i) => (
          <View key={i} style={styles.feedRow}>
            <SkeletonPulse style={styles.feedDot} />
            <View style={styles.feedTextWrap}>
              <SkeletonPulse style={styles.feedTitle} />
              <SkeletonPulse style={styles.feedSub} />
            </View>
            <SkeletonPulse style={styles.feedTime} />
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  summaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E7ECF3",
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E7ECF3",
    marginBottom: 10,
  },
  cardTextWrap: {
    flex: 1,
  },
  cardTitle: {
    width: "70%",
    height: 10,
    borderRadius: 5,
    backgroundColor: "#E7ECF3",
    marginBottom: 6,
  },
  cardValue: {
    width: "40%",
    height: 20,
    borderRadius: 10,
    backgroundColor: "#DDE3EE",
    marginBottom: 4,
  },
  cardSub: {
    width: "55%",
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E7ECF3",
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    width: "45%",
    height: 14,
    borderRadius: 7,
    backgroundColor: "#DDE3EE",
    marginBottom: 12,
  },
  mapPlaceholder: {
    width: "100%",
    height: 200,
    borderRadius: 14,
    backgroundColor: "#E7ECF3",
  },
  feedRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E7ECF3",
  },
  feedDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#DDE3EE",
    marginRight: 10,
  },
  feedTextWrap: {
    flex: 1,
  },
  feedTitle: {
    width: "65%",
    height: 11,
    borderRadius: 5,
    backgroundColor: "#DDE3EE",
    marginBottom: 4,
  },
  feedSub: {
    width: "80%",
    height: 9,
    borderRadius: 4,
    backgroundColor: "#E7ECF3",
  },
  feedBadge: {
    width: 56,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#E7ECF3",
  },
  feedTime: {
    width: 48,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#E7ECF3",
  },
});
