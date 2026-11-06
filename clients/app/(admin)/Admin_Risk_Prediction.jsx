import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import Admin_Layout from "../../components/Admin_compo/Admin_Layout";
import AdminHeatMap from "../../components/Admin_compo/AdminHeatMap";
import SentimentEvidenceChart from "../../components/Admin_compo/SentimentEvidenceChart";
import { BatchFilterDropdown } from "../../components/Admin_compo/AdminBatchFilters";
import useRetainedApiQuery from "../../hooks/useRetainedApiQuery";
import { ListSkeleton } from "../../components/PageSkeletons";
import useSmoothScrollToTop from "../../hooks/useSmoothScrollToTop";
import { getReportBarangay } from "../../services/argaoLocation";
import { ARGAO_BARANGAYS as ARGAO_BARANGAY_DATA } from "../../constants/argaoMapData";
import { isActiveRiskReport } from "../../services/riskZones";

const ARGAO_BARANGAYS = [
  "All Barangays",
  ...ARGAO_BARANGAY_DATA.map(({ name }) => name),
];
const EMPTY_REPORTS = [];
const validOutlookResponse = (data) => Array.isArray(data?.reports) && data?.currentByBarangay && typeof data.currentByBarangay === "object";

const ZONE_SEVERITY_THEME = {
  Critical: { color: "#B93838", background: "#FDEEEE" },
  High: { color: "#B45B12", background: "#FFF0E5" },
  Medium: { color: "#946212", background: "#FFF4DF" },
  Low: { color: "#16794B", background: "#EAF8F1" },
  Unknown: { color: "#64748B", background: "#EEF2F6" },
};

