import React, { useCallback, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Svg, { Line, Polyline, Circle } from "react-native-svg";
import Admin_Layout from "../../components/Admin_compo/Admin_Layout";
import { AnalyticsSkeleton } from "../../components/PageSkeletons";
import apiClient from "../../services/apiClient";
import useAutoRefresh from "../../hooks/useAutoRefresh";
import { getCache, setCache } from "../../services/dataStore";

const SentimentChart = ({ data = [] }) => {
  const W = 320;
  const H = 128;
  const max = 100;
  const step = data.length > 1 ? W / (data.length - 1) : W;

  const clamp = (v) => Math.min(max, Math.max(0, Number(v) || 0));

  const points = data
    .map((d, i) => `${(i * step).toFixed(1)},${(H - (clamp(d.value) / max) * H).toFixed(1)}`)
    .join(" ");

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      {[0, 32, 64, 96].map((y) => (
        <Line key={y} x1={0} y1={y} x2={W} y2={y} stroke="#DCE5F1" strokeWidth={1} />
      ))}

      {points ? (
        <Polyline
          points={points}
          fill="none"
          stroke="#2F8DE4"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}

      {data.map((d, i) => (
        <Circle
          key={i}
          cx={i * step}
          cy={H - (clamp(d.value) / max) * H}
          r={2.5}
          fill="#2F8DE4"
        />
      ))}
    </Svg>
  );
};

const distColor = (label) => {
  switch (label) {
    case "positive":
      return "#3DBB74";
    case "neutral":
      return "#4F8EF7";
    case "negative":
      return "#E45757";
    case "mixed":
      return "#F29A2E";
    case "unclear":
      return "#9AA8C2";
    default:
      return "#9AA8C2";
  }
};

export default function Admin_Analytics() {
  const [loading, setLoading] = useState(() => getCache("api:/admin/analytics") === undefined);

  const [summary, setSummary] = useState(() => {
    const cached = getCache("api:/admin/analytics");
    return cached?.summary || {
      activeIncidents: 0,
      criticalHotspots: 0,
      avgSentiment: "—",
      sentimentLabel: "Unavailable",
      sentimentAnalyzed: 0,
      sentimentTotal: 0,
      sentimentDistribution: [],
    };
  });
  const [sentimentTrend, setSentimentTrend] = useState(() => {
    const cached = getCache("api:/admin/analytics");
    return cached?.sentimentTrend || [];
  });

  const [fontsLoaded] = useFonts({
    PoppinsRegular: require("../../assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("../../assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("../../assets/fonts/Poppins-SemiBold.ttf"),
  });

  const loadAnalytics = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };

      const cachedAnalytics = getCache("api:/admin/analytics");
      if (cachedAnalytics) {
        if (cachedAnalytics.summary) {
          setSummary((prev) => ({ ...prev, ...cachedAnalytics.summary }));
        }
        if (Array.isArray(cachedAnalytics.sentimentTrend)) {
          setSentimentTrend(cachedAnalytics.sentimentTrend);
        }
      }

      const res = await apiClient.get("/admin/analytics", { headers });
      setCache("api:/admin/analytics", res.data ?? {});

      const data = res.data ?? {};

      if (data.summary) {
        setSummary((prev) => ({ ...prev, ...data.summary }));
      }
      if (Array.isArray(data.sentimentTrend)) {
        setSentimentTrend(data.sentimentTrend);
      }
    } catch {
      // keep last loaded data on failure
    } finally {
      setLoading(false);
    }
  }, []);

  useAutoRefresh(loadAnalytics, 60000);

  if (!fontsLoaded) {
    return null;
  }

  if (loading) {
    return (
      <Admin_Layout>
        <AnalyticsSkeleton />
      </Admin_Layout>
    );
  }

  const summaryCards = [
    {
      title: "Active Incidents",
      value: String(summary.activeIncidents),
      subtext: "",
      subColor: "#22A06B",
      icon: "flash-outline",
      iconBg: "#EAF2FF",
      iconColor: "#4F8EF7",
    },
    {
      title: "Critical Hotspots",
      value: `${summary.criticalHotspots} Active`,
      subtext: "Argao",
      subColor: "#E45757",
      icon: "warning-outline",
      iconBg: "#FDEEEE",
      iconColor: "#E45757",
    },
    {
      title: "Avg. Sentiment",
      value: summary.avgSentiment == null || summary.avgSentiment === "—" ? "—" : `${summary.avgSentiment}/5.0`,
      subtext: summary.sentimentLabel,
      subColor: "#D97A1E",
      icon: "happy-outline",
      iconBg: "#FFF4E5",
      iconColor: "#E5A12F",
    },
  ];

  return (
    <Admin_Layout>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.contentWrap}>
          <View style={styles.topSection}>
            <View style={styles.summaryRow}>
              {summaryCards.map((card, index) => (
                <View key={index} style={styles.summaryCard}>
                  <View
                    style={[
                      styles.summaryIconWrap,
                      { backgroundColor: card.iconBg },
                    ]}
                  >
                    <Ionicons
                      name={card.icon}
                      size={24}
                      color={card.iconColor}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.summaryTitle}>{card.title}</Text>
                    <View style={styles.summaryValueRow}>
                      <Text
                        style={[
                          styles.summaryValue,
                          card.title === "Critical Hotspots" && {
                            color: "#E45757",
                          },
                        ]}
                      >
                        {card.value}
                      </Text>

                      {!!card.subtext && (
                        <Text
                          style={[
                            styles.summarySubtext,
                            { color: card.subColor },
                          ]}
                        >
                          {card.subtext}
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              ))}
            </View>

            {/* TWO-COLUMN LAYOUT (70% LEFT, 30% RIGHT EMPTY BOX) */}
            <View style={styles.middleRow}>
              {/* LEFT SECTION (70%) */}
              <View style={styles.leftAnalyticsSection}>
                <View style={styles.emphasizedSentimentCard}>
                  <View style={styles.emphasizedHeader}>
                    <View style={styles.emphasizedHeaderTitleRow}>
                      <Ionicons name="pulse" size={18} color="#294880" />
                      <Text style={styles.emphasizedTitle}>Sentiment Analysis Overview</Text>
                    </View>
                    <Text style={styles.sentimentCoverage}>
                      {summary.sentimentAnalyzed ?? 0}/{summary.sentimentTotal ?? 0} analyzed
                    </Text>
                  </View>

                  <View style={styles.emphasizedContent}>
                    <View style={styles.chartContent}>
                      <Text style={styles.chartSubhead}>24hr Trend</Text>

                      <View style={styles.lineChartBox}>
                        <View style={styles.yAxisLabels}>
                          <Text style={styles.axisText}>100</Text>
                          <Text style={styles.axisText}>75</Text>
                          <Text style={styles.axisText}>50</Text>
                          <Text style={styles.axisText}>25</Text>
                          <Text style={styles.axisText}>0</Text>
                        </View>

                        <View style={styles.svgWrap}>
                          <SentimentChart data={sentimentTrend} />
                        </View>

                        <View style={styles.rightLabels}>
                          <Text style={styles.anxiousLabel}>Anxious</Text>
                          <Text style={styles.neutralLabel}>Neutral</Text>
                          <Text style={styles.calmLabel}>Calm</Text>
                        </View>
                      </View>

                      <View style={styles.xAxisRow}>
                        <Text style={styles.axisText}>00:00</Text>
                        <Text style={styles.axisText}>06:00</Text>
                        <Text style={styles.axisText}>12:00</Text>
                        <Text style={styles.axisText}>18:00</Text>
                        <Text style={styles.axisText}>23:00</Text>
                      </View>

                      <Text style={[styles.chartSubhead, { marginTop: 20 }]}>
                        Distribution Breakdown
                      </Text>
                      <View style={styles.distList}>
                        {(Array.isArray(summary.sentimentDistribution)
                          ? summary.sentimentDistribution
                          : []
                        ).map((item) => {
                          const total = Math.max(
                            1,
                            Number(summary.sentimentTotal) || 0
                          );
                          const count = Number(item?.count) || 0;
                          const pct = Math.round((count / total) * 100);
                          const isNone = item?.label === "none";
                          return (
                            <View key={String(item?.label)} style={styles.distRow}>
                              <Text style={styles.distLabel}>
                                {isNone ? "No data" : String(item?.label)}
                              </Text>
                              <View style={styles.distBarTrack}>
                                <View
                                  style={[
                                    styles.distBarFill,
                                    {
                                      width: `${pct}%`,
                                      backgroundColor: isNone
                                        ? "#9AA8C2"
                                        : distColor(String(item?.label)),
                                    },
                                  ]}
                                />
                              </View>
                              <Text style={styles.distCount}>
                                {count} ({pct}%)
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  </View>
                </View>
              </View>

              {/* RIGHT EMPTY SECTION (30%) */}
              <View style={styles.rightEmptySection}>
                <View style={styles.emptyBoxCard}>
                  {/* You can add content here later */}
                </View>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </Admin_Layout>
  );
}

const styles = {
  scrollContent: {
    paddingBottom: 24,
  },

  contentWrap: {
    flex: 1,
  },

  topSection: {
    flex: 1,
  },

  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    marginBottom: 16,
  },

  summaryCard: {
    flex: 1,
    minWidth: 210,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
  },

  summaryIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },

  summaryTitle: {
    fontSize: 14,
    color: "#4B5D7A",
    marginBottom: 6,
    fontFamily: "PoppinsMedium",
  },

  summaryValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    flexWrap: "wrap",
  },

  summaryValue: {
    fontSize: 21,
    fontFamily: "PoppinsSemiBold",
    color: "#2E3F63",
  },

  summarySubtext: {
    fontSize: 13,
    fontFamily: "PoppinsSemiBold",
  },

  // Two-Column Layout Styles (70 / 30 proportion)
  middleRow: {
    flexDirection: "row",
    gap: 16,
    alignItems: "flex-start",
  },

  leftAnalyticsSection: {
    flex: 7,
    minWidth: 0,
  },

  rightEmptySection: {
    flex: 3,
    minWidth: 0,
  },

  emptyBoxCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 12,
    minHeight: 400, // Matches height balance
    shadowColor: "#0F1E3D",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },

  // Sentiment Card Styles
  emphasizedSentimentCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 16,
    shadowColor: "#0F1E3D",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },

  emphasizedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: "#F7F9FD",
    borderBottomWidth: 1,
    borderBottomColor: "#D9E2F0",
  },

  emphasizedHeaderTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  emphasizedTitle: {
    fontSize: 15,
    fontFamily: "PoppinsSemiBold",
    color: "#294880",
  },

  emphasizedContent: {
    padding: 0,
  },

  chartContent: {
    padding: 16,
  },

  chartSubhead: {
    fontSize: 13,
    color: "#4F70A5",
    fontFamily: "PoppinsSemiBold",
    marginBottom: 10,
  },

  sentimentCoverage: {
    fontSize: 12,
    color: "#5D6F92",
    fontFamily: "PoppinsMedium",
  },

  distList: {
    gap: 6,
  },

  distRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  distLabel: {
    width: 72,
    fontSize: 11,
    color: "#435A84",
    fontFamily: "PoppinsMedium",
    textTransform: "capitalize",
  },

  distBarTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E8EEF8",
    overflow: "hidden",
  },

  distBarFill: {
    height: 8,
    borderRadius: 4,
  },

  distCount: {
    width: 58,
    fontSize: 11,
    color: "#5D6F92",
    fontFamily: "PoppinsMedium",
    textAlign: "right",
  },

  lineChartBox: {
    height: 128,
    position: "relative",
  },

  svgWrap: {
    marginLeft: 30,
    marginRight: 70,
  },

  yAxisLabels: {
    position: "absolute",
    left: 0,
    top: -8,
    height: 136,
    justifyContent: "space-between",
  },

  axisText: {
    fontSize: 11,
    color: "#6A7C9B",
    fontFamily: "PoppinsMedium",
  },

  rightLabels: {
    position: "absolute",
    right: -2,
    top: 8,
    height: 112,
    justifyContent: "space-between",
    alignItems: "flex-start",
  },

  anxiousLabel: {
    fontSize: 12,
    color: "#F04E45",
    fontFamily: "PoppinsSemiBold",
  },

  neutralLabel: {
    fontSize: 12,
    color: "#C9731D",
    fontFamily: "PoppinsSemiBold",
  },

  calmLabel: {
    fontSize: 12,
    color: "#2F7DE1",
    fontFamily: "PoppinsSemiBold",
  },

  xAxisRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    marginLeft: 28,
    marginRight: 64,
  },
};