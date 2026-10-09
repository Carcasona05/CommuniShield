import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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

const normalizeText = (value) => String(value ?? "").trim();

const getReportDate = (report) => {
  const value = report?.created_at || report?.reported_at || report?.date;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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

export default function Admin_Ince_Map() {
  const { width } = useWindowDimensions();
  const isNarrow = width < 900;
  const [reports, setReports] = useState(() => getCache("api:/admin/dashboard")?.reports || []);
  const [loading, setLoading] = useState(() => getCache("api:/admin/dashboard") === undefined);
  const [selectedBarangay, setSelectedBarangay] = useState("All");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedIncidentType, setSelectedIncidentType] = useState("All");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedReportId, setSelectedReportId] = useState(null);

  const [fontsLoaded] = useFonts({
    PoppinsRegular: require("../../assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("../../assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("../../assets/fonts/Poppins-SemiBold.ttf"),
  });

  const loadReports = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;
      const response = await apiClient.get("/admin/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = response.data ?? {};
      setCache("api:/admin/dashboard", data);
      if (Array.isArray(data.reports)) setReports(data.reports);
    } catch {
      const cached = getCache("api:/admin/dashboard");
      if (Array.isArray(cached?.reports)) setReports(cached.reports);
    } finally {
      setLoading(false);
    }
  }, []);

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

  const filteredReports = useMemo(() => reports.filter((report) => {
    if (report.latitude == null || report.longitude == null || report.status === "Rejected") return false;
    const location = normalizeText(report.location);
    const barangay = normalizeText(report.barangay || report.barangay_name || location.split(",")[0]);
    if (selectedBarangay !== "All" && barangay.toLowerCase() !== selectedBarangay.toLowerCase() && !location.toLowerCase().includes(selectedBarangay.toLowerCase())) return false;
    if (selectedCategory !== "All" && normalizeText(report.incident_category || report.category) !== selectedCategory) return false;
    if (selectedIncidentType !== "All" && normalizeText(report.incident_type || report.type) !== selectedIncidentType) return false;

    const date = getReportDate(report);
    if (date && fromDate && date < new Date(`${fromDate}T00:00:00`)) return false;
    if (date && toDate && date > new Date(`${toDate}T23:59:59.999`)) return false;
    return true;
  }), [fromDate, reports, selectedBarangay, selectedCategory, selectedIncidentType, toDate]);

  useEffect(() => {
    if (!filteredReports.some((report) => report.id === selectedReportId)) {
      setSelectedReportId(filteredReports[0]?.id ?? null);
    }
  }, [filteredReports, selectedReportId]);

  const selectedReport = filteredReports.find((report) => report.id === selectedReportId) || null;
  const sentimentCounts = getSentimentCounts(selectedReport);
  const sentimentTotal = sentimentCounts.positive + sentimentCounts.negative + sentimentCounts.neutral;
  const statusColors = getStatusColors(selectedReport?.status);
  const severityColors = getSeverityColors(selectedReport?.severity);

  if (!fontsLoaded) return null;

  return (
    <Admin_Layout>
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        

        <View style={[styles.filters, isNarrow && styles.filtersNarrow]}>
          <BatchFilterDropdown
            label="Location"
            value={selectedBarangay}
            options={[{ value: "All", label: "All Barangays" }, ...ARGAO_BARANGAYS.map(({ name }) => ({ value: name, label: name }))]}
            onChange={setSelectedBarangay}
          />
          <BatchFilterDropdown
            label="Incident Category"
            value={selectedCategory}
            options={[{ value: "All", label: "All Categories" }, ...INCIDENT_CATEGORIES.map(({ category }) => ({ value: category, label: category }))]}
            onChange={setSelectedCategory}
          />
          <BatchFilterDropdown
            label="Incident Type"
            value={selectedIncidentType}
            options={incidentTypeOptions}
            onChange={setSelectedIncidentType}
          />
          <BatchDateRangeDropdown
            from={fromDate}
            to={toDate}
            onChangeFrom={setFromDate}
            onChangeTo={setToDate}
          />
        </View>

        <View style={[styles.workspace, isNarrow && styles.workspaceNarrow]}>
          <View style={[styles.mapPanel, isNarrow && styles.mapPanelNarrow]}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Argao, Cebu</Text>
              <Text style={styles.panelMeta}>{filteredReports.length} reports</Text>
            </View>
            <View style={[styles.mapFrame, isNarrow && styles.mapFrameNarrow]}>
              {loading ? (
                <View style={styles.loading}><ActivityIndicator color="#23675D" /><Text style={styles.loadingText}>Loading reports</Text></View>
              ) : (
                <AdminHeatMap reports={filteredReports} onReportSelect={(report) => setSelectedReportId(report.id)} />
              )}
              <View style={styles.legend}>
                {[{ label: "Critical", color: "#D94841" }, { label: "High", color: "#E58B32" }, { label: "Medium", color: "#E5BD42" }, { label: "Low", color: "#37956D" }].map((item) => (
                  <View key={item.label} style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: item.color }]} /><Text style={styles.legendText}>{item.label}</Text></View>
                ))}
              </View>
            </View>
          </View>

          <View style={[styles.detailPanel, isNarrow && styles.detailPanelNarrow]}>
            <View style={styles.detailHeader}>
              <Text style={styles.panelTitle}>Detailed Report</Text>
              {selectedReport ? <Text style={styles.panelMeta}>ID {String(selectedReport.id).slice(0, 8)}</Text> : null}
            </View>
            {selectedReport ? (
              <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
                <Text style={styles.reportTitle}>{selectedReport.incident_type || "Incident"}</Text>
                <Text style={styles.reportLocation}>{selectedReport.location || "Location not specified"}</Text>
                <View style={styles.badges}>
                  <Text style={[styles.badge, { color: statusColors.color, backgroundColor: statusColors.background }]}>{selectedReport.status || "Pending Review"}</Text>
                  <Text style={[styles.badge, { color: severityColors.color, backgroundColor: severityColors.background }]}>{selectedReport.severity || "Medium"}</Text>
                </View>

                <View style={styles.infoRow}><Text style={styles.infoLabel}>Category</Text><Text style={styles.infoValue}>{selectedReport.incident_category || "Not specified"}</Text></View>
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Incident type</Text><Text style={styles.infoValue}>{selectedReport.incident_type || "Not specified"}</Text></View>
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Reported</Text><Text style={styles.infoValue}>{getReportDate(selectedReport)?.toLocaleString() || "Date unavailable"}</Text></View>
                <View style={styles.infoRow}><Text style={styles.infoLabel}>AI score</Text><Text style={styles.infoValue}>{selectedReport.ai_score == null ? "Unavailable" : `${selectedReport.ai_score}%`}</Text></View>
                {selectedReport.details ? <View style={styles.description}><Text style={styles.infoLabel}>Report details</Text><Text style={styles.descriptionText}>{selectedReport.details}</Text></View> : null}

                <View style={styles.commentsSection}>
                  <View style={styles.commentsHeading}><Text style={styles.infoLabel}>Comments</Text><Text style={styles.commentCount}>{selectedReport.comments?.length || 0}</Text></View>
                  {sentimentTotal > 0 ? (
                    <View style={styles.sentimentSummary}>
                      <Text style={styles.sentimentText}>Positive {sentimentCounts.positive}</Text>
                      <Text style={styles.sentimentText}>Negative {sentimentCounts.negative}</Text>
                      <Text style={styles.sentimentText}>Neutral {sentimentCounts.neutral}</Text>
                    </View>
                  ) : <Text style={styles.emptyComments}>No analyzed comment sentiment.</Text>}
                  {(selectedReport.comments || []).slice(0, 4).map((comment, index) => (
                    <View key={comment.id || index} style={styles.commentItem}>
                      <Text style={styles.commentBody}>{comment.text || ""}</Text>
                      <Text style={styles.commentMeta}>{comment.user || "User"}{comment.sentiment ? ` · ${comment.sentiment}` : ""}</Text>
                    </View>
                  ))}
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
        </View>
      </ScrollView>
    </Admin_Layout>
  );
}

