import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFonts } from "expo-font";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Admin_Layout from "../../components/Admin_compo/Admin_Layout";
import AdminHeatMap from "../../components/Admin_compo/AdminHeatMap";
import apiClient from "../../services/apiClient";
import useAutoRefresh from "../../hooks/useAutoRefresh";
import { getCache, setCache } from "../../services/dataStore";
import { AdminDashboardSkeleton } from "../../components/AdminSkeleton";

const formatFeedTime = (iso) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();

  return sameDay
    ? date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export default function Admin_Dashboard() {
  const router = useRouter();

  const [summary, setSummary] = useState({
    total: 0,
    pending: 0,
    verified: 0,
    rejected: 0,
    hotspots: 0,
  });
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  const [fontsLoaded] = useFonts({
    PoppinsRegular: require("../../assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("../../assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("../../assets/fonts/Poppins-SemiBold.ttf"),
  });

  const loadDashboard = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;

      const cached = getCache("api:/admin/dashboard");
      if (cached) {
        if (cached.summary) {
          setSummary((prev) => ({ ...prev, ...cached.summary }));
        }
        if (Array.isArray(cached.reports)) {
          setReports(cached.reports);
        }
      }

      const res = await apiClient.get("/admin/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
      });

      setCache("api:/admin/dashboard", res.data ?? {});

      const data = res.data ?? {};
      if (data.summary) {
        setSummary((prev) => ({ ...prev, ...data.summary }));
      }
      if (Array.isArray(data.reports)) {
        setReports(data.reports);
      }
    } catch {
      // keep last loaded data on failure
    } finally {
      setLoading(false);
    }
  }, []);

  useAutoRefresh(loadDashboard, 30000);

  if (!fontsLoaded) {
    return null;
  }

  if (loading) {
    return (
      <Admin_Layout>
        <AdminDashboardSkeleton />
      </Admin_Layout>
    );
  }

  const summaryCards = [
    {
      title: "Pending Validation",
      value: String(summary.pending),
      subtext: "Needs review",
      subColor: "#D97A1E",
      icon: "time-outline",
      iconBg: "#FFF4E5",
      iconColor: "#D97A1E",
    },
    {
      title: "Verified Reports",
      value: String(summary.verified),
      subtext: "Mapped",
      subColor: "#22A06B",
      icon: "shield-checkmark-outline",
      iconBg: "#EAF8F1",
      iconColor: "#22A06B",
    },
    {
      title: "Rejected Reports",
      value: String(summary.rejected),
      subtext: "Invalid",
      subColor: "#E45757",
      icon: "close-circle-outline",
      iconBg: "#FDEEEE",
      iconColor: "#E45757",
    },
    {
      title: "Critical Hotspots",
      value: String(summary.hotspots),
      subtext: "Argao",
      subColor: "#E45757",
      icon: "warning-outline",
      iconBg: "#FDEEEE",
      iconColor: "#E45757",
    },
  ];

  const getFeedStyle = (item) => {
    if (item.status === "Rejected") {
      return { color: "#E45757", bg: "#FDEEEE" };
    }
    if (item.is_verified || item.status === "Resolved") {
      return { color: "#22A06B", bg: "#EAF8F1" };
    }
    return { color: "#D97A1E", bg: "#FFF4E5" };
  };

  const incidentFeed = reports.slice(0, 12).map((r) => {
    const style = getFeedStyle(r);
    return {
      id: r.id,
      title: r.incident_type || "Incident",
      location: r.location || "Location not specified",
      score: r.ai_score != null ? `${r.ai_score}%` : "—",
      sentiment: r.sentiment || "Neutral",
      status: r.is_verified ? "Verified" : r.status || "Pending",
      source: r.source || "User",
      time: formatFeedTime(r.created_at),
      statusColor: style.color,
      statusBg: style.bg,
    };
  });

  const mapReports = reports.filter(
    (r) =>
      r.latitude != null &&
      r.longitude != null &&
      Number.isFinite(Number(r.latitude)) &&
      Number.isFinite(Number(r.longitude))
  );

  return (
    <Admin_Layout>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.contentWrap}>
          <View style={styles.summaryRow}>
            {summaryCards.map((card, index) => (
              <TouchableOpacity
                key={index}
                style={styles.summaryCard}
                activeOpacity={0.85}
                onPress={() => {
                  if (
                    card.title === "Pending Validation" ||
                    card.title === "Verified Reports" ||
                    card.title === "Rejected Reports"
                  ) {
                    router.push("/(admin)/Admin_Validation");
                  }
                }}
              >
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
                        card.title === "Rejected Reports" && {
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
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.middleSection}>
            <View style={styles.mapSection}>
              <View style={styles.mainCard}>
                <View style={styles.cardHeaderTop}>
                  <View>
                    <Text style={styles.cardTitle}>Verified Incident Map</Text>
                    <Text style={styles.cardSubtitle}>
                      Report pins and heatmap around Argao.
                    </Text>
                  </View>

                  <View style={styles.cardHeaderControls}>
                    

                    

                    <TouchableOpacity style={styles.filterButton}>
                      <Ionicons
                        name="filter-outline"
                        size={16}
                        color="#5D6F92"
                      />
                      <Text style={styles.filterButtonText}>Filter</Text>
                    </TouchableOpacity>
                  </View>
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
                        <Text style={styles.legendText}>Crime / Theft</Text>
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

                      <View style={styles.legendItem}>
                        <View
                          style={[
                            styles.legendDot,
                            { backgroundColor: "#F29A2E" },
                          ]}
                        />
                        <Text style={styles.legendText}>Flood / Alert</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.feedSection}>
              <View style={styles.sideCard}>
                <View style={styles.sideHeaderRow}>
                  <Text style={styles.sideCardTitle}>
                    Recent Report Activity
                  </Text>

                  <TouchableOpacity
                    onPress={() => router.push("/(admin)/Admin_Validation")}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.viewAllText}>Open</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView
                  style={styles.feedScrollArea}
                  contentContainerStyle={styles.feedScrollContent}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                >
                  {incidentFeed.map((item, index) => (
                    <TouchableOpacity
                      key={item.id || index}
                      style={[
                        styles.feedRow,
                        index !== 0 && styles.feedRowBorder,
                      ]}
                      activeOpacity={0.8}
                      onPress={() => router.push("/(admin)/Admin_Validation")}
                    >
                      <View style={styles.feedTopRow}>
                        <View style={styles.feedTitleWrap}>
                          <Ionicons
                            name="warning"
                            size={17}
                            color="#E45757"
                          />
                          <Text style={styles.feedTitle}>{item.title}</Text>
                        </View>

                        <Text style={styles.feedTime}>{item.time}</Text>
                      </View>

                      <Text style={styles.feedLocation}>{item.location}</Text>

                      <View style={styles.feedStatusRow}>
                        <View
                          style={[
                            styles.feedStatusBadge,
                            { backgroundColor: item.statusBg },
                          ]}
                        >
                          <Text
                            style={[
                              styles.feedStatusText,
                              { color: item.statusColor },
                            ]}
                          >
                            {item.status}
                          </Text>
                        </View>

                        <Text style={styles.feedSource}>
                          Source: {item.source}
                        </Text>
                      </View>

                      <Text style={styles.feedMeta}>
                        AI Credibility Score:{" "}
                        <Text style={styles.feedScore}>{item.score}</Text>
                      </Text>

                      <Text style={styles.feedMeta}>
                        Sentiment:{" "}
                        <Text style={styles.feedSentiment}>
                          {item.sentiment}
                        </Text>
                      </Text>
                    </TouchableOpacity>
                  ))}

                  {incidentFeed.length === 0 ? (
                    <View style={styles.emptyFeed}>
                      <Text style={styles.emptyFeedText}>
                        No reports yet.
                      </Text>
                    </View>
                  ) : null}
                </ScrollView>
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

  middleSection: {
    flexDirection: "row",
    gap: 20,
    alignItems: "flex-start",
    marginBottom: 16,
  },

  mapSection: {
    flex: 1,
    minWidth: 0,
  },

  feedSection: {
    width: 350,
  },

  mainCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 14,
    overflow: "hidden",
  },

  cardHeaderTop: {
    minHeight: 58,
    borderBottomWidth: 1,
    borderBottomColor: "#D9E2F0",
    paddingHorizontal: 20,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F8FBFF",
    gap: 12,
  },

  cardTitle: {
    fontSize: 16,
    fontFamily: "PoppinsSemiBold",
    color: "#294880",
  },

  cardSubtitle: {
    fontSize: 12,
    color: "#6B7A99",
    fontFamily: "PoppinsRegular",
    marginTop: 3,
  },

  cardHeaderControls: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
  },

  controlButton: {
    height: 32,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#CCD6E8",
    borderRadius: 8,
    backgroundColor: "#F9FBFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  controlButtonText: {
    fontSize: 13,
    color: "#5D6F92",
    fontFamily: "PoppinsMedium",
  },

  filterButton: {
    height: 32,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#CCD6E8",
    borderRadius: 8,
    backgroundColor: "#FFFDF8",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  filterButtonText: {
    fontSize: 13,
    color: "#4B5D7A",
    fontFamily: "PoppinsMedium",
  },

  mapCardBody: {
    padding: 12,
    backgroundColor: "#FFFFFF",
  },

  mapArea: {
    height: 410,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    position: "relative",
  },

  legendCard: {
    position: "absolute",
    left: 10,
    bottom: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    zIndex: 1000,
  },

  legendTitle: {
    fontSize: 11,
    fontFamily: "PoppinsSemiBold",
    color: "#4B5D7A",
    marginBottom: 6,
  },

  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },

  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginRight: 6,
  },

  legendText: {
    fontSize: 11,
    color: "#4B5D7A",
    fontFamily: "PoppinsMedium",
  },

  sideCard: {
    height: 500,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 12,
    overflow: "hidden",
  },

  sideHeaderRow: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#D9E2F0",
    backgroundColor: "#F7F9FD",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  sideCardTitle: {
    fontSize: 18,
    fontFamily: "PoppinsSemiBold",
    color: "#294880",
  },

  viewAllText: {
    fontSize: 14,
    fontFamily: "PoppinsSemiBold",
    color: "#294880",
  },

  feedScrollArea: {
    flex: 1,
  },

  feedScrollContent: {
    paddingBottom: 4,
  },

  feedRow: {
    paddingHorizontal: 18,
    paddingVertical: 17,
    backgroundColor: "#FFFFFF",
  },

  feedRowBorder: {
    borderTopWidth: 1,
    borderTopColor: "#E4EAF3",
  },

  feedTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },

  feedTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },

  feedTitle: {
    marginLeft: 7,
    fontSize: 15,
    color: "#111827",
    fontFamily: "PoppinsSemiBold",
    flexShrink: 1,
    lineHeight: 20,
  },

  feedTime: {
    fontSize: 13,
    color: "#7A8BA8",
    fontFamily: "PoppinsMedium",
  },

  feedLocation: {
    fontSize: 14,
    color: "#6D7D99",
    fontFamily: "PoppinsRegular",
    marginBottom: 10,
    marginLeft: 24,
    lineHeight: 19,
  },

  feedStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 24,
    marginBottom: 10,
    gap: 8,
  },

  feedStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },

  feedStatusText: {
    fontSize: 12,
    fontFamily: "PoppinsSemiBold",
  },

  feedSource: {
    fontSize: 13,
    color: "#6D7D99",
    fontFamily: "PoppinsMedium",
  },

  feedMeta: {
    fontSize: 14,
    color: "#6D7D99",
    fontFamily: "PoppinsRegular",
    marginLeft: 24,
    marginBottom: 4,
    lineHeight: 19,
  },

  feedScore: {
    color: "#294880",
    fontFamily: "PoppinsSemiBold",
  },

  feedSentiment: {
    color: "#E45757",
    fontFamily: "PoppinsSemiBold",
  },

  emptyFeed: {
    paddingVertical: 40,
    alignItems: "center",
  },

  emptyFeedText: {
    fontSize: 14,
    color: "#7A8BA8",
    fontFamily: "PoppinsRegular",
  },
};
