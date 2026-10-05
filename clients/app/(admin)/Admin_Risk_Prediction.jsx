import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFonts } from "expo-font";
import Admin_Layout from "../../components/Admin_compo/Admin_Layout";
import apiClient from "../../services/apiClient";
import useAutoRefresh from "../../hooks/useAutoRefresh";
import { getCache, setCache } from "../../services/dataStore";

const EMPTY_FORECAST = {
  zones: [],
  crimeTypes: [],
  recommendedActions: [],
  timeWindow: "",
  activeCount: 0,
  highSeverityCount: 0,
  recentCount: 0,
  priorCount: 0,
};

export default function Admin_Risk_Prediction() {
  const [forecastSummary, setForecastSummary] = useState(() => ({
    ...EMPTY_FORECAST,
    ...(getCache("api:/admin/analytics")?.forecastSummary || {}),
  }));
  const [forecast, setForecast] = useState(() =>
    getCache("api:/admin/analytics")?.forecast || []
  );
  const [loading, setLoading] = useState(
    () => getCache("api:/admin/analytics") === undefined
  );
  const [fontsLoaded] = useFonts({
    PoppinsRegular: require("../../assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("../../assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("../../assets/fonts/Poppins-SemiBold.ttf"),
  });

  const loadPrediction = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;
      const response = await apiClient.get("/admin/analytics", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = response.data ?? {};
      setCache("api:/admin/analytics", data);
      setForecastSummary({ ...EMPTY_FORECAST, ...(data.forecastSummary || {}) });
      setForecast(Array.isArray(data.forecast) ? data.forecast : []);
    } catch {
      // Keep the most recent prediction available when refresh fails.
    } finally {
      setLoading(false);
    }
  }, []);

  useAutoRefresh(loadPrediction, 60000);

  if (!fontsLoaded) return null;

  const maxLikelihood = forecast.reduce(
    (maximum, item) => Math.max(maximum, Number(item.probability) || 0),
    0
  );
  const likelihoodLabel =
    maxLikelihood >= 80 ? "Elevated" : maxLikelihood >= 60 ? "Moderate" : "Low";
  const weeklyChange =
    Number(forecastSummary.recentCount) - Number(forecastSummary.priorCount);

  return (
    <Admin_Layout>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.heading}>
          <Text style={styles.title}>Risk Prediction</Text>
          <Text style={styles.subtitle}>Forecast from recent report patterns and active incident severity</Text>
        </View>

        <View style={styles.overview}>
          <View style={styles.likelihood}>
            <View style={styles.likelihoodIcon}>
              <Ionicons name="pulse-outline" size={24} color="#B33A36" />
            </View>
            <View style={styles.likelihoodText}>
              <Text style={styles.overline}>NEXT 48 HOURS</Text>
              <Text style={styles.likelihoodTitle}>{loading ? "Updating forecast" : `${likelihoodLabel} relative likelihood`}</Text>
              <Text style={styles.muted}>{forecast.length} forecast intervals available</Text>
            </View>
            <Text style={styles.likelihoodValue}>{Math.round(maxLikelihood)}%</Text>
          </View>
          <View style={styles.metrics}>
            <Metric label="Active reports" value={forecastSummary.activeCount} />
            <Metric label="High severity" value={forecastSummary.highSeverityCount} />
            <Metric label="Week over week" value={weeklyChange > 0 ? `+${weeklyChange}` : String(weeklyChange)} />
          </View>
        </View>

        <View style={styles.columns}>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="location-outline" size={18} color="#294880" />
              <Text style={styles.sectionTitle}>Predicted High-Risk Zones</Text>
            </View>
            {forecastSummary.zones.length ? forecastSummary.zones.map((zone, index) => (
              <View key={`${zone.location}-${index}`} style={styles.listRow}>
                <View style={styles.zoneMarker}><Text style={styles.zoneMarkerText}>{index + 1}</Text></View>
                <Text style={styles.listPrimary}>{zone.location || "Unspecified location"}</Text>
                <Text style={styles.listValue}>{zone.count} reports</Text>
              </View>
            )) : <Text style={styles.emptyText}>{loading ? "Loading zone estimates..." : "Insufficient incident data for a zone estimate."}</Text>}
            {!!forecastSummary.timeWindow && (
              <View style={styles.window}>
                <Text style={styles.windowLabel}>Estimated time window</Text>
                <Text style={styles.windowValue}>{forecastSummary.timeWindow}</Text>
              </View>
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="alert-circle-outline" size={18} color="#B96A18" />
              <Text style={styles.sectionTitle}>Predicted Incident Types</Text>
            </View>
            {forecastSummary.crimeTypes.length ? forecastSummary.crimeTypes.map((item, index) => (
              <View key={`${item.label}-${index}`} style={styles.listRow}>
                <View style={[styles.typeDot, { backgroundColor: item.color || "#B96A18" }]} />
                <Text style={styles.listPrimary}>{item.label}</Text>
                <Text style={styles.listValue}>{item.value}</Text>
              </View>
            )) : <Text style={styles.emptyText}>No high-severity reports to base an incident-type estimate on yet.</Text>}
            <View style={styles.window}>
              <Text style={styles.windowLabel}>Recent reports vs. prior week</Text>
              <Text style={styles.windowValue}>{forecastSummary.recentCount} vs. {forecastSummary.priorCount}</Text>
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          <View style={styles.sectionHeader}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#25845C" />
            <Text style={styles.sectionTitle}>Recommended Actions</Text>
          </View>
          {forecastSummary.recommendedActions.length ? forecastSummary.recommendedActions.map((action, index) => (
            <View key={`${action}-${index}`} style={styles.actionRow}>
              <Ionicons name="checkmark-circle-outline" size={18} color="#25845C" />
              <Text style={styles.actionText}>{action}</Text>
            </View>
          )) : <Text style={styles.emptyText}>Recommendations will appear when there is enough incident data.</Text>}
        </View>
      </ScrollView>
    </Admin_Layout>
  );
}

