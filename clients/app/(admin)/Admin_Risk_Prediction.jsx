import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFonts } from "expo-font";
import Admin_Layout from "../../components/Admin_compo/Admin_Layout";
import AdminHeatMap from "../../components/Admin_compo/AdminHeatMap";
import apiClient from "../../services/apiClient";
import useAutoRefresh from "../../hooks/useAutoRefresh";
import { getCache, setCache } from "../../services/dataStore";
import { ARGAO_BARANGAYS as ARGAO_BARANGAY_DATA } from "../../constants/argaoMapData";

const ARGAO_BARANGAYS = [
  "All Barangays",
  ...ARGAO_BARANGAY_DATA.map(({ name }) => name),
];

const getLikelihoodTheme = (value) => {
  if (value >= 80) {
    return {
      label: "Elevated",
      color: "#B93838",
      backgroundColor: "#FDEEEE",
      iconColor: "#D94841",
    };
  }
  if (value >= 60) {
    return {
      label: "Moderate",
      color: "#C25E00",
      backgroundColor: "#FFF0E5",
      iconColor: "#E66C00",
    };
  }
  return {
    label: "Low",
    color: "#16794B",
    backgroundColor: "#EAF8F1",
    iconColor: "#37956D",
  };
};

export default function Admin_Risk_Prediction() {
  const scrollViewRef = useRef(null);
  const [reports, setReports] = useState(() =>
    getCache("api:/admin/dashboard")?.reports || []
  );
  const [loading, setLoading] = useState(
    () => getCache("api:/admin/dashboard") === undefined
  );
  
  const [selectedBarangay, setSelectedBarangay] = useState("All Barangays");
  const [selectedMarkerReport, setSelectedMarkerReport] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [commentPage, setCommentPage] = useState(1);
  const COMMENTS_PER_PAGE = 5;

  // Pagination for risk drivers ("Why is it Elevated Risk")
  const [riskDriverPage, setRiskDriverPage] = useState(1);
  const RISK_DRIVERS_PER_PAGE = 5;

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
      const response = await apiClient.get("/admin/dashboard", { headers });
      const dashboardData = response.data ?? {};
      setCache("api:/admin/dashboard", dashboardData);
      if (Array.isArray(dashboardData.reports)) setReports(dashboardData.reports);
    } catch {
      const cached = getCache("api:/admin/dashboard");
      if (Array.isArray(cached?.reports)) setReports(cached.reports);
    } finally {
      setLoading(false);
    }
  }, []);

  useAutoRefresh(loadPrediction, 60000);

  if (!fontsLoaded) return null;

  const isActive = (report) => !["rejected", "marked fake", "archived", "resolved"].includes(
    String(report?.status || "").trim().toLowerCase()
  );
  const reportBarangay = (report) => String(
    report?.barangay || report?.barangay_name || String(report?.location || "").split(",")[0]
  ).trim().toLowerCase();
  const selectedReports = useMemo(() => reports.filter((report) =>
    isActive(report) &&
    (selectedBarangay === "All Barangays" || reportBarangay(report) === selectedBarangay.toLowerCase() ||
     String(report?.location || "").toLowerCase().includes(selectedBarangay.toLowerCase()))
  ), [reports, selectedBarangay]);

  useEffect(() => {
    if (selectedMarkerReport && !selectedReports.some((report) => report.id === selectedMarkerReport.id)) {
      setSelectedMarkerReport(null);
    }
  }, [selectedMarkerReport, selectedReports]);

  useEffect(() => {
    setCommentPage(1);
  }, [selectedMarkerReport?.id]);

  useEffect(() => {
    setRiskDriverPage(1);
  }, [selectedBarangay]);

  const forecastMapReports = selectedReports.filter((report) =>
    report.latitude != null && report.longitude != null &&
    Number.isFinite(Number(report.latitude)) && Number.isFinite(Number(report.longitude))
  );
  const highSeverityCount = selectedReports.filter((report) =>
    ["high", "critical"].includes(String(report.severity || "").toLowerCase())
  ).length;
  const riskScore = Math.min(100, selectedReports.length * 10 + highSeverityCount * 15);
  const likelihoodTheme = getLikelihoodTheme(riskScore);
  const zones = useMemo(() => {
    const grouped = new Map();
    reports.filter(isActive).forEach((report) => {
      const label = report.barangay || report.barangay_name || String(report.location || "").split(",")[0] || "Unspecified location";
      const key = String(label).trim().toLowerCase();
      const current = grouped.get(key) || { location: String(label).trim(), count: 0 };
      current.count += 1;
      grouped.set(key, current);
    });
    return [...grouped.values()].sort((a, b) => b.count - a.count);
  }, [reports]);

  const crimeTypes = useMemo(() => {
    const grouped = new Map();
    selectedReports.forEach((report) => {
      const label = report.incident_type || report.type || report.crime_type || "Other incident";
      grouped.set(label, (grouped.get(label) || 0) + 1);
    });
    return [...grouped.entries()].map(([label, value]) => ({ label, value, color: "#C25E00" }));
  }, [selectedReports]);

  const totalRiskDriverPages = Math.max(1, Math.ceil(crimeTypes.length / RISK_DRIVERS_PER_PAGE));
  const paginatedRiskDrivers = crimeTypes.slice(
    (riskDriverPage - 1) * RISK_DRIVERS_PER_PAGE,
    riskDriverPage * RISK_DRIVERS_PER_PAGE
  );

  const riskReason = useMemo(() => {
    if (!selectedReports.length) return "No active incident reports are currently recorded for this selection.";
    const types = crimeTypes.slice(0, 6).map((item) => `${item.label} (${item.value})`).join(", ");
    const severity = highSeverityCount
      ? `${highSeverityCount} high or critical-severity report${highSeverityCount === 1 ? "" : "s"}`
      : "no high or critical-severity reports";
    return `${selectedReports.length} active report${selectedReports.length === 1 ? "" : "s"} are driving this assessment: ${types || "reported incidents"}. Of these, ${severity}.`;
  }, [selectedReports, crimeTypes, highSeverityCount]);

  const recommendedActions = useMemo(() => {
    const types = new Set(selectedReports.map((report) => String(report.incident_type || report.type || "").toLowerCase()));
    const actions = [];
    if (selectedReports.length) actions.push(`Prioritize barangay response and verify all ${selectedReports.length} active incident report${selectedReports.length === 1 ? "" : "s"}.`);
    if ([...types].some((type) => /fire|flood|drainage|garbage/.test(type))) actions.push("Coordinate with disaster and environmental response teams for the reported hazard.");
    if ([...types].some((type) => /theft|harass|disturb|suspicious|traffic|accident|vandal/.test(type))) actions.push("Increase patrol and coordinate with local safety officers around the reported locations.");
    if (!actions.length) actions.push("Continue monitoring; no active incident reports require immediate action.");
    return actions;
  }, [selectedReports]);

  const activeCount = selectedReports.length;
  const weeklyChange = 0;
  const maxLikelihood = riskScore;
  const mapFocusTarget = selectedBarangay !== "All Barangays"
    ? (() => { const place = ARGAO_BARANGAY_DATA.find((item) => item.name.toLowerCase() === selectedBarangay.toLowerCase()); return place ? { latitude: place.lat, longitude: place.lng, zoom: 16 } : null; })()
    : null;

  const handleMarkerSelect = (report) => {
    setSelectedMarkerReport(report);
  };

  const handleZoneSelect = (zone) => {
    const zoneName = String(zone?.location || "").trim();
    if (!zoneName) return;

    const zoneLabel = zoneName.split(",")[0].trim().toLowerCase();
    const canonicalBarangay = ARGAO_BARANGAY_DATA.find(
      (barangay) => barangay.name.toLowerCase() === zoneName.toLowerCase() ||
        barangay.name.toLowerCase() === zoneLabel
    )?.name || zoneName;

    // The existing dashboard data remains the source of truth. Changing the
    // filter recalculates selectedReports, the map, and the right-side panel.
    setSelectedBarangay(canonicalBarangay);
    setSelectedMarkerReport(null);
    setShowDropdown(false);

    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    });
  };

  const activeCrimeType = selectedMarkerReport?.crime_type || selectedMarkerReport?.incident_type || crimeTypes[0]?.label || "active incidents";
  const activeLocation = selectedMarkerReport?.location || selectedBarangay;
  const possibleScenario = `${recommendedActions[0]} If implemented, this should reduce unresolved ${activeCrimeType.toLowerCase()} reports in ${activeLocation} and improve response visibility.`;
  const selectedComments = selectedMarkerReport?.comments || [];
  const totalCommentPages = Math.max(1, Math.ceil(selectedComments.length / COMMENTS_PER_PAGE));
  const paginatedComments = selectedComments.slice(
    (commentPage - 1) * COMMENTS_PER_PAGE,
    commentPage * COMMENTS_PER_PAGE
  );

  return (
    <Admin_Layout>
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        
        {/* SUMMARY HEADER WITH DYNAMIC COLOR CODING */}
        <View style={styles.overview}>
          <View style={styles.likelihood}>
            <View style={[styles.likelihoodIcon, { backgroundColor: likelihoodTheme.backgroundColor }]}>
              <Ionicons name="pulse-outline" size={22} color={likelihoodTheme.iconColor} />
            </View>
            <View style={styles.likelihoodText}>
              <View style={styles.overlineRow}>
                <Ionicons name="time-outline" size={12} color={likelihoodTheme.color} />
                <Text style={[styles.overline, { color: likelihoodTheme.color }]}>NEXT 48 HOURS</Text>
              </View>
              <Text style={styles.likelihoodTitle}>
                {loading ? "Updating forecast..." : `${likelihoodTheme.label} relative likelihood`}
              </Text>
              <Text style={styles.muted}>
               
              </Text>
            </View>
            <View style={[styles.likelihoodValueBadge, { backgroundColor: likelihoodTheme.backgroundColor }]}>
              <Ionicons name="trending-up-outline" size={14} color={likelihoodTheme.color} />
              <Text style={[styles.likelihoodValue, { color: likelihoodTheme.color }]}>{Math.round(maxLikelihood)}%</Text>
            </View>
          </View>

          <View style={styles.metrics}>
            <Metric 
              icon="document-text-outline" 
              label="Active reports" 
              value={activeCount}
              valueColor="#294880"
            />
            <Metric 
              icon="warning-outline" 
              label="High severity" 
              value={highSeverityCount}
              valueColor={highSeverityCount > 0 ? "#B93838" : "#16794B"}
            />
            <Metric 
              icon="stats-chart-outline" 
              label="Week over week" 
              value={weeklyChange > 0 ? `+${weeklyChange}` : String(weeklyChange)} 
              valueColor={weeklyChange > 0 ? "#C25E00" : "#16794B"}
            />
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

            {/* FILTER PANEL */}
            <View style={styles.filterCard}>
              <View style={styles.filterLineRow}>
                <View style={styles.filterIconBadge}>
                  <Ionicons name="options-outline" size={16} color="#294880" />
                </View>
                <Text style={styles.filterCardTitle}>Barangay</Text>

                <TouchableOpacity
                  style={styles.dropdownBox}
                  onPress={() => setShowDropdown(!showDropdown)}
                >
                  <View style={styles.dropdownLabelRow}>
                    <Ionicons name="location-outline" size={16} color="#294880" />
                    <Text style={styles.dropdownText}>{selectedBarangay}</Text>
                  </View>
                  <Ionicons name={showDropdown ? "chevron-up" : "chevron-down"} size={16} color="#63728A" />
                </TouchableOpacity>

                {selectedBarangay !== "All Barangays" && (
                  <TouchableOpacity onPress={() => {
                    setSelectedBarangay("All Barangays");
                    setSelectedMarkerReport(null);
                  }} style={styles.resetFilterButton}>
                    <Ionicons name="refresh-circle-outline" size={16} color="#294880" />
                    <Text style={styles.resetFilterButtonText}>Reset</Text>
                  </TouchableOpacity>
                )}
              </View>

              {showDropdown && (
                <View style={styles.dropdownListContainer}>
                  <ScrollView
                    style={{ maxHeight: 160, scrollbarWidth: "none", msOverflowStyle: "none" }}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={false}
                  >
                    {ARGAO_BARANGAYS.map((brgy) => (
                      <TouchableOpacity
                        key={brgy}
                        style={[styles.dropdownItem, selectedBarangay === brgy && styles.dropdownItemActive]}
                        onPress={() => {
                          setSelectedBarangay(brgy);
                          setSelectedMarkerReport(null);
                          setShowDropdown(false);
                        }}
                      >
                        <Ionicons 
                          name={selectedBarangay === brgy ? "checkmark-circle" : "ellipse-outline"} 
                          size={14} 
                          color={selectedBarangay === brgy ? "#294880" : "#82918B"} 
                        />
                        <Text style={[styles.dropdownItemText, selectedBarangay === brgy && styles.dropdownItemTextActive]}>
                          {brgy}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            

            {forecastMapReports.length ? (
              <View style={styles.mapFrame}>
                <AdminHeatMap reports={forecastMapReports} focusTarget={mapFocusTarget} onReportSelect={handleMarkerSelect} />
              </View>
            ) : (
              <View style={styles.emptyMapState}>
                <Ionicons name="map-outline" size={32} color="#91A39B" />
                <Text style={styles.emptyText}>
                  {loading ? "Loading mapped reports..." : "No active reports match this Barangay filter."}
                </Text>
              </View>
            )}
          </View>

          {/* Right Column: Details, Recommendations, and Results Box (40%) */}
          <View style={styles.rightBox40}>
            <View style={styles.boxHeader}>
              <Ionicons name="analytics-outline" size={18} color="#294880" />
              <Text style={styles.boxHeaderTitle}>Intelligence & Action Overview</Text>
            </View>

            {/* SECTION 1: Detail of Report Selected in Map / Risk Drivers with Pagination */}
            <View style={styles.contentSection}>
              <View style={styles.subHeaderBetween}>
                <View style={styles.subHeader}>
                  <Ionicons name="alert-circle-outline" size={16} color="#C25E00" />
                  <Text style={styles.sectionSubTitle}>
                    {selectedMarkerReport ? `Selected Report Details (${selectedMarkerReport.id || "Marker"})` : `Why is it ${likelihoodTheme.label} Risk`}
                  </Text>
                </View>

                {/* Pagination Controls for Risk Drivers Header */}
                {!selectedMarkerReport && crimeTypes.length > RISK_DRIVERS_PER_PAGE && (
                  <View style={styles.paginationRowCompact}>
                    <TouchableOpacity
                      disabled={riskDriverPage === 1}
                      onPress={() => setRiskDriverPage((page) => Math.max(1, page - 1))}
                      style={[styles.pageButtonCompact, riskDriverPage === 1 && styles.pageButtonDisabled]}
                    >
                      <Ionicons name="chevron-back" size={12} color="#294880" />
                    </TouchableOpacity>
                    <Text style={styles.pageIndicatorCompact}>{riskDriverPage}/{totalRiskDriverPages}</Text>
                    <TouchableOpacity
                      disabled={riskDriverPage === totalRiskDriverPages}
                      onPress={() => setRiskDriverPage((page) => Math.min(totalRiskDriverPages, page + 1))}
                      style={[styles.pageButtonCompact, riskDriverPage === totalRiskDriverPages && styles.pageButtonDisabled]}
                    >
                      <Ionicons name="chevron-forward" size={12} color="#294880" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {selectedMarkerReport ? (
                <>
                  <Text style={styles.riskReason}>{riskReason}</Text>
                  <View style={styles.selectedReportBox}>
                    <View style={styles.reportDetailRow}>
                      <Ionicons name="pricetag-outline" size={13} color="#294880" />
                      <Text style={styles.listPrimary}>Type: {selectedMarkerReport.crime_type || selectedMarkerReport.incident_type || selectedMarkerReport.type || "Incident"}</Text>
                    </View>
                    <View style={styles.reportDetailRow}>
                      <Ionicons name="pin-outline" size={13} color="#647B75" />
                      <Text style={styles.listValue}>Location: {selectedMarkerReport.location}</Text>
                    </View>
                    <View style={styles.reportDetailRow}>
                      <Ionicons name="flag-outline" size={13} color="#C25E00" />
                      <Text style={[styles.listValue, { color: "#C25E00" }]}>Status: {selectedMarkerReport.status}</Text>
                    </View>
                    <View style={styles.sentimentSection}>
                      <View style={styles.commentsHeading}>
                        <Text style={styles.infoLabel}>Comments & sentiment</Text>
                        <Text style={styles.commentCount}>{selectedComments.length}</Text>
                      </View>
                      {paginatedComments.length ? paginatedComments.map((comment, index) => (
                        <View key={comment.id || index} style={styles.commentItem}>
                          <Text style={styles.commentBody}>{comment.text || comment.body || ""}</Text>
                          <Text style={styles.commentMeta}>{comment.user || "User"}{comment.sentiment ? ` · ${comment.sentiment}` : ""}</Text>
                        </View>
                      )) : (
                        <Text style={styles.emptyText}>No comments or sentiment data available.</Text>
                      )}
                      {selectedComments.length > COMMENTS_PER_PAGE && (
                        <View style={styles.paginationRow}>
                          <TouchableOpacity
                            disabled={commentPage === 1}
                            onPress={() => setCommentPage((page) => Math.max(1, page - 1))}
                            style={[styles.pageButton, commentPage === 1 && styles.pageButtonDisabled]}
                          >
                            <Text style={styles.pageButtonText}>Previous</Text>
                          </TouchableOpacity>
                          <Text style={styles.pageIndicator}>Page {commentPage} of {totalCommentPages}</Text>
                          <TouchableOpacity
                            disabled={commentPage === totalCommentPages}
                            onPress={() => setCommentPage((page) => Math.min(totalCommentPages, page + 1))}
                            style={[styles.pageButton, commentPage === totalCommentPages && styles.pageButtonDisabled]}
                          >
                            <Text style={styles.pageButtonText}>Next</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                    <TouchableOpacity onPress={() => setSelectedMarkerReport(null)} style={styles.clearSelectionBtn}>
                      <Ionicons name="close-circle-outline" size={13} color="#294880" />
                      <Text style={styles.clearSelectionText}>Reset selection</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                crimeTypes.length ? (
                  <>
                    <Text style={styles.emptyText}>
                      {riskReason}
                    </Text>
                    {paginatedRiskDrivers.map((item, index) => (
                      <View key={`${item.label}-${index}`} style={styles.miniListRow}>
                        <View style={[styles.typeDot, { backgroundColor: item.color || "#C25E00" }]} />
                        <Text style={styles.listPrimary}>{item.label}</Text>
                        <Text style={[styles.listValue, { color: "#C25E00" }]}>{item.value}</Text>
                      </View>
                    ))}
                  </>
                ) : (
                  <Text style={styles.emptyText}>No high-severity reports available.</Text>
                )
              )}
            </View>

            {/* SECTION 2: Recommendation / Actions Needed */}
            <View style={styles.contentSection}>
              <View style={styles.subHeader}>
                <Ionicons name="shield-checkmark-outline" size={16} color="#16794B" />
                <Text style={styles.sectionSubTitle}>Recommended Action to Take</Text>
              </View>
              {recommendedActions.length ? (
                recommendedActions.map((action, index) => (
                  <View key={`${action}-${index}`} style={styles.miniListRow}>
                    <Ionicons name="checkmark-circle" size={14} color="#16794B" />
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
                <Ionicons name="bulb-outline" size={16} color="#294880" />
                <Text style={styles.sectionSubTitle}>Possible Result for the Action</Text>
              </View>
              <Text style={styles.scenarioText}>{possibleScenario}</Text>
            </View>

          </View>
        </View>

        {/* Below the Map: Predicted High Risk Zone */}
        <View style={styles.bottomSection}>
          <View style={styles.boxHeader}>
            <Ionicons name="list-outline" size={18} color="#294880" />
            <Text style={styles.boxHeaderTitle}>List of Predicted High Risk Zones</Text>
          </View>
          {zones.length ? (
            zones.map((zone, index) => (
              <TouchableOpacity
                key={`${zone.location}-${index}`}
                onPress={() => handleZoneSelect(zone)}
                activeOpacity={0.8}
                style={styles.listRow}
              >
                <View style={styles.zoneMarker}>
                  <Text style={styles.zoneMarkerText}>{index + 1}</Text>
                </View>
                <Ionicons name="location-sharp" size={15} color="#294880" />
                <Text style={styles.listPrimary}>{zone.location || "Unspecified location"}</Text>
                <View style={styles.countBadge}>
                  <Ionicons name="document-text-outline" size={12} color="#647B75" />
                  <Text style={styles.listValue}>{zone.count} reports</Text>
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <Text style={styles.emptyText}>{loading ? "Loading zone estimates..." : "Insufficient incident data."}</Text>
          )}
        </View>

      </ScrollView>
    </Admin_Layout>
  );
}

function Metric({ icon, label, value, valueColor = "#294880" }) {
  return (
    <View style={styles.metric}>
      <View style={styles.metricHeader}>
        <Ionicons name={icon} size={15} color={valueColor} />
        <Text style={[styles.metricValue, { color: valueColor }]}>{value ?? 0}</Text>
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 24, paddingBottom: 36, gap: 18 },
  
  overview: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  likelihood: { 
    flex: 2, 
    minWidth: 300, 
    minHeight: 110, 
    flexDirection: "row", 
    alignItems: "center", 
    gap: 14, 
    padding: 18, 
    borderWidth: 1, 
    borderColor: "#D9E2F0", 
    borderRadius: 14, 
    backgroundColor: "#FFFFFF" 
  },
  likelihoodIcon: { width: 46, height: 46, justifyContent: "center", alignItems: "center", borderRadius: 12 },
  likelihoodText: { flex: 1, gap: 2 },
  overlineRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  overline: { fontFamily: "PoppinsSemiBold", fontSize: 10, letterSpacing: 0.5 },
  likelihoodTitle: { color: "#294880", fontFamily: "PoppinsSemiBold", fontSize: 16 },
  muted: { color: "#647B75", fontFamily: "PoppinsRegular", fontSize: 11 },
  likelihoodValueBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  likelihoodValue: { fontFamily: "PoppinsSemiBold", fontSize: 18 },
  
  metrics: { 
    flex: 1, 
    minWidth: 260, 
    flexDirection: "row", 
    borderWidth: 1, 
    borderColor: "#D9E2F0", 
    borderRadius: 14, 
    backgroundColor: "#FFFFFF",
    overflow: "hidden"
  },
  metric: { flex: 1, justifyContent: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 18, borderRightWidth: 1, borderRightColor: "#E8EDF3" },
  metricHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  metricValue: { fontFamily: "PoppinsSemiBold", fontSize: 18 },
  metricLabel: { color: "#647B75", fontFamily: "PoppinsRegular", fontSize: 10 },

  splitMainRow: { flexDirection: "row", flexWrap: "wrap", gap: 14, alignItems: "stretch" },
  leftBox60: { flex: 6, minWidth: 340, padding: 16, borderWidth: 1, borderColor: "#D9E2F0", borderRadius: 14, backgroundColor: "#FFFFFF", gap: 12 },
  rightBox40: { flex: 4, minWidth: 280, padding: 16, borderWidth: 1, borderColor: "#D9E2F0", borderRadius: 14, backgroundColor: "#FFFFFF", gap: 12 },

  boxHeader: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: 1, borderBottomColor: "#E8EDF3", paddingBottom: 8 },
  boxHeaderTitle: { color: "#294880", fontFamily: "PoppinsSemiBold", fontSize: 14 },

  filterCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 0,
    gap: 12,
    position: "relative",
    zIndex: 10,
  },
  filterLineRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  filterTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  filterIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#EAF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  filterCardTitle: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 13,
    color: "#294880",
  },
  filterCardSubtitle: {
    fontFamily: "PoppinsRegular",
    fontSize: 10,
    color: "#5D6F92",
  },
  resetFilterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    backgroundColor: "#FFFFFF",
  },
  resetFilterButtonText: {
    fontFamily: "PoppinsMedium",
    fontSize: 10,
    color: "#294880",
  },
  dropdownBox: { flex: 1, minWidth: 0, height: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, borderWidth: 1, borderColor: "#D9E2F0", borderRadius: 10, backgroundColor: "#FFFFFF" },
  dropdownLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dropdownText: { color: "#294880", fontFamily: "PoppinsMedium", fontSize: 12 },
  dropdownListContainer: { position: "absolute", top: 48, left: 0, right: 0, maxHeight: 260, borderWidth: 1, borderColor: "#DCE3ED", borderRadius: 10, backgroundColor: "#FFFFFF", elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, zIndex: 99 },
  dropdownItem: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: "#F0F3F7" },
  dropdownItemActive: { backgroundColor: "#EAF2FF" },
  dropdownItemText: { color: "#3B4A5F", fontFamily: "PoppinsRegular", fontSize: 12 },
  dropdownItemTextActive: { color: "#294880", fontFamily: "PoppinsSemiBold" },

  mapNoteBox: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#F2F6FC", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  mapNote: { flex: 1, color: "#4B5D7A", fontFamily: "PoppinsRegular", fontSize: 11 },
  mapFrame: { height: 450, overflow: "hidden", borderRadius: 8, borderWidth: 1, borderColor: "#E5EBEA" },
  emptyMapState: { height: 180, alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 8, backgroundColor: "#F8FAF9", borderWidth: 1, borderColor: "#E5EBEA" },

  contentSection: { paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#EDF0F4", gap: 6 },
  contentSectionLast: { paddingBottom: 4, gap: 6 },
  sectionSubTitle: { color: "#223149", fontFamily: "PoppinsSemiBold", fontSize: 12 },

  subHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  subHeaderBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  selectedReportBox: { gap: 6, paddingVertical: 4 },
  reportDetailRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  sentimentSection: { marginTop: 8, gap: 5, borderTopWidth: 1, borderTopColor: "#EDF0F4", paddingTop: 8 },
  infoLabel: { color: "#647B75", fontFamily: "PoppinsSemiBold", fontSize: 10, textTransform: "uppercase" },
  riskReason: { color: "#43536A", fontFamily: "PoppinsRegular", fontSize: 11, lineHeight: 16, paddingVertical: 4 },
  commentsHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  commentCount: { color: "#607087", fontFamily: "PoppinsMedium", fontSize: 10 },
  commentItem: { paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: "#EDF0F4", gap: 2 },
  commentBody: { color: "#43536A", fontFamily: "PoppinsRegular", fontSize: 11, lineHeight: 15 },
  commentMeta: { color: "#718096", fontFamily: "PoppinsRegular", fontSize: 9 },
  paginationRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6, marginTop: 6 },
  pageButton: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, backgroundColor: "#E8EFFB" },
  pageButtonDisabled: { opacity: 0.45 },
  pageButtonText: { color: "#294880", fontFamily: "PoppinsMedium", fontSize: 10 },
  pageIndicator: { color: "#607087", fontFamily: "PoppinsMedium", fontSize: 10 },
  
  paginationRowCompact: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#F0F4F9", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  pageButtonCompact: { padding: 2 },
  pageIndicatorCompact: { color: "#294880", fontFamily: "PoppinsSemiBold", fontSize: 10 },

  clearSelectionBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  clearSelectionText: { color: "#294880", fontFamily: "PoppinsMedium", fontSize: 11, textDecorationLine: "underline" },

  bottomSection: { padding: 16, borderWidth: 1, borderColor: "#D9E2F0", borderRadius: 14, backgroundColor: "#FFFFFF", gap: 8 },
  listRow: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: 1, borderBottomColor: "#EDF0F4" },
  miniListRow: { minHeight: 30, flexDirection: "row", alignItems: "center", gap: 8 },
  zoneMarker: { width: 24, height: 24, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#E8EFFB" },
  zoneMarkerText: { color: "#294880", fontFamily: "PoppinsSemiBold", fontSize: 11 },
  typeDot: { width: 8, height: 8, borderRadius: 4 },
  listPrimary: { flex: 1, color: "#3B4A5F", fontFamily: "PoppinsMedium", fontSize: 12 },
  countBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  listValue: { color: "#607087", fontFamily: "PoppinsMedium", fontSize: 11 },
  scenarioText: { color: "#43536A", fontFamily: "PoppinsRegular", fontSize: 12, lineHeight: 18, paddingTop: 2 },
  emptyText: { paddingVertical: 8, color: "#718096", fontFamily: "PoppinsRegular", fontSize: 12 },
  actionText: { flex: 1, color: "#43536A", fontFamily: "PoppinsRegular", fontSize: 12 },
});