const styles = {
  page: { padding: 20, paddingBottom: 28, gap: 16 },
  heading: { flexDirection: "row", alignItems: "center", gap: 12 },
  headingIcon: { width: 42, height: 42, borderRadius: 10, backgroundColor: "#E5F1EC", alignItems: "center", justifyContent: "center" },
  headingTitle: { fontFamily: "PoppinsSemiBold", fontSize: 21, color: "#183C36" },
  headingSubtitle: { fontFamily: "PoppinsRegular", fontSize: 13, color: "#647B75", marginTop: 2 },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    padding: 14,
    backgroundColor: "#F7F9FD",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 14,
  },
  filtersNarrow: { padding: 12 },
  workspace: { flexDirection: "row", alignItems: "stretch", gap: 16 },
  workspaceNarrow: { flexDirection: "column" },
  mapPanel: { flex: 7, minWidth: 0, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DDE6E1", borderRadius: 10, overflow: "hidden" },
  mapPanelNarrow: { flex: 0 },
  detailPanel: { flex: 3, minWidth: 270, maxWidth: 480, height: 540, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DDE6E1", borderRadius: 10, overflow: "hidden" },
  detailPanelNarrow: { flex: 0, minWidth: 0, maxWidth: undefined, height: 500 },
  panelHeader: { height: 54, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#E8EEEA" },
  detailHeader: { height: 54, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#E8EEEA", backgroundColor: "#FBFCFB" },
  panelTitle: { fontFamily: "PoppinsSemiBold", fontSize: 15, color: "#244A41" },
  panelMeta: { fontFamily: "PoppinsMedium", fontSize: 12, color: "#71847D" },
  mapFrame: { height: 540, overflow: "hidden", position: "relative" },
  mapFrameNarrow: { height: 420 },
  legend: { position: "absolute", left: 12, bottom: 12, flexDirection: "row", flexWrap: "wrap", gap: 10, backgroundColor: "rgba(255,255,255,0.96)", borderWidth: 1, borderColor: "#E1E8E4", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontFamily: "PoppinsMedium", fontSize: 10, color: "#4F625C" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  loadingText: { fontFamily: "PoppinsRegular", fontSize: 13, color: "#657A73" },
  detailContent: { padding: 16, paddingBottom: 24 },
  reportTitle: { fontFamily: "PoppinsSemiBold", fontSize: 19, lineHeight: 26, color: "#203A34" },
  reportLocation: { fontFamily: "PoppinsRegular", fontSize: 13, color: "#60756E", marginTop: 5 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12, marginBottom: 4 },
  badge: { fontFamily: "PoppinsSemiBold", fontSize: 11, overflow: "hidden", borderRadius: 6, paddingHorizontal: 9, paddingVertical: 5 },
  infoRow: { borderTopWidth: 1, borderTopColor: "#E9EFEB", paddingVertical: 11, gap: 5 },
  infoLabel: { fontFamily: "PoppinsSemiBold", fontSize: 10, color: "#71847D", textTransform: "uppercase" },
  infoValue: { fontFamily: "PoppinsMedium", fontSize: 13, lineHeight: 19, color: "#2C403A" },
  description: { borderTopWidth: 1, borderTopColor: "#E9EFEB", paddingTop: 12, gap: 6 },
  descriptionText: { fontFamily: "PoppinsRegular", fontSize: 13, lineHeight: 20, color: "#344A43" },
  commentsSection: { borderTopWidth: 1, borderTopColor: "#E9EFEB", paddingTop: 12, marginTop: 12 },
  commentsHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  commentCount: { fontFamily: "PoppinsSemiBold", fontSize: 12, color: "#2C403A" },
  sentimentSummary: { flexDirection: "row", justifyContent: "space-between", gap: 4, backgroundColor: "#F3F7F4", borderRadius: 7, padding: 9, marginTop: 8 },
  sentimentText: { fontFamily: "PoppinsMedium", fontSize: 10, color: "#52675F" },
  emptyComments: { fontFamily: "PoppinsRegular", fontSize: 12, color: "#71847D", marginTop: 9 },
  commentItem: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#EFF2F0", gap: 4 },
  commentBody: { fontFamily: "PoppinsRegular", fontSize: 12, lineHeight: 18, color: "#344A43" },
  commentMeta: { fontFamily: "PoppinsMedium", fontSize: 10, color: "#71847D" },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, gap: 8 },
  emptyTitle: { fontFamily: "PoppinsSemiBold", fontSize: 15, color: "#35564D" },
  emptyText: { fontFamily: "PoppinsRegular", fontSize: 12, lineHeight: 18, color: "#71847D", textAlign: "center" },
};