function Metric({ label, value }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value ?? 0}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 24, paddingBottom: 36, gap: 18 },
  heading: { gap: 3 },
  title: { color: "#19263B", fontFamily: "PoppinsSemiBold", fontSize: 23 },
  subtitle: { color: "#63728A", fontFamily: "PoppinsRegular", fontSize: 13 },
  overview: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  likelihood: { flex: 2, minWidth: 300, minHeight: 118, flexDirection: "row", alignItems: "center", gap: 14, padding: 18, borderWidth: 1, borderColor: "#E3D8D5", borderRadius: 6, backgroundColor: "#FFFFFF" },
  likelihoodIcon: { width: 46, height: 46, justifyContent: "center", alignItems: "center", borderRadius: 23, backgroundColor: "#FFF0ED" },
  likelihoodText: { flex: 1, gap: 2 },
  overline: { color: "#9A594E", fontFamily: "PoppinsSemiBold", fontSize: 10 },
  likelihoodTitle: { color: "#26354A", fontFamily: "PoppinsSemiBold", fontSize: 16 },
  muted: { color: "#718096", fontFamily: "PoppinsRegular", fontSize: 11 },
  likelihoodValue: { color: "#B33A36", fontFamily: "PoppinsSemiBold", fontSize: 25 },
  metrics: { flex: 1, minWidth: 260, flexDirection: "row", borderWidth: 1, borderColor: "#DCE3ED", borderRadius: 6, backgroundColor: "#FFFFFF" },
  metric: { flex: 1, justifyContent: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 18, borderRightWidth: 1, borderRightColor: "#E8EDF3" },
  metricValue: { color: "#25354C", fontFamily: "PoppinsSemiBold", fontSize: 19 },
  metricLabel: { color: "#6B788C", fontFamily: "PoppinsRegular", fontSize: 10 },
  columns: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 14 },
  section: { flex: 1, minWidth: 280, paddingHorizontal: 16, borderWidth: 1, borderColor: "#DCE3ED", borderRadius: 6, backgroundColor: "#FFFFFF" },
  sectionHeader: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 9, borderBottomWidth: 1, borderBottomColor: "#E8EDF3" },
  sectionTitle: { color: "#223149", fontFamily: "PoppinsSemiBold", fontSize: 14 },
  listRow: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: "#EDF0F4" },
  zoneMarker: { width: 25, height: 25, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: "#FFF0ED" },
  zoneMarkerText: { color: "#A7433B", fontFamily: "PoppinsSemiBold", fontSize: 11 },
  typeDot: { width: 9, height: 9, borderRadius: 5 },
  listPrimary: { flex: 1, color: "#3B4A5F", fontFamily: "PoppinsMedium", fontSize: 12 },
  listValue: { color: "#607087", fontFamily: "PoppinsMedium", fontSize: 11 },
  window: { paddingVertical: 13, gap: 3 },
  windowLabel: { color: "#738096", fontFamily: "PoppinsRegular", fontSize: 10 },
  windowValue: { color: "#25354C", fontFamily: "PoppinsSemiBold", fontSize: 14 },
  emptyText: { paddingVertical: 18, color: "#718096", fontFamily: "PoppinsRegular", fontSize: 12 },
  actions: { paddingHorizontal: 16, paddingBottom: 10, borderWidth: 1, borderColor: "#DCE3ED", borderRadius: 6, backgroundColor: "#FFFFFF" },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#EDF0F4" },
  actionText: { flex: 1, color: "#43536A", fontFamily: "PoppinsRegular", fontSize: 12 },
});
