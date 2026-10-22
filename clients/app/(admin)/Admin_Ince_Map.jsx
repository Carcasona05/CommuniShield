import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFonts } from "expo-font";
import Admin_Layout from "../../components/Admin_compo/Admin_Layout";
import AdminHeatMap from "../../components/Admin_compo/AdminHeatMap";
import {
  BatchFilterDropdown,
  BatchDateRangeDropdown,
} from "../../components/Admin_compo/AdminBatchFilters";
import { ARGAO_BARANGAYS } from "../../constants/argaoMapData";
import useAutoRefresh from "../../hooks/useAutoRefresh";
import apiClient from "../../services/apiClient";
import { getCache, setCache } from "../../services/dataStore";
import { getReportBarangay, getReportLocationHierarchy } from "../../services/argaoLocation";

const INCIDENT_CATEGORIES = [
  {
    category: "Public Safety Incidents",
    types: ["Public Disturbance", "Harassment", "Loitering / Suspicious Presence", "Trespassing"],
  },
  {
    category: "Property-Related Incidents",
    types: ["Theft", "Lost Property", "Vandalism / Property Damage", "Shoplifting"],
  },
  {
    category: "Traffic and Road Incidents",
    types: ["Vehicular Accident", "Reckless Driving", "Illegal Parking", "Road Obstruction"],
  },
  {
    category: "Community and Environmental Concerns",
    types: ["Fire Incident", "Flooding", "Blocked Drainage", "Garbage / Sanitation Issues", "Streetlight Outage"],
  },
  {
    category: "Suspicious Activities",
    types: ["Suspicious Person", "Suspicious Vehicle", "Unattended / Abandoned Object", "Unusual Behavior", "Loitering / Suspicious Presence"],
  },
  {
    category: "Public Assistance / Community Reports",
    types: ["Missing Pet", "Lost Item", "Request for Assistance", "General Safety Concern"],
  },
  {
    category: "Cyber and Online Incidents (Non-sensitive)",
    types: ["Online Scam / Suspicious Message", "Cyberbullying", "Fake Information / Misinformation"],
  },
];

const ARGAO_BARANGAY_COORDINATES = Object.fromEntries(
  ARGAO_BARANGAYS.map(({ name, lat, lng }) => [name, {
    latitude: lat,
    longitude: lng,
    zoom: 16,
  }])
);
ARGAO_BARANGAY_COORDINATES.Default = { latitude: 9.8816, longitude: 123.5953, zoom: 14 };

const normalizeText = (value) => String(value ?? "").trim();