export default function Admin_Risk_Prediction() {
  const scrollViewRef = useRef(null);
  const { scrollToTop, trackScroll, stopScrollAnimation } = useSmoothScrollToTop(scrollViewRef);
  const showScrollTopRef = useRef(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  
  const [selectedBarangay, setSelectedBarangay] = useState("All Barangays");
  const [selectedMarkerReport, setSelectedMarkerReport] = useState(null);
  const [commentPage, setCommentPage] = useState(1);
  const COMMENTS_PER_PAGE = 5;

  // Pagination for observed incident types, not predicted risk drivers.
  const [riskDriverPage, setRiskDriverPage] = useState(1);
  const RISK_DRIVERS_PER_PAGE = 5;

  const [fontsLoaded] = useFonts({
    PoppinsRegular: require("../../assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("../../assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("../../assets/fonts/Poppins-SemiBold.ttf"),
  });

  const { data: outlook, loading, refreshing, checkedAt, errorMessage } = useRetainedApiQuery({
    endpoint: "/admin/risk-outlook",
    params: { view: "current" },
    validate: validOutlookResponse,
  });
  const reports = outlook?.reports || EMPTY_REPORTS;

  const reportsByBarangay = useMemo(() => {
    const grouped = new Map();
    for (const report of reports) {
      if (!isActiveRiskReport(report)) continue;
      const name = report.barangay || getReportBarangay(report);
      if (!grouped.has(name)) grouped.set(name, []);
      grouped.get(name).push(report);
    }
    return grouped;
  }, [reports]);
  const selectedReports = useMemo(() => selectedBarangay === "All Barangays" ? reports
    : reportsByBarangay.get(selectedBarangay) || EMPTY_REPORTS, [reports, reportsByBarangay, selectedBarangay]);
  const selectedCurrent = selectedBarangay === "All Barangays" ? outlook?.current : outlook?.currentByBarangay?.[selectedBarangay];

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

  const currentMapReports = useMemo(() => selectedReports.filter((report) =>
    report.latitude != null && report.longitude != null &&
    Number.isFinite(Number(report.latitude)) && Number.isFinite(Number(report.longitude))
  ), [selectedReports]);

  const handleScroll = (event) => {
    trackScroll(event);
    const show = event.nativeEvent.contentOffset.y > 300;
    if (show !== showScrollTopRef.current) {
      showScrollTopRef.current = show;
      setShowScrollTop(show);
    }
  };

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

  const recommendedActions = useMemo(() => {
    const types = new Set(selectedReports.map((report) => String(report.incident_type || report.type || "").toLowerCase()));
    const actions = [];
    if (selectedReports.length) actions.push(`Review and verify ${selectedReports.length} active report${selectedReports.length === 1 ? "" : "s"} before making deployment decisions.`);
    if ([...types].some((type) => /fire|flood|drainage|garbage/.test(type))) actions.push("Coordinate with disaster and environmental response teams for the reported hazard.");
    if ([...types].some((type) => /theft|harass|disturb|suspicious|traffic|accident|vandal/.test(type))) actions.push("Review reported locations with local safety officers; this page does not automatically allocate patrols.");
    if (!actions.length) actions.push("No qualifying active reports in this view. This is not proof that the area is safe.");
    return actions;
  }, [selectedReports]);

  const mapFocusTarget = useMemo(() => selectedBarangay !== "All Barangays"
    ? (() => { const place = ARGAO_BARANGAY_DATA.find((item) => item.name.toLowerCase() === selectedBarangay.toLowerCase()); return place ? { latitude: place.lat, longitude: place.lng, zoom: 16 } : null; })()
    : null, [selectedBarangay]);

  const handleMarkerSelect = (report) => {
    setSelectedMarkerReport(report);
  };

  const selectedComments = selectedMarkerReport?.comments || [];
  const totalCommentPages = Math.max(1, Math.ceil(selectedComments.length / COMMENTS_PER_PAGE));
  const paginatedComments = selectedComments.slice(
    (commentPage - 1) * COMMENTS_PER_PAGE,
    commentPage * COMMENTS_PER_PAGE
  );

  if (!fontsLoaded) return null;

  return (
    <Admin_Layout>
      <View style={styles.wrapper}>
      <ScrollView
        testID="risk-prediction-scroll"
        ref={scrollViewRef}
        onScroll={handleScroll}
        onScrollBeginDrag={stopScrollAnimation}
        onTouchStart={stopScrollAnimation}
        scrollEventThrottle={16}
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1, scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        
        {!!checkedAt && <Text style={styles.muted} testID="risk-refresh-status">{refreshing ? "Checking for updates… · " : ""}{errorMessage ? "Refresh failed; current indicators show previous results · " : ""}Last checked {new Date(checkedAt).toLocaleTimeString()}</Text>}
        {!!errorMessage && <Text style={[styles.emptyText, { color: "#B93838" }]}>{errorMessage}</Text>}

        {/* Current report map and evidence. */}
        <View style={styles.splitMainRow}>
          
          {/* Left Column: Map Box (60%) */}
          <View style={styles.leftBox60}>
            <View style={styles.boxHeader}>
              <Ionicons name="map-outline" size={18} color="#294880" />
              <Text style={styles.boxHeaderTitle}>Current report locations</Text>
            </View>

            {/* FILTER PANEL */}
            <View style={styles.filterCard}>
              <View style={styles.filterLineRow}>
                <View style={styles.filterIconBadge}>
                  <Ionicons name="options-outline" size={16} color="#294880" />
                </View>

                <BatchFilterDropdown
                  testID="risk-zone-location-filter"
                  label="Barangay"
                  value={selectedBarangay}
                  options={ARGAO_BARANGAYS}
                  onChange={(value) => {
                    setSelectedBarangay(value);
                    setSelectedMarkerReport(null);
                  }}
                  searchable
                  searchPlaceholder="Type a barangay..."
                  style={styles.filterDropdownField}
                />

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
            </View>

            

            <View style={styles.mapFrame}>
              <AdminHeatMap loading={loading} reports={currentMapReports} focusTarget={mapFocusTarget} resetView={selectedBarangay === "All Barangays"} onReportSelect={handleMarkerSelect} />
              {!currentMapReports.length ? <View pointerEvents="none" style={styles.mapNotice}>
                <Text style={styles.mapNoticeText}>{loading ? "Loading mapped reports..." : !outlook ? "Current indicators unavailable." : "No active reports match this Barangay filter."}</Text>
              </View> : null}
            </View>
          </View>

          {/* Right Column: Details, Recommendations, and Results Box (40%) */}
          <View style={styles.rightBox40}>
            <View style={styles.boxHeader}>
              <Ionicons name="analytics-outline" size={18} color="#294880" />
              <Text style={styles.boxHeaderTitle}>Observed evidence & review</Text>
            </View>

            <ScrollView testID="risk-evidence-scroll" style={styles.evidenceScroll} contentContainerStyle={styles.evidenceContent} nestedScrollEnabled showsVerticalScrollIndicator>
            {loading ? <ListSkeleton rows={3} /> : <>
            {/* SECTION 1: Detail of Report Selected in Map / Risk Drivers with Pagination */}
            <View style={styles.contentSection}>
              <View style={styles.subHeaderBetween}>
                <View style={styles.subHeader}>
                  <Ionicons name="alert-circle-outline" size={16} color="#C25E00" />
                  <Text style={styles.sectionSubTitle}>
                    {selectedMarkerReport ? `Selected Report Details (${selectedMarkerReport.id || "Marker"})` : "Reported incident types"}
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
                    {paginatedRiskDrivers.map((item, index) => (
                      <View key={`${item.label}-${index}`} style={styles.miniListRow}>
                        <View style={[styles.typeDot, { backgroundColor: item.color || "#C25E00" }]} />
                        <Text style={styles.listPrimary}>{item.label}</Text>
                        <Text style={[styles.listValue, { color: "#C25E00" }]}>{item.value}</Text>
                      </View>
                    ))}
                  </>
                ) : (
                  <Text style={styles.emptyText}>No qualifying active reports available.</Text>
                )
              )}
            </View>

            {/* SECTION 2: Recommendation / Actions Needed */}
            <View style={styles.contentSection}>
              <View style={styles.subHeader}>
                <Ionicons name="shield-checkmark-outline" size={16} color="#16794B" />
                <Text style={styles.sectionSubTitle}>Suggested human review</Text>
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
                <Text style={styles.sectionSubTitle}>Interpretation limits</Text>
              </View>
              <Text style={styles.scenarioText}>Unverified reports, severity labels and sentiment require review. This prototype does not establish real-world danger or prove that a particular deployment will reduce incidents.</Text>
            </View>
            </>}
            </ScrollView>
          </View>
        </View>

        {/* Current sentiment, verification and severity evidence for the selected scope. */}
        <View style={styles.bottomSection} testID="current-sentiment-context">
          <View style={styles.boxHeader}>
            <Ionicons name="chatbubbles-outline" size={18} color="#294880" />
            <Text style={styles.boxHeaderTitle}>Current sentiment & verification context · {selectedBarangay}</Text>
            {!!checkedAt && <Text style={styles.zoneLimit}>Last 30 days</Text>}
          </View>

          <View style={styles.contextRow}>
            <View style={styles.contextCard} testID="risk-sentiment-card">
              <View style={styles.contextCardHeader}>
                <View style={[styles.contextIconBadge, { backgroundColor: "#EAF2FF" }]}>
                  <Ionicons name="pulse-outline" size={16} color="#294880" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.contextCardTitle}>Sentiment evidence</Text>
                  <Text style={styles.contextCardSubtitle}>Successful multilingual analyses only</Text>
                </View>
              </View>
              <SentimentEvidenceChart
                evidence={selectedCurrent?.evidence}
                activityLabel={selectedBarangay === "All Barangays" ? "active reports in scope" : `active reports in ${selectedBarangay}`}
              />
            </View>

            <View style={styles.contextCard} testID="risk-verification-card">
              <View style={styles.contextCardHeader}>
                <View style={[styles.contextIconBadge, { backgroundColor: "#EAF8F1" }]}>
                  <Ionicons name="shield-checkmark-outline" size={16} color="#16794B" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.contextCardTitle}>Verification & severity</Text>
                  <Text style={styles.contextCardSubtitle}>Human review status of active reports</Text>
                </View>
              </View>

              <View style={styles.statTiles}>
                <View style={styles.statTile} testID="verification-verified">
                  <Text style={styles.statValue}>{selectedCurrent?.evidence?.verification?.verified ?? 0}</Text>
                  <Text style={styles.statLabel}>Verified</Text>
                </View>
                <View style={styles.statTile}>
                  <Text style={styles.statValue}>{selectedCurrent?.evidence?.verification?.underVerification ?? 0}</Text>
                  <Text style={styles.statLabel}>Under verification</Text>
                </View>
                <View style={styles.statTile}>
                  <Text style={styles.statValue}>{selectedCurrent?.evidence?.verification?.pendingReview ?? 0}</Text>
                  <Text style={styles.statLabel}>Pending review</Text>
                </View>
                {!!selectedCurrent?.evidence?.verification?.other && (
                  <View style={styles.statTile}>
                    <Text style={styles.statValue}>{selectedCurrent.evidence.verification.other}</Text>
                    <Text style={styles.statLabel}>Other</Text>
                  </View>
                )}
              </View>

              <Text style={styles.contextGroupLabel}>Severity of active reports</Text>
              <View style={styles.chipRow}>
                {["Critical", "High", "Medium", "Low", "Unknown"].map((level) => {
                  const theme = ZONE_SEVERITY_THEME[level];
                  const count = selectedCurrent?.severity?.[level] ?? 0;
                  return (
                    <View key={level} style={[styles.zoneSeverity, { backgroundColor: theme.background }]} accessibilityLabel={`${level === "Unknown" ? "Not rated" : level} severity: ${count} reports`}>
                      <View style={[styles.zoneSeverityDot, { backgroundColor: theme.color }]} />
                      <Text style={[styles.zoneSeverityText, { color: theme.color }]}>{level === "Unknown" ? "Not rated" : level} {count}</Text>
                    </View>
                  );
                })}
              </View>

              <Text style={styles.contextGroupLabel}>Intersecting spatial hotspots</Text>
              {(selectedCurrent?.clusters || []).length ? (
                selectedCurrent.clusters.map((cluster) => (
                  <View key={`${cluster.location}-${cluster.reportIds?.[0] || cluster.location}`} style={styles.hotspotRow}>
                    <Ionicons name="location-sharp" size={14} color="#294880" />
                    <Text style={styles.hotspotName}>{cluster.location}</Text>
                    <Text style={styles.hotspotMeta}>{cluster.reportCount} reports · {cluster.uniqueLocationCount} locations</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>No DBSCAN hotspot intersects this scope. This is not proof that the area is safe.</Text>
              )}

              {selectedCurrent?.snapshotMayBeLimited && <Text style={styles.contextNote}>Current indicators may be limited by the dashboard snapshot.</Text>}
              <Text style={styles.contextNote}>Severity comes from the automated credibility analysis of each submitted report and still requires human review. These counts are descriptive, not a forecast.</Text>
            </View>
          </View>

          <Text style={styles.contextNote}>Sentiment tone and severity labels describe submitted reports for review; they are not evidence of danger. {selectedCurrent?.note || ""}</Text>
        </View>


      </ScrollView>
      {showScrollTop ? <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Back to top"
        style={styles.scrollTopBtn}
        onPress={scrollToTop}
        activeOpacity={0.8}
      >
        <Ionicons name="chevron-up" size={22} color="#FFFFFF" />
      </TouchableOpacity> : null}
      </View>
    </Admin_Layout>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: "#F5F8FC" },
  page: { paddingTop: 0, paddingBottom: 36, paddingHorizontal: 0, gap: 18 },
  
  muted: { color: "#647B75", fontFamily: "PoppinsRegular", fontSize: 11 },
  
  splitMainRow: { flexDirection: "row", flexWrap: "wrap", gap: 14, alignItems: "stretch" },
  leftBox60: { flex: 6, minWidth: 340, height: 600, minHeight: 0, padding: 16, borderWidth: 1, borderColor: "#D9E2F0", borderRadius: 14, backgroundColor: "#FFFFFF", gap: 12 },
  rightBox40: { flex: 4, minWidth: 280, height: 600, minHeight: 0, padding: 16, borderWidth: 1, borderColor: "#D9E2F0", borderRadius: 14, backgroundColor: "#FFFFFF", gap: 12 },
  evidenceScroll: { flex: 1, minHeight: 0 },
  evidenceContent: { gap: 12, paddingBottom: 8 },

  boxHeader: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: 1, borderBottomColor: "#E8EDF3", paddingBottom: 8 },
  boxHeaderTitle: { color: "#294880", fontFamily: "PoppinsSemiBold", fontSize: 14, flexShrink: 1 },

  filterCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 0,
    gap: 12,
    position: "relative",
    zIndex: 10,
  },
  filterLineRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  filterDropdownField: {
    flex: 1,
    minWidth: 200,
  },
  filterIconBadge: {
    width: 36,
    height: 36,
    marginBottom: 5,
    borderRadius: 10,
    backgroundColor: "#EAF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  resetFilterButton: {
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    backgroundColor: "#F7F9FD",
  },
  resetFilterButtonText: {
    fontFamily: "PoppinsMedium",
    fontSize: 12,
    color: "#294880",
  },

  mapNoteBox: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#F2F6FC", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  mapNote: { flex: 1, color: "#4B5D7A", fontFamily: "PoppinsRegular", fontSize: 11 },
  mapFrame: { flex: 1, minHeight: 0, overflow: "hidden", borderRadius: 8, borderWidth: 1, borderColor: "#E5EBEA" },
  mapNotice: { position: "absolute", bottom: 12, left: 12, right: 12, padding: 10, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.95)" },
  mapNoticeText: { color: "#607087", fontFamily: "PoppinsRegular", fontSize: 12 },

  contentSection: { paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#EDF0F4", gap: 6 },
  contentSectionLast: { paddingBottom: 4, gap: 6 },
  sectionSubTitle: { color: "#223149", fontFamily: "PoppinsSemiBold", fontSize: 12 },

  subHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  subHeaderBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  selectedReportBox: { gap: 6, paddingVertical: 4 },
  reportDetailRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  sentimentSection: { marginTop: 8, gap: 5, borderTopWidth: 1, borderTopColor: "#EDF0F4", paddingTop: 8 },
  infoLabel: { color: "#647B75", fontFamily: "PoppinsSemiBold", fontSize: 10, textTransform: "uppercase" },
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
  contextRow: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 4 },
  contextCard: { flex: 1, minWidth: 300, gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "#E8EEF7", backgroundColor: "#F9FBFE" },
  contextCardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  contextIconBadge: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 9 },
  contextCardTitle: { color: "#294880", fontFamily: "PoppinsSemiBold", fontSize: 13 },
  contextCardSubtitle: { color: "#718096", fontFamily: "PoppinsRegular", fontSize: 10 },
  contextGroupLabel: { color: "#64748B", fontFamily: "PoppinsSemiBold", fontSize: 10, letterSpacing: 0.3, textTransform: "uppercase", marginTop: 2 },
  statTiles: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statTile: { flexGrow: 1, flexBasis: 92, maxWidth: 150, gap: 2, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: "#E8EEF7", backgroundColor: "#FFFFFF" },
  statValue: { color: "#294880", fontFamily: "PoppinsSemiBold", fontSize: 18 },
  statLabel: { color: "#718096", fontFamily: "PoppinsRegular", fontSize: 10, lineHeight: 14 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  hotspotRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 34, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E8EEF7" },
  hotspotName: { flex: 1, color: "#3B4A5F", fontFamily: "PoppinsMedium", fontSize: 11 },
  hotspotMeta: { color: "#718096", fontFamily: "PoppinsRegular", fontSize: 10 },
  contextNote: { color: "#718096", fontFamily: "PoppinsRegular", fontSize: 10, lineHeight: 16 },
  listRow: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: 1, borderBottomColor: "#EDF0F4" },
  miniListRow: { minHeight: 30, flexDirection: "row", alignItems: "center", gap: 8 },
  zoneMarker: { width: 24, height: 24, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#E8EFFB" },
  zoneMarkerText: { color: "#294880", fontFamily: "PoppinsSemiBold", fontSize: 11 },
  typeDot: { width: 8, height: 8, borderRadius: 4 },
  listPrimary: { flex: 1, color: "#3B4A5F", fontFamily: "PoppinsMedium", fontSize: 12 },
  countBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  zoneLimit: { color: "#64748B", fontFamily: "PoppinsMedium", fontSize: 10, backgroundColor: "#F0F4FA", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10 },
  zoneSeverity: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12 },
  zoneSeverityDot: { width: 5, height: 5, borderRadius: 3 },
  zoneSeverityText: { fontFamily: "PoppinsMedium", fontSize: 10 },
  viewMoreBtn: { alignSelf: "center", marginTop: 16, marginBottom: 6, paddingHorizontal: 30, paddingVertical: 12, borderRadius: 12, backgroundColor: "#294880" },
  viewMoreText: { color: "#FFFFFF", fontSize: 14, fontFamily: "PoppinsSemiBold" },
  scrollTopBtn: { position: "absolute", right: 26, bottom: 30, width: 44, height: 44, borderRadius: 22, backgroundColor: "#294880", alignItems: "center", justifyContent: "center", zIndex: 20, elevation: 6, shadowColor: "#000000", shadowOpacity: 0.22, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  listValue: { color: "#607087", fontFamily: "PoppinsMedium", fontSize: 11 },
  scenarioText: { color: "#43536A", fontFamily: "PoppinsRegular", fontSize: 12, lineHeight: 18, paddingTop: 2 },
  emptyText: { paddingVertical: 8, color: "#718096", fontFamily: "PoppinsRegular", fontSize: 12 },
  actionText: { flex: 1, color: "#43536A", fontFamily: "PoppinsRegular", fontSize: 12 },
});
