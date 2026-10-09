import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFonts } from "expo-font";
import Admin_Layout from "../../components/Admin_compo/Admin_Layout";
import AdminHeatMap from "../../components/Admin_compo/AdminHeatMap";
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

const ARGAO_BARANGAYS = [
  "All Barangays",
  "Binlod",
  "Bulasa",
  "Canbanua",
  "Carungay",
  "Casay",
  "Catang",
  "Cansuje",
  "Guiwanon",
  "Jijon",
  "Lamacan",
  "Langtad",
  "Mantalungon",
  "Poblacion",
  "Taboot",
  "Talaga",
  "Ubaub",
];

export default function Admin_Risk_Prediction() {
  const [forecastSummary, setForecastSummary] = useState(() => ({
    ...EMPTY_FORECAST,
    ...(getCache("api:/admin/analytics")?.forecastSummary || {}),
  }));
  const [forecast, setForecast] = useState(() =>
    getCache("api:/admin/analytics")?.forecast || []
  );
  const [reports, setReports] = useState(() =>
    getCache("api:/admin/dashboard")?.reports || []
  );
  const [loading, setLoading] = useState(
    () => getCache("api:/admin/analytics") === undefined
  );
  
  const [selectedBarangay, setSelectedBarangay] = useState("All Barangays");
  const [selectedMarkerReport, setSelectedMarkerReport] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const [fontsLoaded] = useFonts({
    PoppinsRegular: require("../../assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("../../assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("../../assets/fonts/Poppins-SemiBold.ttf"),
  });

  const loadPrediction = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };
      const [analyticsResult, dashboardResult] = await Promise.allSettled([
        apiClient.get("/admin/analytics", { headers }),
        apiClient.get("/admin/dashboard", { headers }),
      ]);
      if (analyticsResult.status === "fulfilled") {
        const data = analyticsResult.value.data ?? {};
        setCache("api:/admin/analytics", data);
        setForecastSummary({ ...EMPTY_FORECAST, ...(data.forecastSummary || {}) });
        setForecast(Array.isArray(data.forecast) ? data.forecast : []);
      }
      if (dashboardResult.status === "fulfilled") {
        const dashboardData = dashboardResult.value.data ?? {};
        setCache("api:/admin/dashboard", dashboardData);
        setReports(Array.isArray(dashboardData.reports) ? dashboardData.reports : []);
      }
    } catch {
      // Keep recent predictions on error
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
  
  const zones = Array.isArray(forecastSummary.zones) ? forecastSummary.zones : [];
  const crimeTypes = Array.isArray(forecastSummary.crimeTypes) ? forecastSummary.crimeTypes : [];
  
  const normalizedZones = new Set(
    zones.map((zone) => String(zone.location || "").trim().toLowerCase())
  );

  const forecastMapReports = reports.filter((report) => {
    const location = String(report.location || "").trim().toLowerCase();
    const matchesZone = normalizedZones.has(location);
    const matchesBarangay =
      selectedBarangay === "All Barangays" ||
      location.includes(selectedBarangay.toLowerCase());
    
    return (
      matchesZone &&
      matchesBarangay &&
      report.latitude != null &&
      report.longitude != null &&
      Number.isFinite(Number(report.latitude)) &&
      Number.isFinite(Number(report.longitude)) &&
      ["Pending Review", "Under Verification"].includes(report.status)
    );
  });

  const handleMarkerSelect = (report) => {
    setSelectedMarkerReport(report);
  };

  const activeCrimeType = selectedMarkerReport?.crime_type || crimeTypes[0]?.label || "Suspicious Person";
  const activeLocation = selectedMarkerReport?.location || zones[0]?.location || "Argao Area";
  const activeTimeWindow = forecastSummary.timeWindow || "8:00 AM – 12:00 PM";

  const possibleScenario = `${activeCrimeType} may remain a concern around ${activeLocation} during ${activeTimeWindow}, based on recent high-severity reports. This is a planning estimate, not a confirmed incident.`;

  return (
    <Admin_Layout>
      <ScrollView contentContainerStyle={styles.page}>
        

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

        {/* 60% (Map) / 40% (Overview) Split Layout Section */}
        <View style={styles.splitMainRow}>
          
          {/* Left Column: Map Box (60%) */}
          <View style={styles.leftBox60}>
            <View style={styles.boxHeader}>
              <Ionicons name="map-outline" size={18} color="#294880" />
              <Text style={styles.boxHeaderTitle}>Possible Crime Forecast Map</Text>
            </View>

            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Filter by Barangay (Argao):</Text>
              <TouchableOpacity 
                style={styles.dropdownBox} 
                onPress={() => setShowDropdown(!showDropdown)}
              >
                <Text style={styles.dropdownText}>{selectedBarangay}</Text>
                <Ionicons name={showDropdown ? "chevron-up" : "chevron-down"} size={16} color="#63728A" />
              </TouchableOpacity>

              {showDropdown && (
                <View style={styles.dropdownListContainer}>
                  <ScrollView style={{ maxHeight: 160 }} nestedScrollEnabled>
                    {ARGAO_BARANGAYS.map((brgy) => (
                      <TouchableOpacity
                        key={brgy}
                        style={[styles.dropdownItem, selectedBarangay === brgy && styles.dropdownItemActive]}
                        onPress={() => {
                          setSelectedBarangay(brgy);
                          setShowDropdown(false);
                        }}
                      >
                        <Text style={[styles.dropdownItemText, selectedBarangay === brgy && styles.dropdownItemTextActive]}>
                          {brgy}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            <Text style={styles.mapNote}>
              Click any marker on the map to inspect specific report details.
            </Text>

            {forecastMapReports.length ? (
              <View style={styles.mapFrame}>
                <AdminHeatMap reports={forecastMapReports} onMarkerPress={handleMarkerSelect} />
              </View>
            ) : (
              <Text style={styles.emptyText}>
                {loading ? "Loading mapped reports..." : "No active reports match this Barangay filter."}
              </Text>
            )}
          </View>

          {/* Right Column: Details, Recommendations, and Results Box (40%) */}
          <View style={styles.rightBox40}>
            <View style={styles.boxHeader}>
              <Ionicons name="analytics-outline" size={18} color="#223149" />
              <Text style={styles.boxHeaderTitle}>Intelligence & Action Overview</Text>
            </View>

            {/* SECTION 1: Detail of Report Selected in Map */}
            <View style={styles.contentSection}>
              <View style={styles.subHeader}>
                <Ionicons name="alert-circle-outline" size={16} color="#B96A18" />
                <Text style={styles.sectionSubTitle}>
                  {selectedMarkerReport ? `Selected Report Details (${selectedMarkerReport.id || "Marker"})` : "Why it was High Risk (Select a marker)"}
                </Text>
              </View>
              {selectedMarkerReport ? (
                <View style={styles.selectedReportBox}>
                  <Text style={styles.listPrimary}>Type: {selectedMarkerReport.crime_type}</Text>
                  <Text style={styles.listValue}>Location: {selectedMarkerReport.location}</Text>
                  <Text style={styles.listValue}>Status: {selectedMarkerReport.status}</Text>
                  <TouchableOpacity onPress={() => setSelectedMarkerReport(null)} style={styles.clearSelectionBtn}>
                    <Text style={styles.clearSelectionText}>Reset selection</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                crimeTypes.length ? (
                  crimeTypes.map((item, index) => (
                    <View key={`${item.label}-${index}`} style={styles.miniListRow}>
                      <View style={[styles.typeDot, { backgroundColor: item.color || "#B96A18" }]} />
                      <Text style={styles.listPrimary}>{item.label}</Text>
                      <Text style={styles.listValue}>{item.value}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyText}>No high-severity reports available.</Text>
                )
              )}
            </View>

            {/* SECTION 2: Recommendation / Actions Needed */}
            <View style={styles.contentSection}>
              <View style={styles.subHeader}>
                <Ionicons name="shield-checkmark-outline" size={16} color="#25845C" />
                <Text style={styles.sectionSubTitle}>Recommended Action to Take</Text>
              </View>
              {forecastSummary.recommendedActions.length ? (
                forecastSummary.recommendedActions.map((action, index) => (
                  <View key={`${action}-${index}`} style={styles.miniListRow}>
                    <Ionicons name="checkmark-circle-outline" size={14} color="#25845C" />
                    <Text style={styles.actionText}>{action}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>Recommendations will appear when data is sufficient.</Text>
              )}
            </View>

            {/* SECTION 3: Result */}
            <View style={styles.contentSectionLast}>
              <View style={styles.subHeader}>
                <Ionicons name="eye-outline" size={16} color="#294880" />
                <Text style={styles.sectionSubTitle}>Possible Result for the Action</Text>
              </View>
              <Text style={styles.scenarioText}>{possibleScenario}</Text>
            </View>

          </View>
        </View>

        {/* Below the Map: Predicted High Risk Zone */}
        <View style={styles.bottomSection}>
          <View style={styles.boxHeader}>
            <Ionicons name="location-outline" size={18} color="#294880" />
            <Text style={styles.boxHeaderTitle}>List of Predicted High Risk Zones</Text>
          </View>
          {zones.length ? (
            zones.map((zone, index) => (
              <View key={`${zone.location}-${index}`} style={styles.listRow}>
                <View style={styles.zoneMarker}>
                  <Text style={styles.zoneMarkerText}>{index + 1}</Text>
                </View>
                <Text style={styles.listPrimary}>{zone.location || "Unspecified location"}</Text>
                <Text style={styles.listValue}>{zone.count} reports</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>{loading ? "Loading zone estimates..." : "Insufficient incident data."}</Text>
          )}
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

  splitMainRow: { flexDirection: "row", flexWrap: "wrap", gap: 14, alignItems: "stretch" },
  leftBox60: { flex: 6, minWidth: 340, padding: 16, borderWidth: 1, borderColor: "#DCE3ED", borderRadius: 8, backgroundColor: "#FFFFFF", gap: 12 },
  rightBox40: { flex: 4, minWidth: 280, padding: 16, borderWidth: 1, borderColor: "#DCE3ED", borderRadius: 8, backgroundColor: "#FFFFFF", gap: 12 },

  boxHeader: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: 1, borderBottomColor: "#E8EDF3", paddingBottom: 8 },
  boxHeaderTitle: { color: "#223149", fontFamily: "PoppinsSemiBold", fontSize: 14 },

  filterSection: { gap: 6, position: "relative", zIndex: 10 },
  filterLabel: { color: "#3B4A5F", fontFamily: "PoppinsMedium", fontSize: 12 },
  dropdownBox: { height: 40, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, borderWidth: 1, borderColor: "#E8EDF3", borderRadius: 4, backgroundColor: "#FAFBFC" },
  dropdownText: { color: "#607087", fontFamily: "PoppinsRegular", fontSize: 12 },
  dropdownListContainer: { position: "absolute", top: 65, left: 0, right: 0, borderWidth: 1, borderColor: "#DCE3ED", borderRadius: 6, backgroundColor: "#FFFFFF", elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, zIndex: 99 },
  dropdownItem: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: "#F0F3F7" },
  dropdownItemActive: { backgroundColor: "#FFF0ED" },
  dropdownItemText: { color: "#3B4A5F", fontFamily: "PoppinsRegular", fontSize: 12 },
  dropdownItemTextActive: { color: "#B33A36", fontFamily: "PoppinsSemiBold" },

  mapNote: { color: "#718096", fontFamily: "PoppinsRegular", fontSize: 11 },
  mapFrame: { height: 450, overflow: "hidden", borderRadius: 6, marginTop: -2 },

  contentSection: { paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#EDF0F4", gap: 6 },
  contentSectionLast: { paddingBottom: 4, gap: 6 },
  sectionSubTitle: { color: "#223149", fontFamily: "PoppinsSemiBold", fontSize: 12 },

  subHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  selectedReportBox: { gap: 4, paddingVertical: 4 },
  clearSelectionBtn: { marginTop: 4 },
  clearSelectionText: { color: "#B33A36", fontFamily: "PoppinsMedium", fontSize: 11, textDecorationLine: "underline" },

  bottomSection: { padding: 16, borderWidth: 1, borderColor: "#DCE3ED", borderRadius: 8, backgroundColor: "#FFFFFF", gap: 8 },
  listRow: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: "#EDF0F4" },
  miniListRow: { minHeight: 30, flexDirection: "row", alignItems: "center", gap: 8 },
  zoneMarker: { width: 24, height: 24, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#FFF0ED" },
  zoneMarkerText: { color: "#A7433B", fontFamily: "PoppinsSemiBold", fontSize: 11 },
  typeDot: { width: 8, height: 8, borderRadius: 4 },
  listPrimary: { flex: 1, color: "#3B4A5F", fontFamily: "PoppinsMedium", fontSize: 12 },
  listValue: { color: "#607087", fontFamily: "PoppinsMedium", fontSize: 11 },
  scenarioText: { color: "#43536A", fontFamily: "PoppinsRegular", fontSize: 12, lineHeight: 18, paddingTop: 2 },
  emptyText: { paddingVertical: 8, color: "#718096", fontFamily: "PoppinsRegular", fontSize: 12 },
  actionText: { flex: 1, color: "#43536A", fontFamily: "PoppinsRegular", fontSize: 12 },
});