const getReportDate = (report) => {
  const value = report?.created_at || report?.reported_at || report?.date;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getLocation = (report) => {
  const barangay = getReportBarangay(report);
  if (barangay) return barangay;
  return "Barangay not specified";
};

const hasCoordinates = (report) => {
  if (report?.latitude == null || report?.longitude == null) return false;
  const lat = Number(report.latitude);
  const lng = Number(report.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
};

const getMapCenterCoordinates = (reportsList, selectedBarangay) => {
  // A barangay filter must focus the same hall pin shown by User_Map. Report
  // coordinates are only used for an individual hotspot with no barangay filter.
  if (selectedBarangay && selectedBarangay !== "All" && ARGAO_BARANGAY_COORDINATES[selectedBarangay]) {
    return ARGAO_BARANGAY_COORDINATES[selectedBarangay];
  }

  const mappedReports = (reportsList || []).filter(hasCoordinates);
  
  if (mappedReports.length > 0) {
    const totals = mappedReports.reduce(
      (sum, report) => ({
        latitude: sum.latitude + Number(report.latitude),
        longitude: sum.longitude + Number(report.longitude),
      }),
      { latitude: 0, longitude: 0 }
    );

    return {
      latitude: totals.latitude / mappedReports.length,
      longitude: totals.longitude / mappedReports.length,
      zoom: 10,
    };
  }

  return ARGAO_BARANGAY_COORDINATES.Default;
};

const getSentimentCounts = (report) => {
  const counts = { positive: 0, negative: 0, neutral: 0 };
  (report?.comments || []).forEach((comment) => {
    const label = normalizeText(comment?.sentiment).toLowerCase();
    if (label in counts) counts[label] += 1;
  });
  return counts;
};

const getStatusColors = (status) => {
  if (["Rejected", "Marked Fake"].includes(status)) return { color: "#B93838", background: "#FDEEEE" };
  if (["Resolved", "Verified"].includes(status)) return { color: "#16794B", background: "#EAF8F1" };
  if (["Under Verification", "Pending Review", "Pending"].includes(status)) return { color: "#A96512", background: "#FFF4E5" };
  return { color: "#4B5D7A", background: "#EEF2F8" };
};

const getSeverityColors = (severity) => {
  switch (String(severity || "Medium").toLowerCase()) {
    case "critical": return { color: "#B93838", background: "#FDEEEE" };
    case "high": return { color: "#A96512", background: "#FFF2E1" };
    case "low": return { color: "#16794B", background: "#EAF8F1" };
    default: return { color: "#856000", background: "#FFF6D8" };
  }
};

const getLevel = (count) => {
  if (count >= 10) return "Critical";
  if (count >= 5) return "High";
  if (count >= 3) return "Moderate";
  return "Low";
};

export default function Admin_Ince_Map() {
  const scrollViewRef = useRef(null);
  const [workspaceY, setWorkspaceY] = useState(0);
  const [workspaceWidth, setWorkspaceWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [filtersHeight, setFiltersHeight] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailProgress = useRef(new Animated.Value(0)).current;

  const { width } = useWindowDimensions();
  const isNarrow = width < 900;
  // Fill the space below the filters, rather than stretching a card around a
  // fixed-height map. On small screens the details still expand below the map.
  const mapWorkspaceHeight = Math.max(380, viewportHeight - filtersHeight - 64);
  
  // Backend data states with local caching support
  const [reports, setReports] = useState(() => getCache("api:/admin/dashboard")?.reports || []);
  const [loading, setLoading] = useState(() => getCache("api:/admin/dashboard") === undefined);

  const [selectedBarangay, setSelectedBarangay] = useState("All");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedIncidentType, setSelectedIncidentType] = useState("All");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [selectedReportId, setSelectedReportId] = useState(null);
  const [selectedHotspotKey, setSelectedHotspotKey] = useState(null);

  // Comment pagination state (limit 5 per page)
  const [commentPage, setCommentPage] = useState(1);
  const COMMENTS_PER_PAGE = 5;

  const [fontsLoaded] = useFonts({
    PoppinsRegular: require("../../assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("../../assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("../../assets/fonts/Poppins-SemiBold.ttf"),
  });

  // Backend Data Fetching Logic via apiClient
  const loadReports = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;
      
      const headers = { Authorization: `Bearer ${token}` };
      const response = await apiClient.get("/admin/dashboard", { headers });
      const data = response.data ?? {};
      setCache("api:/admin/dashboard", data);
      if (Array.isArray(data.reports)) setReports(data.reports);
    } catch {
      const cached = getCache("api:/admin/dashboard");
      if (Array.isArray(cached?.reports)) setReports(cached.reports);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useAutoRefresh(loadReports, 60000);

  useEffect(() => {
    if (selectedCategory === "All") {
      setSelectedIncidentType("All");
      return;
    }
    const allowedTypes = INCIDENT_CATEGORIES.find((item) => item.category === selectedCategory)?.types || [];
    if (!allowedTypes.includes(selectedIncidentType)) setSelectedIncidentType("All");
  }, [selectedCategory, selectedIncidentType]);

  const incidentTypeOptions = useMemo(() => {
    const categories = selectedCategory === "All"
      ? INCIDENT_CATEGORIES
      : INCIDENT_CATEGORIES.filter((item) => item.category === selectedCategory);
    const types = [...new Set(categories.flatMap((item) => item.types))];
    return [
      { value: "All", label: "All Incident Types" },
      ...types.map((type) => ({ value: type, label: type })),
    ];
  }, [selectedCategory]);

  const filteredReports = useMemo(() => {
    const start = from ? new Date(`${from}T00:00:00`) : null;
    const end = to ? new Date(`${to}T23:59:59.999`) : null;

    return reports.filter((report) => {
      if (report.status === "Rejected" || report.status === "Archived")
        return false;
      const barangay = getReportBarangay(report);
      
      if (selectedBarangay === "__unresolved__" ? Boolean(barangay) : selectedBarangay !== "All" && barangay !== selectedBarangay) return false;
      if (selectedCategory !== "All" && normalizeText(report.incident_category || report.category) !== selectedCategory) return false;
      if (selectedIncidentType !== "All" && normalizeText(report.incident_type || report.type) !== selectedIncidentType) return false;

      const date = getReportDate(report);
      const matchesDate =
        (!start || (date && Number.isFinite(date.getTime()) && date >= start)) &&
        (!end || (date && Number.isFinite(date.getTime()) && date <= end));

      return matchesDate;
    });
  }, [from, reports, selectedBarangay, selectedCategory, selectedIncidentType, to]);

  const mapReports = useMemo(() => filteredReports.map((report) => ({
    ...report,
    barangay: getReportBarangay(report),
    location: getReportLocationHierarchy(report).label,
  })), [filteredReports]);

  // Hotspot Grouping & Severity Backend Processing Logic
  const hotspots = useMemo(() => {
    const groups = new Map();
    filteredReports.forEach((report) => {
      const location = getLocation(report);
      if (location === "Barangay not specified") return;
      const key = location.toLowerCase();
      if (!groups.has(key)) {
        groups.set(key, { key, location, reports: [] });
      }
      groups.get(key).reports.push(report);
    });
    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        count: group.reports.length,
        level: getLevel(group.reports.length),
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredReports]);

  const selectedHotspot = hotspots.find((h) => h.key === selectedHotspotKey) || null;

  const mapFocusTarget = useMemo(() => {
    return getMapCenterCoordinates(filteredReports, selectedBarangay);
  }, [filteredReports, selectedBarangay]);

  const selectedReport = filteredReports.find((report) => report.id === selectedReportId) || null;

  useEffect(() => {
    // Filtering/refreshing must not silently select the first unrelated report.
    if (!selectedReport) {
      setDetailsOpen(false);
      setSelectedReportId(null);
      setSelectedHotspotKey(null);
    }
  }, [selectedReport]);

  useEffect(() => {
    setCommentPage(1);
  }, [selectedReportId]);

  useEffect(() => {
    const animation = Animated.timing(detailProgress, {
      toValue: detailsOpen ? 1 : 0,
      duration: 280,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [detailProgress, detailsOpen]);

  const clearSelection = () => {
    setDetailsOpen(false);
    setSelectedReportId(null);
    setSelectedHotspotKey(null);
  };
  const sentimentCounts = getSentimentCounts(selectedReport);
  const sentimentTotal = sentimentCounts.positive + sentimentCounts.negative + sentimentCounts.neutral;
  const statusColors = getStatusColors(selectedReport?.status);
  const severityColors = getSeverityColors(selectedReport?.severity);

  // Paginated comments logic (Limit 5 per page)
  const allComments = selectedReport?.comments || [];
  const totalCommentPages = Math.ceil(allComments.length / COMMENTS_PER_PAGE) || 1;
  const paginatedComments = allComments.slice(
    (commentPage - 1) * COMMENTS_PER_PAGE,
    commentPage * COMMENTS_PER_PAGE
  );

  const handleSelectReport = (report) => {
    if (!report) return;

    const locationKey = getLocation(report).toLowerCase();
    const hotspot = hotspots.find((item) => item.key === locationKey);

    // Bind the report and its location in one interaction so the detail panel
    // can render directly from the clicked marker without a blank transition.
    if (!filteredReports.some((item) => item.id === report.id)) return;
    setSelectedReportId(report.id);
    setSelectedHotspotKey(hotspot?.key || null);
    setCommentPage(1);
    setDetailsOpen(true);
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({
        y: Math.max(0, workspaceY - 12),
        animated: true,
      });
    });
  };

  if (!fontsLoaded) return null;

  return (
    <Admin_Layout>
      <ScrollView
        ref={scrollViewRef}
        onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[styles.filters, isNarrow && styles.filtersNarrow]}
          onLayout={(event) => setFiltersHeight(event.nativeEvent.layout.height)}
        >
          <BatchFilterDropdown
            label="Location"
            value={selectedBarangay}
            options={[{ value: "All", label: "All Barangays" }, ...ARGAO_BARANGAYS.map(({ name }) => ({ value: name, label: name })), { value: "__unresolved__", label: "Barangay not determined" }]}
            onChange={(val) => {
              setSelectedBarangay(val);
              clearSelection();
            }}
          />
          <BatchFilterDropdown
            label="Incident Category"
            value={selectedCategory}
            options={[{ value: "All", label: "All Categories" }, ...INCIDENT_CATEGORIES.map(({ category }) => ({ value: category, label: category }))]}
            onChange={(val) => {
              setSelectedCategory(val);
              clearSelection();
            }}
          />
          <BatchFilterDropdown
            label="Incident Type"
            value={selectedIncidentType}
            options={incidentTypeOptions}
            onChange={(val) => {
              setSelectedIncidentType(val);
              clearSelection();
            }}
          />
          <BatchDateRangeDropdown
            from={from}
            to={to}
            onChangeFrom={(value) => {
              setFrom(value);
              clearSelection();
            }}
            onChangeTo={(value) => {
              setTo(value);
              clearSelection();
            }}
          />
        </View>

        <View
          style={[styles.workspace, isNarrow ? styles.workspaceNarrow : { height: mapWorkspaceHeight }]}
          onLayout={(event) => {
            setWorkspaceY(event.nativeEvent.layout.y);
            setWorkspaceWidth(event.nativeEvent.layout.width);
          }}
        >
          {/* Full-width map until a report is selected. */}
          <View style={[styles.mapPanel, isNarrow && [styles.mapPanelNarrow, { height: mapWorkspaceHeight }]]}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>
                {detailsOpen && selectedReport ? getLocation(selectedReport) : selectedBarangay === "__unresolved__" ? "Barangay not determined" : selectedBarangay !== "All" ? selectedBarangay : "Argao"}
              </Text>
              <Text style={styles.panelMeta}>
                {detailsOpen && selectedHotspot ? `${selectedHotspot.count} reports` : `${filteredReports.length} reports`}
              </Text>
            </View>
            <View style={styles.mapFrame}>
              {loading ? (
                <View style={styles.loading}>
                  <ActivityIndicator color="#23675D" />
                  <Text style={styles.loadingText}>Loading reports</Text>
                </View>
              ) : (
                <AdminHeatMap
                  reports={mapReports}
                  focusTarget={mapFocusTarget}
                  onReportSelect={handleSelectReport}
                />
              )}
              <View style={styles.legend}>
                {[{ label: "Critical", color: "#D94841" }, { label: "High", color: "#E58B32" }, { label: "Medium", color: "#E5BD42" }, { label: "Low", color: "#37956D" }].map((item) => (
                  <View key={item.label} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                    <Text style={styles.legendText}>{item.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* Slide the inspection panel in without remounting the map. */}
          <Animated.View
            pointerEvents={detailsOpen ? "auto" : "none"}
            accessibilityElementsHidden={!detailsOpen}
            importantForAccessibility={detailsOpen ? "auto" : "no-hide-descendants"}
            style={[
              styles.detailReveal,
              isNarrow ? {
                height: detailProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 430] }),
                marginTop: detailProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 16] }),
              } : {
                width: detailProgress.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(0, (workspaceWidth - 16) * 0.4)] }),
                marginLeft: detailProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 16] }),
              },
              { opacity: detailProgress, transform: [{ translateX: detailProgress.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] },
            ]}
          >
          <View style={[styles.detailPanel, isNarrow && styles.detailPanelNarrow]}>
            <View style={styles.detailHeader}>
              <Text style={styles.panelTitle}>Detailed Report</Text>
              <View style={styles.detailHeaderActions}>
              {selectedReport ? <Text style={styles.panelMeta}>ID {String(selectedReport.id).slice(0, 8)}</Text> : null}
              <Pressable onPress={() => setDetailsOpen(false)} accessibilityRole="button" accessibilityLabel="Close detailed report" style={styles.closeButton}>
                <Ionicons name="close" size={20} color="#294880" />
              </Pressable>
              </View>
            </View>
            {selectedReport ? (
              <ScrollView
                key={`report-detail-${selectedReport.id}`}
                contentContainerStyle={styles.detailContent}
                showsVerticalScrollIndicator={false}
              >
                
                {/* Top Header Row with Top-Right Badges */}
                <View style={styles.topHeaderRow}>
                  <View style={styles.headerTitleArea}>
                    <Text style={styles.reportTitle}>{selectedReport.incident_type || "Incident"}</Text>
                    <Text style={styles.reportLocation}>{getReportLocationHierarchy(selectedReport).label}</Text>
                    
                    <View style={styles.badges}>
                      <Text style={[styles.badgeStatus, { color: statusColors.color, backgroundColor: statusColors.background }]}>
                        {selectedReport.status || "Pending Review"}
                      </Text>
                      <Text style={[styles.badgeStatus, { color: severityColors.color, backgroundColor: severityColors.background }]}>
                        {selectedReport.severity || "Medium"}
                      </Text>
                    </View>
                  </View>

                  {/* Top-Right Badges: Blue (Date Reported) & Green (AI Score) */}
                  <View style={styles.topRightBadgesContainer}>
                    <Text style={styles.badgeBlue}>
                      {getReportDate(selectedReport)?.toLocaleString() || "Date unavailable"}
                    </Text>
                    <Text style={styles.badgeGreen}>
                      {selectedReport.ai_score == null ? "N/A" : `${selectedReport.ai_score}%`}
                    </Text>
                  </View>
                </View>

                {/* Structured Form Area matching CommuniShield style */}
                <View style={styles.contentCardArea}>
                  
                  {/* Category and Incident Type side-by-side row */}
                  <View style={styles.categoryTypeRow}>
                    <View style={styles.categoryTypeCol}>
                      <Text style={styles.infoLabel}>Category</Text>
                      <Text style={styles.infoValue}>{selectedReport.incident_category || "Not specified"}</Text>
                    </View>
                    <View style={styles.categoryTypeCol}>
                      <Text style={styles.infoLabel}>Incident Type</Text>
                      <Text style={styles.infoValue}>{selectedReport.incident_type || "Not specified"}</Text>
                    </View>
                  </View>

                  {/* Report Details Section */}
                  {selectedReport.details || selectedReport.description ? (
                    <View style={styles.descriptionBox}>
                      <Text style={styles.infoLabel}>Report Details</Text>
                      <Text style={styles.descriptionText}>{selectedReport.details || selectedReport.description}</Text>
                    </View>
                  ) : (
                    <View style={styles.descriptionBox}>
                      <Text style={styles.infoLabel}>Report Details</Text>
                      <Text style={styles.descriptionText}>No description provided.</Text>
                    </View>
                  )}
                </View>

                {/* Comments Section (Limit 5 per page with Pagination) */}
                <View style={styles.commentsSection}>
                  <View style={styles.commentsHeading}>
                    <Text style={styles.infoLabel}>Comments</Text>
                    <Text style={styles.commentCount}>{allComments.length}</Text>
                  </View>
                  {sentimentTotal > 0 ? (
                    <View style={styles.sentimentSummary}>
                      <Text style={styles.sentimentText}>Positive {sentimentCounts.positive}</Text>
                      <Text style={styles.sentimentText}>Negative {sentimentCounts.negative}</Text>
                      <Text style={styles.sentimentText}>Neutral {sentimentCounts.neutral}</Text>
                    </View>
                  ) : <Text style={styles.emptyComments}>No analyzed comment sentiment.</Text>}

                  {paginatedComments.length > 0 ? (
                    paginatedComments.map((comment, index) => (
                      <View key={comment.id || index} style={styles.commentItem}>
                        <Text style={styles.commentBody}>{comment.text || ""}</Text>
                        <Text style={styles.commentMeta}>{comment.user || "User"}{comment.sentiment ? ` · ${comment.sentiment}` : ""}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.emptyComments}>No comments found.</Text>
                  )}

                  {/* Pagination Controls */}
                  {allComments.length > COMMENTS_PER_PAGE && (
                    <View style={styles.paginationRow}>
                      <Pressable
                        style={[styles.pageButton, commentPage === 1 && styles.pageButtonDisabled]}
                        disabled={commentPage === 1}
                        onPress={() => setCommentPage((p) => Math.max(1, p - 1))}
                      >
                        <Ionicons name="chevron-back" size={14} color={commentPage === 1 ? "#A0AEC0" : "#294880"} />
                        <Text style={[styles.pageButtonText, commentPage === 1 && styles.pageButtonTextDisabled]}>Prev</Text>
                      </Pressable>

                      <Text style={styles.pageIndicatorText}>
                        Page {commentPage} of {totalCommentPages}
                      </Text>

                      <Pressable
                        style={[styles.pageButton, commentPage === totalCommentPages && styles.pageButtonDisabled]}
                        disabled={commentPage === totalCommentPages}
                        onPress={() => setCommentPage((p) => Math.min(totalCommentPages, p + 1))}
                      >
                        <Text style={[styles.pageButtonText, commentPage === totalCommentPages && styles.pageButtonTextDisabled]}>Next</Text>
                        <Ionicons name="chevron-forward" size={14} color={commentPage === totalCommentPages ? "#A0AEC0" : "#294880"} />
                      </Pressable>
                    </View>
                  )}
                </View>
              </ScrollView>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="pin-outline" size={28} color="#78918A" />
                <Text style={styles.emptyTitle}>{loading ? "Loading reports" : "No report selected"}</Text>
                <Text style={styles.emptyText}>{loading ? "Incident locations will appear on the map." : "Select a map pin or adjust the filters."}</Text>
              </View>
            )}
          </View>
          </Animated.View>
        </View>
      </ScrollView>
    </Admin_Layout>
  );
}

