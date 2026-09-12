import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated } from "react-native";

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

export const SettingsSkeleton = () => (
  <View style={s.page}>
    <View style={s.headerCard}>
      <SkeletonPulse style={s.avatarLarge} />
      <SkeletonPulse style={{ width: "50%", height: 14, borderRadius: 7, backgroundColor: "#DDE3EE", marginBottom: 6 }} />
      <SkeletonPulse style={{ width: "35%", height: 10, borderRadius: 5, backgroundColor: "#E7ECF3" }} />
    </View>

    <View style={s.card}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={[s.settingRow, i < 5 && s.settingRowBorder]}>
          <SkeletonPulse style={s.iconCircle} />
          <View style={{ flex: 1 }}>
            <SkeletonPulse style={{ width: "60%", height: 12, borderRadius: 6, backgroundColor: "#DDE3EE", marginBottom: 5 }} />
            <SkeletonPulse style={{ width: "80%", height: 9, borderRadius: 4, backgroundColor: "#E7ECF3" }} />
          </View>
          <SkeletonPulse style={s.toggleBar} />
        </View>
      ))}
    </View>

    <View style={s.dangerCard}>
      <SkeletonPulse style={s.dangerBtn} />
    </View>
  </View>
);

export const ListSkeleton = ({ rows = 6 }) => (
  <View style={s.page}>
    <View style={s.card}>
      <SkeletonPulse style={{ width: "40%", height: 14, borderRadius: 7, backgroundColor: "#DDE3EE", marginBottom: 14 }} />
      {[1, 2, 3, 4, 5].map((i) => (
        <SkeletonPulse key={i} style={s.filterBtn} />
      ))}
    </View>

    {[1, 2, 3, 4, 5, 6].slice(0, rows).map((i) => (
      <View key={i} style={s.card}>
        <View style={s.listRow}>
          <SkeletonPulse style={s.iconCircle} />
          <View style={{ flex: 1 }}>
            <SkeletonPulse style={{ width: "70%", height: 12, borderRadius: 6, backgroundColor: "#DDE3EE", marginBottom: 5 }} />
            <SkeletonPulse style={{ width: "50%", height: 9, borderRadius: 4, backgroundColor: "#E7ECF3", marginBottom: 4 }} />
            <SkeletonPulse style={{ width: "40%", height: 9, borderRadius: 4, backgroundColor: "#E7ECF3" }} />
          </View>
          <SkeletonPulse style={{ width: 56, height: 22, borderRadius: 11, backgroundColor: "#E7ECF3" }} />
        </View>
      </View>
    ))}
  </View>
);

export const MapSkeleton = () => (
  <View style={s.page}>
    <View style={s.mapPlaceholder} />

    <View style={s.card}>
      <SkeletonPulse style={{ width: "30%", height: 14, borderRadius: 7, backgroundColor: "#DDE3EE", marginBottom: 10 }} />
      <SkeletonPulse style={{ width: "60%", height: 10, borderRadius: 5, backgroundColor: "#E7ECF3", marginBottom: 14 }} />

      {[1, 2, 3].map((i) => (
        <View key={i} style={[s.listRow, i < 3 && s.listRowBorder]}>
          <SkeletonPulse style={s.iconCircleSmall} />
          <View style={{ flex: 1 }}>
            <SkeletonPulse style={{ width: "55%", height: 11, borderRadius: 5, backgroundColor: "#DDE3EE", marginBottom: 4 }} />
            <SkeletonPulse style={{ width: "35%", height: 9, borderRadius: 4, backgroundColor: "#E7ECF3" }} />
          </View>
          <SkeletonPulse style={{ width: 64, height: 20, borderRadius: 10, backgroundColor: "#E7ECF3" }} />
        </View>
      ))}
    </View>
  </View>
);

export const AnalyticsSkeleton = () => (
  <View style={s.page}>
    <View style={s.card}>
      <SkeletonPulse style={{ width: "45%", height: 14, borderRadius: 7, backgroundColor: "#DDE3EE", marginBottom: 14 }} />
      <SkeletonPulse style={s.chartPlaceholder} />
    </View>

    <View style={s.twoCol}>
      <View style={s.card}>
        <SkeletonPulse style={{ width: "50%", height: 12, borderRadius: 6, backgroundColor: "#DDE3EE", marginBottom: 12 }} />
        <SkeletonPulse style={s.chartPlaceholderSmall} />
      </View>
      <View style={s.card}>
        <SkeletonPulse style={{ width: "50%", height: 12, borderRadius: 6, backgroundColor: "#DDE3EE", marginBottom: 12 }} />
        <SkeletonPulse style={s.chartPlaceholderSmall} />
      </View>
    </View>

    {[1, 2, 3].map((i) => (
      <View key={i} style={s.card}>
        <View style={s.listRow}>
          <SkeletonPulse style={s.iconCircle} />
          <View style={{ flex: 1 }}>
            <SkeletonPulse style={{ width: "65%", height: 12, borderRadius: 6, backgroundColor: "#DDE3EE", marginBottom: 5 }} />
            <SkeletonPulse style={{ width: "45%", height: 9, borderRadius: 4, backgroundColor: "#E7ECF3" }} />
          </View>
        </View>
      </View>
    ))}
  </View>
);

export const ProfileFormSkeleton = () => (
  <View style={s.page}>
    <View style={s.card}>
      <SkeletonPulse style={{ width: "40%", height: 14, borderRadius: 7, backgroundColor: "#DDE3EE", marginBottom: 18 }} />

      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={{ marginBottom: 14 }}>
          <SkeletonPulse style={{ width: "30%", height: 10, borderRadius: 5, backgroundColor: "#E7ECF3", marginBottom: 6 }} />
          <SkeletonPulse style={s.inputField} />
        </View>
      ))}

      <SkeletonPulse style={s.saveBtn} />
    </View>
  </View>
);

const s = StyleSheet.create({
  page: {
    padding: 16,
  },
  headerCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E7ECF3",
    marginBottom: 14,
  },
  avatarLarge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#DDE3EE",
    marginBottom: 12,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E7ECF3",
    marginBottom: 14,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
  },
  settingRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F8",
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E7ECF3",
    marginRight: 12,
  },
  iconCircleSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#E7ECF3",
    marginRight: 10,
  },
  toggleBar: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#E7ECF3",
  },
  dangerCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E7ECF3",
    marginBottom: 14,
  },
  dangerBtn: {
    width: "100%",
    height: 48,
    borderRadius: 10,
    backgroundColor: "#E7ECF3",
  },
  filterBtn: {
    width: 72,
    height: 30,
    borderRadius: 8,
    backgroundColor: "#E7ECF3",
    marginRight: 8,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  listRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F8",
    paddingBottom: 12,
    marginBottom: 12,
  },
  mapPlaceholder: {
    width: "100%",
    height: 280,
    borderRadius: 14,
    backgroundColor: "#E7ECF3",
    marginBottom: 14,
  },
  chartPlaceholder: {
    width: "100%",
    height: 160,
    borderRadius: 10,
    backgroundColor: "#E7ECF3",
  },
  chartPlaceholderSmall: {
    width: "100%",
    height: 120,
    borderRadius: 10,
    backgroundColor: "#E7ECF3",
  },
  twoCol: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 14,
  },
  inputField: {
    width: "100%",
    height: 48,
    borderRadius: 10,
    backgroundColor: "#EEF2F8",
  },
  saveBtn: {
    width: "100%",
    height: 48,
    borderRadius: 10,
    backgroundColor: "#DDE3EE",
    marginTop: 6,
  },
});
