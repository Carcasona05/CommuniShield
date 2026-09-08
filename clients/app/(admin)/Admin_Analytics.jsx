import React, { useCallback, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Svg, { Line, Polyline, Circle, Path } from "react-native-svg";
import Admin_Layout from "../../components/Admin_compo/Admin_Layout";
import AdminHeatMap from "../../components/Admin_compo/AdminHeatMap";
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

const ScatterChart = ({ data = [] }) => {
  const W = 340;
  const H = 150;

  const pts = data.map((d, i) => {
    const probability = Math.min(100, Math.max(0, Number(d.probability) || 0));
    return {
      x: (i / Math.max(1, data.length - 1)) * W,
      y: H - (probability / 100) * H,
      probability,
    };
  });

  const linePath =
    pts.length > 1
      ? `M${pts[0].x},${pts[0].y} L${pts[pts.length - 1].x},${pts[pts.length - 1].y}`
      : "";

  const dotColor = (p) =>
    p >= 80 ? "#F56B6B" : p >= 60 ? "#F29A2E" : p >= 40 ? "#4F8EF7" : "#3DBB74";

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      {[18, 52, 88, 124].map((y) => (
        <Line key={y} x1={0} y1={y} x2={W} y2={y} stroke="#DCE5F1" strokeWidth={1} />
      ))}

      {linePath ? <Path d={linePath} stroke="#F0A12A" strokeWidth={2} fill="none" /> : null}

      {pts.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={3} fill={dotColor(p.probability)} />
      ))}
    </Svg>
  );
};