const styles = {
  page: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 28,
    gap: 16,
    backgroundColor: "#F5F8FC",
  },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 14,
    zIndex: 100,
    elevation: 4,
  },
  filtersNarrow: { padding: 12 },
  workspace: { flexDirection: "row", alignItems: "stretch" },
  workspaceNarrow: { flexDirection: "column" },
  mapPanel: { flex: 6, minWidth: 0, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D9E2F0", borderRadius: 14, overflow: "hidden", shadowColor: "#0F1E3D", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2 },
  mapPanelNarrow: { flex: 0 },
  detailReveal: { overflow: "hidden", minHeight: 0 },
  detailPanel: { flex: 1, minWidth: 0, minHeight: 0, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D9E2F0", borderRadius: 14, overflow: "hidden", shadowColor: "#0F1E3D", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2 },
  detailHeaderActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  closeButton: { padding: 6, borderRadius: 8 },
  detailPanelNarrow: { flex: 0, minWidth: 0, height: 430 },
  panelHeader: { height: 48, flexShrink: 0, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#E7ECF3", backgroundColor: "#F7F9FD" },
  detailHeader: { height: 48, flexShrink: 0, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#E7ECF3", backgroundColor: "#F7F9FD" },
  panelTitle: { fontFamily: "PoppinsSemiBold", fontSize: 14, color: "#294880" },
  panelMeta: { fontFamily: "PoppinsMedium", fontSize: 11, color: "#5D6F92" },
  mapFrame: { flex: 1, minHeight: 0, overflow: "hidden", position: "relative" },
  legend: { position: "absolute", left: 12, bottom: 12, flexDirection: "row", flexWrap: "wrap", gap: 10, backgroundColor: "rgba(255,255,255,0.96)", borderWidth: 1, borderColor: "#E3EAF6", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontFamily: "PoppinsMedium", fontSize: 10, color: "#4B5D7A" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  loadingText: { fontFamily: "PoppinsRegular", fontSize: 13, color: "#657A73" },
  detailContent: { padding: 16, paddingBottom: 24 },

  // CommuniShield Clean Design System Styles
  topHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 10 },
  headerTitleArea: { flex: 1 },
  reportTitle: { fontFamily: "PoppinsSemiBold", fontSize: 18, lineHeight: 24, color: "#203A34" },
  reportLocation: { fontFamily: "PoppinsRegular", fontSize: 12, color: "#60756E", marginTop: 2 },
  
  topRightBadgesContainer: { alignItems: "flex-end", gap: 6 },
  badgeBlue: { fontFamily: "PoppinsSemiBold", fontSize: 10, color: "#1D4ED8", backgroundColor: "#DBEAFE", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5, textAlign: "center", overflow: "hidden" },
  badgeGreen: { fontFamily: "PoppinsSemiBold", fontSize: 10, color: "#047857", backgroundColor: "#D1FAE5", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5, textAlign: "center", overflow: "hidden" },
  
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  badgeStatus: { fontFamily: "PoppinsSemiBold", fontSize: 11, overflow: "hidden", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  
  contentCardArea: { backgroundColor: "#F8FAFC", padding: 12, borderRadius: 10, borderWidth: 1, borderColor: "#E2E8F0", marginTop: 10, gap: 10 },
  categoryTypeRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, borderBottomWidth: 1, borderBottomColor: "#EDF2F7", paddingBottom: 8 },
  categoryTypeCol: { flex: 1 },
  
  infoLabel: { fontFamily: "PoppinsSemiBold", fontSize: 10, color: "#64748B", textTransform: "uppercase" },
  infoValue: { fontFamily: "PoppinsMedium", fontSize: 12, color: "#1E293B", marginTop: 2 },
  
  descriptionBox: { paddingTop: 2 },
  descriptionText: { fontFamily: "PoppinsRegular", fontSize: 12, lineHeight: 18, color: "#334155", marginTop: 2 },
  
  commentsSection: { borderTopWidth: 1, borderTopColor: "#E9EFEB", paddingTop: 10, marginTop: 12 },
  commentsHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  commentCount: { fontFamily: "PoppinsSemiBold", fontSize: 11, color: "#2C403A" },
  sentimentSummary: { flexDirection: "row", justifyContent: "space-between", gap: 4, backgroundColor: "#F3F7F4", borderRadius: 7, padding: 8, marginTop: 6 },
  sentimentText: { fontFamily: "PoppinsMedium", fontSize: 10, color: "#52675F" },
  emptyComments: { fontFamily: "PoppinsRegular", fontSize: 11, color: "#71847D", marginTop: 8 },
  commentItem: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#EFF2F0", gap: 3 },
  commentBody: { fontFamily: "PoppinsRegular", fontSize: 11, lineHeight: 16, color: "#344A43" },
  commentMeta: { fontFamily: "PoppinsMedium", fontSize: 9, color: "#71847D" },
  
  paginationRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#E2E8F0" },
  pageButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: "#EDF2F7" },
  pageButtonDisabled: { opacity: 0.5 },
  pageButtonText: { fontFamily: "PoppinsMedium", fontSize: 11, color: "#294880" },
  pageButtonTextDisabled: { color: "#A0AEC0" },
  pageIndicatorText: { fontFamily: "PoppinsMedium", fontSize: 11, color: "#4A5568" },

  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, gap: 6 },
  emptyTitle: { fontFamily: "PoppinsSemiBold", fontSize: 14, color: "#35564D" },
  emptyText: { fontFamily: "PoppinsRegular", fontSize: 11, lineHeight: 16, color: "#71847D", textAlign: "center" },
};
