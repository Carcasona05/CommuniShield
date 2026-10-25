import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import Admin_Layout from "../../components/Admin_compo/Admin_Layout";
import AdminHeatMap from "../../components/Admin_compo/AdminHeatMap";
import SentimentEvidenceChart from "../../components/Admin_compo/SentimentEvidenceChart";
import RiskOutlookPanel from "../../components/Admin_compo/RiskOutlookPanel";
import useRetainedApiQuery from "../../hooks/useRetainedApiQuery";
import useSmoothScrollToTop from "../../hooks/useSmoothScrollToTop";
import { sentimentOrigin } from "../../services/sentimentOrigin";
import { getReportBarangay } from "../../services/argaoLocation";
import { ARGAO_BARANGAYS as ARGAO_BARANGAY_DATA } from "../../constants/argaoMapData";
import { buildRiskZones, isActiveRiskReport, RISK_ZONE_LIMIT } from "../../services/riskZones";

const ARGAO_BARANGAYS = [
  "All Barangays",
  ...ARGAO_BARANGAY_DATA.map(({ name }) => name),
];
const EMPTY_REPORTS = [];
const validOutlookResponse = (data) => Array.isArray(data?.reports) && Boolean(data?.forecast);

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
  const [visibleZoneCount, setVisibleZoneCount] = useState(RISK_ZONE_LIMIT);
  
  const [selectedBarangay, setSelectedBarangay] = useState("All Barangays");
  const [selectedMarkerReport, setSelectedMarkerReport] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
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
    params: { barangay: selectedBarangay === "All Barangays" ? undefined : selectedBarangay },
    validate: validOutlookResponse,
  });
  const reports = outlook?.reports || EMPTY_REPORTS;

  const reportBarangay = (report) => getReportBarangay(report).toLowerCase();
  const selectedReports = useMemo(() => reports.filter((report) =>
    isActiveRiskReport(report) &&
    (selectedBarangay === "All Barangays" || reportBarangay(report) === selectedBarangay.toLowerCase())
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

  const currentMapReports = useMemo(() => selectedReports.filter((report) =>
    report.latitude != null && report.longitude != null &&
    Number.isFinite(Number(report.latitude)) && Number.isFinite(Number(report.longitude))
  ), [selectedReports]);
  const highSeverityCount = selectedReports.filter((report) =>
    ["high", "critical"].includes(String(report.severity || "").toLowerCase())
  ).length;
  const zones = useMemo(() => buildRiskZones(reports, Infinity), [reports]);
  const visibleZones = zones.slice(0, visibleZoneCount);

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

  const activeCount = selectedReports.length;
  const mapFocusTarget = useMemo(() => selectedBarangay !== "All Barangays"
    ? (() => { const place = ARGAO_BARANGAY_DATA.find((item) => item.name.toLowerCase() === selectedBarangay.toLowerCase()); return place ? { latitude: place.lat, longitude: place.lng, zoom: 16 } : null; })()
    : null, [selectedBarangay]);

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
      scrollToTop();
    });
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
        <View style={styles.overview}>
          <View style={styles.indicatorSummary}>
            <View style={[styles.indicatorIcon, { backgroundColor: "#EAF2FF" }]}>
              <Ionicons name="pulse-outline" size={22} color="#294880" />
            </View>
            <View style={styles.indicatorText}>
              <View style={styles.overlineRow}>
                <Ionicons name="time-outline" size={12} color="#294880" />
                <Text style={[styles.overline, { color: "#294880" }]}>CURRENT · LAST 30 DAYS</Text>
              </View>
              <Text style={styles.indicatorTitle}>
                {loading ? "Updating indicators..." : "Current risk indicators"}
              </Text>
              <Text style={styles.muted}>{outlook?.current?.spatialHotspotCount ?? "—"} DBSCAN hotspots · not a prediction</Text>
            </View>
          </View>

          <View style={styles.metrics}>
            <Metric 
              icon="document-text-outline" 
              label="Active reports" 
              value={loading || !outlook ? "—" : activeCount}
              valueColor="#294880"
            />
            <Metric 
              icon="warning-outline" 
              label="High severity" 
              value={loading || !outlook ? "—" : highSeverityCount}
              valueColor={highSeverityCount > 0 ? "#B93838" : "#16794B"}
            />
            <Metric 
              icon="stats-chart-outline" 
              label="Verified active"
              value={outlook?.current?.evidence?.verification?.verified ?? "—"}
              valueColor="#294880"
            />
          </View>
        </View>

        <RiskOutlookPanel forecast={errorMessage ? null : outlook?.forecast} scope={selectedBarangay} loading={loading} />

        {/* Current report map and evidence, separate from the future outlook. */}
        <View style={styles.splitMainRow}>
          
          {/* Left Column: Map Box (60%) */}
          <View style={styles.leftBox60}>
            <View style={styles.boxHeader}>
              <Ionicons name="map-outline" size={18} color="#294880" />
              <Text style={styles.boxHeaderTitle}>Current report locations · not a forecast map</Text>
            </View>

            {/* FILTER PANEL */}
            <View style={styles.filterCard}>
              <View style={styles.filterLineRow}>
                <View style={styles.filterIconBadge}>
                  <Ionicons name="options-outline" size={16} color="#294880" />
                </View>
                <Text style={styles.filterCardTitle}>Barangay</Text>

                <TouchableOpacity
                  testID="risk-zone-location-filter"
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

            

            {currentMapReports.length ? (
              <View style={styles.mapFrame}>
                <AdminHeatMap reports={currentMapReports} focusTarget={mapFocusTarget} onReportSelect={handleMarkerSelect} />
              </View>
            ) : (
              <View style={styles.emptyMapState}>
                <Ionicons name="map-outline" size={32} color="#91A39B" />
                <Text style={styles.emptyText}>
                  {loading ? "Loading mapped reports..." : !outlook ? "Current indicators unavailable." : "No active reports match this Barangay filter."}
                </Text>
              </View>
            )}
          </View>

          {/* Right Column: Details, Recommendations, and Results Box (40%) */}
          <View style={styles.rightBox40}>
            <View style={styles.boxHeader}>
              <Ionicons name="analytics-outline" size={18} color="#294880" />
              <Text style={styles.boxHeaderTitle}>Observed evidence & review</Text>
            </View>

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
                          <Text style={styles.commentMeta}>{comment.user || "User"}{comment.sentiment ? ` · ${comment.sentiment}` : ""}{sentimentOrigin(comment.sentiment_model) ? ` · ${sentimentOrigin(comment.sentiment_model)}` : ""}</Text>
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
                evidence={outlook?.current?.evidence}
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
                  <Text style={styles.statValue}>{outlook?.current?.evidence?.verification?.verified ?? 0}</Text>
                  <Text style={styles.statLabel}>Verified</Text>
                </View>
                <View style={styles.statTile}>
                  <Text style={styles.statValue}>{outlook?.current?.evidence?.verification?.underVerification ?? 0}</Text>
                  <Text style={styles.statLabel}>Under verification</Text>
                </View>
                <View style={styles.statTile}>
                  <Text style={styles.statValue}>{outlook?.current?.evidence?.verification?.pendingReview ?? 0}</Text>
                  <Text style={styles.statLabel}>Pending review</Text>
                </View>
                {!!outlook?.current?.evidence?.verification?.other && (
                  <View style={styles.statTile}>
                    <Text style={styles.statValue}>{outlook.current.evidence.verification.other}</Text>
                    <Text style={styles.statLabel}>Other</Text>
                  </View>
                )}
              </View>

              <Text style={styles.contextGroupLabel}>Severity of active reports</Text>
              <View style={styles.chipRow}>
                {["Critical", "High", "Medium", "Low", "Unknown"].map((level) => {
                  const theme = ZONE_SEVERITY_THEME[level];
                  const count = outlook?.current?.severity?.[level] ?? 0;
                  return (
                    <View key={level} style={[styles.zoneSeverity, { backgroundColor: theme.background }]} accessibilityLabel={`${level === "Unknown" ? "Not rated" : level} severity: ${count} reports`}>
                      <View style={[styles.zoneSeverityDot, { backgroundColor: theme.color }]} />
                      <Text style={[styles.zoneSeverityText, { color: theme.color }]}>{level === "Unknown" ? "Not rated" : level} {count}</Text>
                    </View>
                  );
                })}
              </View>

              <Text style={styles.contextGroupLabel}>Intersecting spatial hotspots</Text>
              {(outlook?.current?.clusters || []).length ? (
                outlook.current.clusters.map((cluster) => (
                  <View key={`${cluster.location}-${cluster.reportIds?.[0] || cluster.location}`} style={styles.hotspotRow}>
                    <Ionicons name="location-sharp" size={14} color="#294880" />
                    <Text style={styles.hotspotName}>{cluster.location}</Text>
                    <Text style={styles.hotspotMeta}>{cluster.reportCount} reports · {cluster.uniqueLocationCount} locations</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>No DBSCAN hotspot intersects this scope. This is not proof that the area is safe.</Text>
              )}

              {outlook?.current?.snapshotMayBeLimited && <Text style={styles.contextNote}>Current indicators may be limited by the dashboard snapshot. Forecast history uses a separate paginated read.</Text>}
              <Text style={styles.contextNote}>Severity comes from the automated credibility analysis of each submitted report and still requires human review. These counts are descriptive, not a forecast.</Text>
            </View>
          </View>

          <Text style={styles.contextNote}>Sentiment tone and severity labels describe submitted reports for review; they are not evidence of danger and do not change the 7-day outlook. {outlook?.current?.note || ""}</Text>
        </View>

        {/* Descriptive barangay counts, not predicted zones. */}
        <View style={styles.bottomSection}>
          <View style={styles.boxHeader}>
            <Ionicons name="list-outline" size={18} color="#294880" />
            <Text style={styles.boxHeaderTitle}>Current report concentrations by barangay</Text>
            <Text style={styles.zoneLimit}>{visibleZones.length} / {zones.length} zones</Text>
          </View>
          {zones.length ? (
            visibleZones.map((zone, index) => (
              <TouchableOpacity
                testID="current-report-zone"
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
                <View accessibilityLabel={`Highest active report severity: ${zone.severity === "Unknown" ? "Not rated" : zone.severity}`} style={[styles.zoneSeverity, { backgroundColor: ZONE_SEVERITY_THEME[zone.severity].background }]}>
                  <View style={[styles.zoneSeverityDot, { backgroundColor: ZONE_SEVERITY_THEME[zone.severity].color }]} />
                  <Text style={[styles.zoneSeverityText, { color: ZONE_SEVERITY_THEME[zone.severity].color }]}>{zone.severity === "Unknown" ? "Not rated" : zone.severity}</Text>
                </View>
                <View style={styles.countBadge}>
                  <Ionicons name="document-text-outline" size={12} color="#647B75" />
                  <Text style={styles.listValue}>{zone.count} report{zone.count === 1 ? "" : "s"}</Text>
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <Text style={styles.emptyText}>{loading ? "Loading current report concentrations..." : !outlook ? "Current indicators unavailable." : "No qualifying active reports."}</Text>
          )}
          {zones.length > visibleZones.length ? <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="View more current zones"
            style={styles.viewMoreBtn}
            onPress={() => setVisibleZoneCount((count) => count + RISK_ZONE_LIMIT)}
            activeOpacity={0.8}
          >
            <Text style={styles.viewMoreText}>View more</Text>
          </TouchableOpacity> : null}
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
  wrapper: { flex: 1, backgroundColor: "#F5F8FC" },
  page: { padding: 24, paddingBottom: 36, gap: 18 },
  
  overview: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  indicatorSummary: {
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
  indicatorIcon: { width: 46, height: 46, justifyContent: "center", alignItems: "center", borderRadius: 12 },
  indicatorText: { flex: 1, gap: 2 },
  overlineRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  overline: { fontFamily: "PoppinsSemiBold", fontSize: 10, letterSpacing: 0.5 },
  indicatorTitle: { color: "#294880", fontFamily: "PoppinsSemiBold", fontSize: 16 },
  muted: { color: "#647B75", fontFamily: "PoppinsRegular", fontSize: 11 },
  
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