export default function Admin_Analytics() {
  const [summary, setSummary] = useState(() => {
    const cached = getCache("api:/admin/analytics");
    return cached?.summary || {
      activeIncidents: 0,
      criticalHotspots: 0,
      avgSentiment: "0.0",
      sentimentLabel: "Neutral",
      credibilityRate: 0,
    };
  });
  const [sentimentTrend, setSentimentTrend] = useState(() => {
    const cached = getCache("api:/admin/analytics");
    return cached?.sentimentTrend || [];
  });
  const [forecast, setForecast] = useState(() => {
    const cached = getCache("api:/admin/analytics");
    return cached?.forecast || [];
  });
  const [forecastSummary, setForecastSummary] = useState(() => {
    const cached = getCache("api:/admin/analytics");
    return cached?.forecastSummary || {
      zone: "Argao",
      riskLevel: "LOW",
      probability: 0,
      crimeTypes: [],
      timeWindow: "",
      trend: 0,
      recommendedActions: [],
    };
  });
  const [reports, setReports] = useState(() => {
    const cached = getCache("api:/admin/dashboard");
    return cached?.reports || [];
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
        if (Array.isArray(cachedAnalytics.forecast)) {
          setForecast(cachedAnalytics.forecast);
        }
        if (cachedAnalytics.forecastSummary) {
          setForecastSummary((prev) => ({
            ...prev,
            ...cachedAnalytics.forecastSummary,
          }));
        }
      }

      const cachedDashboard = getCache("api:/admin/dashboard");
      if (cachedDashboard && Array.isArray(cachedDashboard.reports)) {
        setReports(cachedDashboard.reports);
      }

      const [res, dashRes] = await Promise.all([
        apiClient.get("/admin/analytics", { headers }),
        apiClient.get("/admin/dashboard", { headers }),
      ]);

      setCache("api:/admin/analytics", res.data ?? {});
      setCache("api:/admin/dashboard", dashRes.data ?? {});

      const data = res.data ?? {};

      if (data.summary) {
        setSummary((prev) => ({ ...prev, ...data.summary }));
      }
      if (Array.isArray(data.sentimentTrend)) {
        setSentimentTrend(data.sentimentTrend);
      }
      if (Array.isArray(data.forecast)) {
        setForecast(data.forecast);
      }
      if (data.forecastSummary) {
        setForecastSummary((prev) => ({ ...prev, ...data.forecastSummary }));
      }
      if (Array.isArray(dashRes.data?.reports)) {
        setReports(dashRes.data.reports);
      }
    } catch {
      // keep last loaded data on failure
    }
  }, []);

  useAutoRefresh(loadAnalytics, 30000);

  if (!fontsLoaded) {
    return null;
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
      value: `${summary.avgSentiment}/5.0`,
      subtext: summary.sentimentLabel,
      subColor: "#D97A1E",
      icon: "happy-outline",
      iconBg: "#FFF4E5",
      iconColor: "#E5A12F",
    },
    {
      title: "Credibility Rate",
      value: `${summary.credibilityRate}%`,
      subtext: "Validated",
      subColor: "#22A06B",
      icon: "shield-checkmark-outline",
      iconBg: "#EAF8F1",
      iconColor: "#2BAE66",
    },
  ];

  const mapReports = reports.filter(
    (r) =>
      r.latitude != null &&
      r.longitude != null &&
      Number.isFinite(Number(r.latitude)) &&
      Number.isFinite(Number(r.longitude))
  );

  const crimeTypes = forecastSummary.crimeTypes || [];
  const recommendedActions = forecastSummary.recommendedActions || [];
  const trendPct = Number(forecastSummary.trend) || 0;
  const trendText = `${trendPct >= 0 ? "▲" : "▼"} ${Math.abs(trendPct)}% vs previous period`;
  const riskLevel = forecastSummary.riskLevel || "LOW";
  const probability = Number(forecastSummary.probability) || 0;

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

            <View style={styles.middleRow}>
              <View style={styles.leftAnalyticsSection}>
                <View style={styles.mainCard}>
                  <View style={styles.cardHeaderTop}>
                    <Text style={styles.cardTitle}>Validation Queue</Text>
                  </View>

                  <View style={styles.mapCardBody}>
                    <View style={styles.mapArea}>
                      <AdminHeatMap reports={mapReports} />

                      <View style={styles.legendCard}>
                        <Text style={styles.legendTitle}>Incidents:</Text>

                        <View style={styles.legendItem}>
                          <View
                            style={[
                              styles.legendDot,
                              { backgroundColor: "#F56B6B" },
                            ]}
                          />
                          <Text style={styles.legendText}>Theft</Text>
                        </View>

                        <View style={styles.legendItem}>
                          <View
                            style={[
                              styles.legendDot,
                              { backgroundColor: "#F29A2E" },
                            ]}
                          />
                          <Text style={styles.legendText}>Assault</Text>
                        </View>

                        <View style={styles.legendItem}>
                          <View
                            style={[
                              styles.legendDot,
                              { backgroundColor: "#4F8EF7" },
                            ]}
                          />
                          <Text style={styles.legendText}>Fire</Text>
                        </View>

                        <View style={styles.legendItem}>
                          <View
                            style={[
                              styles.legendDot,
                              { backgroundColor: "#3DBB74" },
                            ]}
                          />
                          <Text style={styles.legendText}>Accident</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                </View>

                <View style={styles.bottomChartsRow}>
                  <View style={styles.chartCardLarge}>
                    <Text style={styles.sideCardTitle}>Sentiment Analysis</Text>

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
                    </View>
                  </View>

                  <View style={styles.chartCardSmall}>
                    <Text style={styles.sideCardTitle}>
                      Predictive Trend Model
                    </Text>

                    <View style={styles.chartContent}>
                      <Text style={styles.predictiveSubText}>
                        Forecasted Incident Probability{"\n"}over next 48 hours
                      </Text>

                      <View style={styles.scatterChartBox}>
                        <View style={styles.scatterAxisY}>
                          <Text style={styles.axisText}>100%</Text>
                          <Text style={styles.axisText}>80%</Text>
                          <Text style={styles.axisText}>40%</Text>
                          <Text style={styles.axisText}>20%</Text>
                          <Text style={styles.axisText}>0</Text>
                        </View>

                        <ScatterChart data={forecast} />

                        <View style={styles.scatterXAxis}>
                          <Text style={styles.axisText}>0</Text>
                          <Text style={styles.axisText}>10</Text>
                          <Text style={styles.axisText}>20</Text>
                          <Text style={styles.axisText}>30</Text>
                          <Text style={styles.axisText}>48</Text>
                        </View>

                        <Text style={styles.yAxisTitle}>Probability</Text>
                        <Text style={styles.xAxisTitle}>Incident Hours</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.rightForecastSection}>
                <View style={styles.forecastCard}>
                  <Text style={styles.forecastTitle}>
                    Possible Crime Forecast
                  </Text>
                  <Text style={styles.forecastSubtitle}>
                    Based on Predictive Trend Model
                  </Text>

                  <View style={styles.forecastDivider} />

                  <Text style={styles.forecastSectionTitle}>
                    Predicted High-Risk Zone
                  </Text>
                  <Text style={styles.forecastText}>{forecastSummary.zone}</Text>

                  <Text style={styles.forecastText}>
                    Risk Level:{" "}
                    <Text style={styles.highRiskText}>{riskLevel}</Text>
                  </Text>

                  <Text style={styles.forecastText}>
                    Probability:{" "}
                    <Text style={styles.highRiskText}>{probability}%</Text>
                  </Text>

                  <View style={styles.forecastDivider} />

                  <Text style={styles.forecastSectionTitle}>
                    Predicted Crime Types
                  </Text>

                  {crimeTypes.map((item, index) => (
                    <View key={index} style={styles.forecastListRow}>
                      <View style={styles.forecastListLeft}>
                        <View
                          style={[
                            styles.forecastListDot,
                            { backgroundColor: item.color || "#67B7F7" },
                          ]}
                        />
                        <Text style={styles.forecastText}>{item.label}</Text>
                      </View>
                      <Text style={styles.forecastText}>{item.value}</Text>
                    </View>
                  ))}

                  {crimeTypes.length === 0 ? (
                    <Text style={styles.forecastText}>
                      No high-severity reports to base a forecast on yet.
                    </Text>
                  ) : null}

                  <View style={styles.forecastDivider} />

                  <Text style={styles.forecastSectionTitle}>
                    Estimated Time Window
                  </Text>
                  <Text style={styles.forecastBigText}>
                    {forecastSummary.timeWindow || "—"}
                  </Text>

                  <View style={styles.forecastDivider} />

                  <Text style={styles.forecastSectionTitle}>
                    Trend Indicator
                  </Text>
                  <Text
                    style={[
                      styles.trendText,
                      trendPct < 0 && { color: "#E45757" },
                    ]}
                  >
                    {trendText}
                  </Text>

                  <View style={styles.forecastDivider} />

                  <Text style={styles.forecastSectionTitle}>
                    Recommended Action
                  </Text>

                  {recommendedActions.map((item, index) => (
                    <View key={index} style={styles.forecastListRowLeft}>
                      <View style={styles.recommendDot} />
                      <Text style={styles.forecastText}>{item}</Text>
                    </View>
                  ))}
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

  middleRow: {
    flexDirection: "row",
    gap: 16,
    alignItems: "flex-start",
  },

  leftAnalyticsSection: {
    flex: 1,
    minWidth: 0,
  },

  rightForecastSection: {
    width: 360,
  },

  mainCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 16,
  },

  cardHeaderTop: {
    minHeight: 50,
    borderBottomWidth: 1,
    borderBottomColor: "#D9E2F0",
    paddingHorizontal: 20,
    paddingVertical: 10,
    justifyContent: "center",
    backgroundColor: "#F7F9FD",
  },

  cardTitle: {
    fontSize: 16,
    fontFamily: "PoppinsSemiBold",
    color: "#294880",
  },

  mapCardBody: {
    padding: 12,
    backgroundColor: "#FFFFFF",
  },

  mapArea: {
    height: 370,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
    borderWidth: 1,
    borderColor: "#D9E2F0",
  },

  legendCard: {
    position: "absolute",
    left: 12,
    bottom: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 118,
    zIndex: 1000,
  },

  legendTitle: {
    fontSize: 12,
    fontFamily: "PoppinsSemiBold",
    color: "#35507A",
    marginBottom: 8,
  },

  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 5,
  },

  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 7,
  },

  legendText: {
    fontSize: 12,
    color: "#4B5D7A",
    fontFamily: "PoppinsMedium",
  },

  bottomChartsRow: {
    flexDirection: "row",
    gap: 14,
    alignItems: "stretch",
  },

  chartCardLarge: {
    flex: 1.6,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 12,
    overflow: "hidden",
  },

  chartCardSmall: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 12,
    overflow: "hidden",
  },

  sideCardTitle: {
    fontSize: 15,
    fontFamily: "PoppinsSemiBold",
    color: "#294880",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#D9E2F0",
    backgroundColor: "#F7F9FD",
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

  predictiveSubText: {
    fontSize: 12,
    color: "#5D6F92",
    lineHeight: 18,
    marginBottom: 10,
    fontFamily: "PoppinsMedium",
  },

  scatterChartBox: {
    height: 150,
    marginTop: 2,
    position: "relative",
    marginLeft: 48,
    marginRight: 10,
    marginBottom: 4,
  },

  scatterAxisY: {
    position: "absolute",
    left: -38,
    top: 8,
    height: 134,
    justifyContent: "space-between",
  },

  scatterXAxis: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 4,
    flexDirection: "row",
    justifyContent: "space-between",
  },

  yAxisTitle: {
    position: "absolute",
    left: -83,
    top: 56,
    transform: [{ rotate: "-90deg" }],
    fontSize: 12,
    color: "#5D6F92",
    fontFamily: "PoppinsSemiBold",
  },

  xAxisTitle: {
    position: "absolute",
    bottom: -14,
    left: 70,
    fontSize: 12,
    color: "#5D6F92",
    fontFamily: "PoppinsSemiBold",
  },

  forecastCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 14,
    padding: 20,
  },

  forecastTitle: {
    fontSize: 18,
    fontFamily: "PoppinsSemiBold",
    color: "#294880",
    marginBottom: 4,
  },

  forecastSubtitle: {
    fontSize: 13,
    color: "#4F70A5",
    fontFamily: "PoppinsMedium",
  },

  forecastDivider: {
    height: 1,
    backgroundColor: "#E3EAF4",
    marginVertical: 16,
  },

  forecastSectionTitle: {
    fontSize: 14,
    fontFamily: "PoppinsSemiBold",
    color: "#2F4267",
    marginBottom: 8,
  },

  forecastText: {
    fontSize: 13,
    color: "#435A84",
    lineHeight: 22,
    fontFamily: "PoppinsMedium",
  },

  forecastBigText: {
    fontSize: 15,
    color: "#2F4267",
    fontFamily: "PoppinsSemiBold",
  },

  highRiskText: {
    color: "#E45757",
    fontFamily: "PoppinsSemiBold",
  },

  trendText: {
    fontSize: 14,
    color: "#22A06B",
    fontFamily: "PoppinsSemiBold",
  },

  forecastListRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },

  forecastListLeft: {
    flexDirection: "row",
    alignItems: "center",
  },

  forecastListDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },

  forecastListRowLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
  },

  recommendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#67B7F7",
    marginTop: 7,
    marginRight: 10,
  },
};
