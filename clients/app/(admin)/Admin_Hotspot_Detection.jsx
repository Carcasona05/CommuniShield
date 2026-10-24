
import React, {
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";

import Admin_Layout from "../../components/Admin_compo/Admin_Layout";
import AdminHeatMap from "../../components/Admin_compo/AdminHeatMap";
import HotspotSentimentSummary from "../../components/Admin_compo/HotspotSentimentSummary";
import { BatchFilterDropdown } from "../../components/Admin_compo/AdminBatchFilters";
import useRetainedApiQuery from "../../hooks/useRetainedApiQuery";

const EMPTY_REPORTS = [];
const validHotspotResponse = (data) => Array.isArray(data?.reports) && Array.isArray(data?.clustering?.clusters);

const PERIODS = [
  { label: "Any date", value: "all" },
  { label: "Last 24 hours", value: "24h" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
];

const LEVELS = [
  "All",
  "Critical",
  "High",
  "Moderate",
  "Low",
];

const textValue = (value) =>
  String(value ?? "").trim();

const getDate = (report) => {
  const value =
    report?.created_at ||
    report?.reported_at ||
    report?.date;

  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getCategory = (report) =>
  textValue(
    report?.incident_category ||
    report?.category ||
    report?.category_name
  );

const getIncidentType = (report) =>
  textValue(
    report?.incident_type ||
    report?.type ||
    report?.type_name
  );

const hasCoordinates = (report) => {
  if (
    report?.latitude == null ||
    report?.longitude == null
  ) {
    return false;
  }

  const lat = Number(report.latitude);
  const lng = Number(report.longitude);

  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
};

const getHotspotCenter = (hotspot) => {
  if (hotspot?.center) return { ...hotspot.center, zoom: 17 };
  const mappedReports = (hotspot?.reports || []).filter(
    hasCoordinates
  );

  if (mappedReports.length === 0) return null;

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
    zoom: 17,
  };
};

const isExcluded = (report) => {
  const status = textValue(report?.status).toLowerCase();

  return ["rejected", "archived", "marked fake", "fake", "resolved"].includes(
    status
  );
};

const getLevel = (count) => {
  if (count >= 10) return "Critical";
  if (count >= 5) return "High";
  if (count >= 3) return "Moderate";
  return "Low";
};

const getColors = (level) => {
  if (level === "Critical") {
    return {
      color: "#B93838",
      background: "#FDEEEE",
      dot: "#D94841",
    };
  }

  if (level === "High") {
    return {
      color: "#C25E00",
      background: "#FFF0E5",
      dot: "#E66C00",
    };
  }

  if (level === "Moderate") {
    return {
      color: "#8A7300",
      background: "#FEFCE8",
      dot: "#EAB308",
    };
  }

  return {
    color: "#16794B",
    background: "#EAF8F1",
    dot: "#37956D",
  };
};

const getReportStatusColor = (report) => {
  const status = textValue(
    report?.is_verified ? "Verified" : report?.status
  ).toLowerCase();

  if (status.includes("reject") || status.includes("fake")) {
    return "#B93838";
  }

  if (status.includes("resolved") || status.includes("verified")) {
    return "#21764D";
  }

  return "#A9631A";
};

const formatHotspotDate = (value) => {
  const date = value instanceof Date ? value : getDate({ created_at: value });

  return date ? date.toLocaleDateString() : "—";
};

const getPeriodStart = (period) => {
  const start = new Date();

  if (period === "24h") {
    start.setHours(start.getHours() - 24);
  } else if (period === "7d") {
    start.setDate(start.getDate() - 7);
  } else if (period === "30d") {
    start.setDate(start.getDate() - 30);
  } else {
    return null;
  }

  return start;
};

// =====================================================
// MAIN COMPONENT
// =====================================================

export default function Admin_Hotspot_Detection() {
  const scrollViewRef = useRef(null);
  const [mapY, setMapY] = useState(0);

  const { width } = useWindowDimensions();
  const isNarrow = width < 1000;

  // FILTER STATES
  // Location filter has been removed.

  const [selectedCategory, setSelectedCategory] =
    useState("All Categories");

  const [selectedType, setSelectedType] =
    useState("All Incident Types");

  const [period, setPeriod] = useState("30d");

  const [selectedLevel, setSelectedLevel] =
    useState("All");

  const [showAllHotspots, setShowAllHotspots] =
    useState(false);

  const [selectedHotspotKey, setSelectedHotspotKey] =
    useState(null);

  const [detailsHotspotKey, setDetailsHotspotKey] =
    useState(null);

  const [fontsLoaded] = useFonts({
    PoppinsRegular: require("../../assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("../../assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("../../assets/fonts/Poppins-SemiBold.ttf"),
  });

  // =====================================================
  // LOAD REPORTS
  // =====================================================

  const { data, loading, refreshing, checkedAt, errorMessage } = useRetainedApiQuery({
    endpoint: "/admin/clusters",
    params: {
      period,
      category: selectedCategory === "All Categories" ? undefined : selectedCategory,
      incidentType: selectedType === "All Incident Types" ? undefined : selectedType,
    },
    validate: validHotspotResponse,
  });
  const reports = data?.reports || EMPTY_REPORTS;
  const clustering = data?.clustering || null;

  // =====================================================
  // FILTER OPTIONS
  // =====================================================

  const validReports = useMemo(
    () => reports.filter((report) => !isExcluded(report)),
    [reports]
  );

  const categoryOptions = useMemo(() => {
    const categories = [
      ...new Set(
        validReports.map(getCategory).filter(Boolean)
      ),
    ].sort();

    return [
      {
        label: "All Categories",
        value: "All Categories",
      },
      ...categories.map((category) => ({
        label: category,
        value: category,
      })),
    ];
  }, [validReports]);

  const typeOptions = useMemo(() => {
    const categoryFiltered =
      selectedCategory === "All Categories"
        ? validReports
        : validReports.filter(
            (report) =>
              getCategory(report).toLowerCase() ===
              selectedCategory.toLowerCase()
          );

    const types = [
      ...new Set(
        categoryFiltered
          .map(getIncidentType)
          .filter(Boolean)
      ),
    ].sort();

    return [
      {
        label: "All Incident Types",
        value: "All Incident Types",
      },
      ...types.map((type) => ({
        label: type,
        value: type,
      })),
    ];
  }, [validReports, selectedCategory]);

  const periodOptions = PERIODS;

  const levelOptions = LEVELS.map((level) => ({
    label: level === "All" ? "All Levels" : level,
    value: level,
  }));

  // =====================================================
  // APPLY FILTERS
  // =====================================================

  const filteredReports = useMemo(() => {
    const start = getPeriodStart(period);

    return validReports.filter((report) => {
      const category = getCategory(report);
      const type = getIncidentType(report);

      const matchesCategory =
        selectedCategory === "All Categories" ||
        category.toLowerCase() ===
          selectedCategory.toLowerCase();

      const matchesType =
        selectedType === "All Incident Types" ||
        type.toLowerCase() ===
          selectedType.toLowerCase();

      const date = getDate(report);

      const matchesDate =
        !start || (date !== null && date >= start);

      return (
        matchesCategory &&
        matchesType &&
        matchesDate
      );
    });
  }, [
    validReports,
    selectedCategory,
    selectedType,
    period,
  ]);

  // =====================================================
  // GROUP REPORTS INTO HOTSPOTS
  // =====================================================

  const hotspots = useMemo(() => {
    const byId = new Map(validReports.map((report) => [report.id, report]));
    return (clustering?.clusters || []).map((cluster) => {
      const members = cluster.reportIds.map((id) => byId.get(id)).filter(Boolean);
      return {
        ...cluster,
        reports: members,
        count: members.length,
        mappedCount: members.length,
        latestDate: getDate({ created_at: cluster.latestReportAt }),
        types: [...new Set(members.map(getIncidentType).filter(Boolean))],
        level: getLevel(members.length),
      };
    });
  }, [validReports, clustering]);

  const visibleHotspots = useMemo(() => {
    return hotspots.filter(
      (hotspot) =>
        selectedLevel === "All" ||
        hotspot.level === selectedLevel
    );
  }, [hotspots, selectedLevel]);

  const displayedHotspots = showAllHotspots
    ? visibleHotspots
    : visibleHotspots.slice(0, 10);

  const selectedHotspot =
    visibleHotspots.find(
      (item) => item.key === selectedHotspotKey
    ) || null;
  const hotspotFocusTarget = useMemo(() => selectedHotspot ? getHotspotCenter(selectedHotspot) : null, [selectedHotspot]);

  // =====================================================
  // MAP REPORTS
  // =====================================================

  const mapReports = useMemo(() => {
    if (selectedHotspot) {
      return selectedHotspot.reports.filter(
        hasCoordinates
      );
    }

    if (selectedLevel !== "All") {
      return visibleHotspots
        .flatMap((hotspot) => hotspot.reports)
        .filter(hasCoordinates);
    }

    const eligibleIds = new Set([
      ...(clustering?.noiseReportIds || []),
      ...hotspots.flatMap((hotspot) => hotspot.reportIds),
    ]);
    return filteredReports.filter((report) => eligibleIds.has(report.id) && hasCoordinates(report));
  }, [
    selectedHotspot,
    selectedLevel,
    visibleHotspots,
    filteredReports,
    clustering,
    hotspots,
  ]);

  // =====================================================
  // SUMMARY
  // =====================================================

  const summary = useMemo(
    () => ({
      totalReports: filteredReports.length,
      locations: hotspots.length,
      high: hotspots.filter(
        (item) =>
          item.level === "High" ||
          item.level === "Critical"
      ).length,
      moderate: hotspots.filter(
        (item) => item.level === "Moderate"
      ).length,
      unmapped: filteredReports.filter(
        (report) => !hasCoordinates(report)
      ).length,
    }),
    [filteredReports, hotspots]
  );

  // =====================================================
  // ACTIONS
  // =====================================================

  const selectHotspot = (hotspot) => {
    setSelectedHotspotKey(hotspot.key);

    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({
        y: Math.max(0, mapY - 12),
        animated: true,
      });
    });
  };

  const resetMap = () => {
    setSelectedHotspotKey(null);
  };

  const resetFilters = () => {
    setSelectedCategory("All Categories");
    setSelectedType("All Incident Types");
    setPeriod("30d");
    setSelectedLevel("All");
    setSelectedHotspotKey(null);
    setShowAllHotspots(false);
  };

  const updateFilter = (setter, value) => {
    setter(value);
    setSelectedHotspotKey(null);
    setShowAllHotspots(false);
  };

  if (!fontsLoaded) return null;

  return (
    <Admin_Layout>
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!!checkedAt && <Text style={styles.filterResultsText} testID="hotspot-refresh-status">{refreshing ? "Checking for updates… · " : ""}{errorMessage ? "Refresh failed; showing previous results · " : ""}Last checked {new Date(checkedAt).toLocaleTimeString()}</Text>}
        {!!errorMessage && (
          <View style={styles.errorBox}>
            <Ionicons
              name="alert-circle-outline"
              size={21}
              color="#B93838"
            />
            <Text style={styles.errorText}>
              {errorMessage}
            </Text>
          </View>
        )}

        {/* SUMMARY CARDS */}
        <View style={styles.summaryGrid}>
          <SummaryCard
            icon="document-text-outline"
            label="Total Reports"
            value={summary.totalReports}
            subtext="Filtered reports"
            subColor="#5D6F92"
            color="#294880"
            background="#E8EFFB"
          />

          <SummaryCard
            icon="location-outline"
            label="Detected Hotspots"
            value={summary.locations}
            subtext="Spatial clusters"
            subColor="#294880"
            color="#294880"
            background="#E8EFFB"
          />

          <SummaryCard
            icon="warning-outline"
            label="High Concentration"
            value={summary.high}
            subtext="Higher report volume"
            subColor="#E45757"
            color="#E45757"
            background="#FDEEEE"
          />

          <SummaryCard
            icon="alert-circle-outline"
            label="Moderate Concentration"
            value={summary.moderate}
            subtext="Monitor reports"
            subColor="#D97A1E"
            color="#D97A1E"
            background="#FFF4E5"
          />
        </View>

        {/* FILTER REPORTS */}
        <View style={styles.filterCard}>
          <View style={styles.filterHeader}>
            <View style={styles.filterHeaderLeft}>
              <View style={styles.filterIconBox}>
                <Ionicons
                  name="options-outline"
                  size={23}
                  color="#294880"
                />
              </View>

              <View style={styles.filterHeaderText}>
                <Text style={styles.filterTitle}>
                  Filter Reports
                </Text>

                <Text style={styles.filterSubtitle}>
                  Filter incidents by category, type,
                  date, and concentration level
                </Text>
              </View>
            </View>

            <Pressable
              onPress={resetFilters}
              style={styles.resetFilterButton}
            >
              <Ionicons
                name="refresh-outline"
                size={17}
                color="#294880"
              />

              <Text style={styles.resetFilterText}>
                Reset Filters
              </Text>
            </Pressable>
          </View>

          {/* FOUR FILTER DROPDOWNS */}
          <View style={styles.filtersRow}>
            <BatchFilterDropdown
              label="INCIDENT CATEGORY"
              value={selectedCategory}
              placeholder="All Categories"
              options={categoryOptions}
              onChange={(value) => {
                setSelectedCategory(value);
                setSelectedType("All Incident Types");
                setSelectedHotspotKey(null);
                setShowAllHotspots(false);
              }}
            />

            <BatchFilterDropdown
              label="INCIDENT TYPE"
              value={selectedType}
              placeholder="All Incident Types"
              options={typeOptions}
              onChange={(value) =>
                updateFilter(setSelectedType, value)
              }
            />

            <BatchFilterDropdown
              label="DATE"
              value={period}
              placeholder="Any date"
              options={periodOptions}
              onChange={(value) =>
                updateFilter(setPeriod, value)
              }
            />

            <BatchFilterDropdown
              label="CONCENTRATION LEVEL"
              value={selectedLevel}
              placeholder="All Levels"
              options={levelOptions}
              onChange={(value) =>
                updateFilter(setSelectedLevel, value)
              }
            />
          </View>

          <View style={styles.filterFooter}>
            <Ionicons
              name="information-circle-outline"
              size={15}
              color="#718096"
            />

            <Text style={styles.filterResultsText}>
              Showing {displayedHotspots.length} of{" "}
              {visibleHotspots.length} matching locations
            </Text>
          </View>
        </View>

        {/* MAP LEFT - LOCATIONS RIGHT */}
        <View
          style={[
            styles.contentRow,
            isNarrow && styles.contentColumn,
          ]}
          onLayout={(event) => {
            setMapY(event.nativeEvent.layout.y);
          }}
        >
          {/* LEFT SIDE - MAP */}
          <View
            style={[
              styles.panel,
              styles.mapPanel,
              isNarrow && styles.stackedPanel,
            ]}
          >
            <View style={styles.mapHeader}>
              <View style={styles.mapHeaderText}>
                <Text style={styles.sectionTitle}>
                  {selectedHotspot
                    ? selectedHotspot.location
                    : "Incident Concentration Map"}
                </Text>

                <Text style={styles.sectionSubtitle}>
                  {selectedHotspot
                    ? `${selectedHotspot.count} reports · ${selectedHotspot.mappedCount} with coordinates`
                    : `${mapReports.length} mapped reports matching filters`}
                </Text>
              </View>

              {selectedHotspot && (
                <Pressable
                  onPress={resetMap}
                  style={styles.resetMapButton}
                >
                  <Ionicons
                    name="expand-outline"
                    size={16}
                    color="#294880"
                  />
                  <Text style={styles.resetMapText}>
                    Show all
                  </Text>
                </Pressable>
              )}
            </View>

            <View
              style={[
                styles.mapContainer,
                isNarrow && styles.mapContainerNarrow,
              ]}
            >
              {loading && reports.length === 0 ? (
                <View style={styles.mapState}>
                  <ActivityIndicator
                    size="large"
                    color="#294880"
                  />
                  <Text style={styles.stateText}>
                    Loading incident locations...
                  </Text>
                </View>
              ) : mapReports.length > 0 ? (
                <AdminHeatMap
                  key={
                    selectedHotspot
                      ? `hotspot-${selectedHotspot.key}`
                      : "all-hotspots"
                  }
                  reports={mapReports}
                  focusTarget={hotspotFocusTarget}
                  resetView={!selectedHotspot}
                  onReportSelect={(report) => {
                    const match = visibleHotspots.find(
                      (item) => item.reportIds.includes(report.id)
                    );

                    if (match) {
                      selectHotspot(match);
                    }
                  }}
                />
              ) : (
                <View style={styles.mapState}>
                  <Ionicons
                    name="map-outline"
                    size={39}
                    color="#91A39B"
                  />

                  <Text style={styles.stateText}>
                    No mapped reports available
                  </Text>

                  <Text style={styles.stateSubtext}>
                    No reports with valid coordinates
                    match the selected filters.
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.legend}>
              {[
                { label: "Critical", color: "#D94841" },
                { label: "High", color: "#E66C00" },
                { label: "Moderate", color: "#EAB308" },
                { label: "Low", color: "#37956D" },
              ].map((item) => (
                <View
                  key={item.label}
                  style={styles.legendItem}
                >
                  <View
                    style={[
                      styles.legendDot,
                      { backgroundColor: item.color },
                    ]}
                  />
                  <Text style={styles.legendText}>
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.mapHint}>
              <Ionicons
                name="information-circle-outline"
                size={17}
                color="#71847D"
              />

              <Text style={styles.mapHintText}>
                Select a location from the list to focus
                the map. Use Show all to reset the view.
              </Text>
            </View>
          </View>

          {/* RIGHT SIDE - DETECTED LOCATIONS */}
          <View
            testID="hotspot-list-panel"
            style={[
              styles.panel,
              styles.locationsPanel,
              isNarrow && styles.stackedPanel,
            ]}
          >
            <View style={styles.listHeader}>
              <View style={styles.listHeaderText}>
                <Text style={styles.sectionTitle}>
                  DBSCAN Hotspots
                </Text>

                <Text style={styles.sectionSubtitle}>
                  Ranked by report count across distinct locations.
                </Text>
              </View>

              <Text style={styles.countText}>
                {visibleHotspots.length} {visibleHotspots.length === 1 ? "hotspot" : "hotspots"}
              </Text>
            </View>

            <ScrollView
              style={styles.locationsScroll}
              contentContainerStyle={
                styles.locationsScrollContent
              }
              showsVerticalScrollIndicator
              nestedScrollEnabled
            >
              {loading ? (
                <View style={styles.emptyState}>
                  <ActivityIndicator
                    size="large"
                    color="#294880"
                  />
                  <Text style={styles.stateText}>
                    Fetching reports...
                  </Text>
                </View>
              ) : visibleHotspots.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons
                    name="location-outline"
                    size={36}
                    color="#91A39B"
                  />

                  <Text style={styles.stateText}>
                    No spatial hotspots detected
                  </Text>

                  <Text style={styles.stateSubtext}>
                    A hotspot requires at least 4 distinct locations within 300 m neighbourhoods. Repeated reports at one pin alone do not qualify.
                  </Text>
                </View>
              ) : (
                <>
                  <View style={styles.locationList}>
                    {displayedHotspots.map(
                      (hotspot, index) => {
                        const colors = getColors(
                          hotspot.level
                        );

                        const selected =
                          selectedHotspotKey ===
                          hotspot.key;
                        const detailsOpen =
                          detailsHotspotKey ===
                          hotspot.key;
                        const radiusMeters = Number(
                          hotspot.radiusMeters
                        );
                        const radiusLabel =
                          Number.isFinite(radiusMeters)
                            ? `${Math.round(radiusMeters)} m`
                            : "—";
                        const firstDate = formatHotspotDate(
                          hotspot.firstReportAt
                        );
                        const latestDate = formatHotspotDate(
                          hotspot.latestReportAt
                        );
                        const barangayLabel =
                          Array.isArray(hotspot.barangays) &&
                          hotspot.barangays.length > 0
                            ? hotspot.barangays.join(" / ")
                            : hotspot.location;

                        return (
                          <View
                            key={hotspot.key}
                            style={[
                              styles.locationCard,
                              selected &&
                                styles.locationCardSelected,
                            ]}
                          >
                            <Pressable
                              testID="spatial-hotspot-card"
                              onPress={() =>
                                selectHotspot(hotspot)
                              }
                              style={styles.locationCardMain}
                            >
                              <View
                                style={[
                                  styles.rankBox,
                                  selected &&
                                    styles.rankBoxSelected,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.rankText,
                                    selected &&
                                      styles.rankTextSelected,
                                  ]}
                                >
                                  {index + 1}
                                </Text>
                              </View>

                              <View
                                style={styles.locationContent}
                              >
                                <Text
                                  style={styles.locationName}
                                >
                                  {hotspot.location}
                                </Text>

                                <Text
                                  style={styles.locationMeta}
                                >
                                  {hotspot.count}{" "}
                                  {hotspot.count === 1
                                    ? "report"
                                    : "reports"}
                                  {" · "}
                                  {hotspot.uniqueLocationCount} distinct locations
                                </Text>

                                <View
                                  style={
                                    styles.locationLevelRow
                                  }
                                >
                                  <View
                                    style={[
                                      styles.levelDot,
                                      {
                                        backgroundColor:
                                          colors.dot,
                                      },
                                    ]}
                                  />

                                  <Text
                                    style={[
                                      styles.levelText,
                                      {
                                        color: colors.color,
                                      },
                                    ]}
                                  >
                                    {hotspot.level} concentration
                                  </Text>
                                </View>

                                <Text
                                  style={styles.hotspotSummary}
                                >
                                  {hotspot.count} reports from{" "}
                                  {hotspot.uniqueLocationCount} distinct
                                  locations within a {radiusLabel} spread.
                                  {latestDate !== "—"
                                    ? ` Latest activity ${latestDate}.`
                                    : ""}
                                </Text>
                              </View>

                              <View
                                style={styles.locationAction}
                              >
                                <View
                                  style={[
                                    styles.levelBadge,
                                    {
                                      backgroundColor:
                                        colors.background,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.levelBadgeText,
                                      {
                                        color: colors.color,
                                      },
                                    ]}
                                  >
                                    {hotspot.level}
                                  </Text>
                                </View>

                                <Ionicons
                                  name={
                                    selected
                                      ? "checkmark-circle"
                                      : "locate-outline"
                                  }
                                  size={20}
                                  color="#294880"
                                />

                                <Text
                                  style={styles.viewMapText}
                                >
                                  {selected
                                    ? "Selected"
                                    : "Focus map"}
                                </Text>
                              </View>
                            </Pressable>

                            <Pressable
                              testID="hotspot-details-toggle"
                              accessibilityRole="button"
                              accessibilityState={{
                                expanded: detailsOpen,
                              }}
                              onPress={() =>
                                setDetailsHotspotKey(
                                  detailsOpen
                                    ? null
                                    : hotspot.key
                                )
                              }
                              style={styles.detailsToggle}
                            >
                              <Text
                                style={styles.detailsToggleText}
                              >
                                {detailsOpen
                                  ? "Hide details"
                                  : "View all details"}
                              </Text>

                              <Ionicons
                                name={
                                  detailsOpen
                                    ? "chevron-up"
                                    : "chevron-down"
                                }
                                size={18}
                                color="#294880"
                              />
                            </Pressable>

                            {detailsOpen && (
                              <View
                                testID="hotspot-details-panel"
                                style={styles.detailsPanel}
                              >
                                <View
                                  style={styles.detailsMetrics}
                                >
                                  {[
                                    {
                                      label: "Reports",
                                      value: hotspot.count,
                                    },
                                    {
                                      label: "Distinct locations",
                                      value:
                                        hotspot.uniqueLocationCount,
                                    },
                                    {
                                      label: "Spatial spread",
                                      value: radiusLabel,
                                    },
                                    {
                                      label: "First report",
                                      value: firstDate,
                                    },
                                    {
                                      label: "Latest report",
                                      value: latestDate,
                                    },
                                    {
                                      label: "Concentration",
                                      value: hotspot.level,
                                    },
                                  ].map((metric) => (
                                    <View
                                      key={metric.label}
                                      style={styles.detailMetric}
                                    >
                                      <Text
                                        style={
                                          styles.detailMetricLabel
                                        }
                                      >
                                        {metric.label}
                                      </Text>

                                      <Text
                                        style={
                                          styles.detailMetricValue
                                        }
                                      >
                                        {metric.value}
                                      </Text>
                                    </View>
                                  ))}
                                </View>

                                <View
                                  style={styles.detailsBlock}
                                >
                                  <Text
                                    style={styles.detailsLabel}
                                  >
                                    Barangays covered
                                  </Text>

                                  <Text
                                    style={styles.detailsValue}
                                  >
                                    {barangayLabel}
                                  </Text>
                                </View>

                                <View
                                  style={styles.detailsBlock}
                                >
                                  <Text
                                    style={styles.detailsLabel}
                                  >
                                    Incident types (
                                    {hotspot.types.length})
                                  </Text>

                                  {hotspot.types.length > 0 ? (
                                    <View
                                      style={styles.typeChips}
                                    >
                                      {hotspot.types.map(
                                        (type) => (
                                          <View
                                            key={type}
                                            style={styles.typeChip}
                                          >
                                            <Text
                                              style={
                                                styles.typeChipText
                                              }
                                            >
                                              {type}
                                            </Text>
                                          </View>
                                        )
                                      )}
                                    </View>
                                  ) : (
                                    <Text
                                      style={styles.detailsValue}
                                    >
                                      No incident type recorded.
                                    </Text>
                                  )}
                                </View>

                                <View
                                  style={styles.detailsBlock}
                                >
                                  <Text
                                    style={styles.detailsLabel}
                                  >
                                    Reports in this hotspot (
                                    {hotspot.reports.length})
                                  </Text>

                                  {hotspot.reports.length > 0 ? (
                                    <View>
                                      {hotspot.reports.map(
                                        (
                                          report,
                                          reportIndex
                                        ) => (
                                          <View
                                            key={
                                              report.id ||
                                              `${hotspot.key}-report-${reportIndex}`
                                            }
                                            style={
                                              styles.detailReportRow
                                            }
                                          >
                                            <View
                                              style={
                                                styles.detailReportMain
                                              }
                                            >
                                              <Text
                                                style={
                                                  styles.detailReportTitle
                                                }
                                              >
                                                {getIncidentType(
                                                  report
                                                ) ||
                                                  "Incident report"}
                                              </Text>

                                              <Text
                                                style={
                                                  styles.detailReportMeta
                                                }
                                              >
                                                {formatHotspotDate(
                                                  report.created_at
                                                )}
                                                {report.location
                                                  ? ` · ${report.location}`
                                                  : ""}
                                              </Text>
                                            </View>

                                            <Text
                                              style={[
                                                styles.detailReportStatus,
                                                {
                                                  color:
                                                    getReportStatusColor(
                                                      report
                                                    ),
                                                },
                                              ]}
                                            >
                                              {report.is_verified
                                                ? "Verified"
                                                : report.status ||
                                                  "Pending"}
                                            </Text>
                                          </View>
                                        )
                                      )}
                                    </View>
                                  ) : (
                                    <Text
                                      style={styles.detailsValue}
                                    >
                                      No member reports available.
                                    </Text>
                                  )}
                                </View>

                                <HotspotSentimentSummary
                                  evidence={hotspot.evidence}
                                />
                              </View>
                            )}
                          </View>
                        );
                      }
                    )}
                  </View>

                  {visibleHotspots.length > 10 && (
                    <Pressable
                      onPress={() =>
                        setShowAllHotspots(
                          !showAllHotspots
                        )
                      }
                      style={styles.viewMoreButton}
                    >
                      <Text style={styles.viewMoreText}>
                        {showAllHotspots
                          ? "Show Less"
                          : `View More (${visibleHotspots.length - 10} more)`}
                      </Text>

                      <Ionicons
                        name={
                          showAllHotspots
                            ? "chevron-up"
                            : "chevron-down"
                        }
                        size={18}
                        color="#294880"
                      />
                    </Pressable>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>

        {/* DATA QUALITY */}
        <View style={styles.qualityBox}>
          <Ionicons
            name="shield-checkmark-outline"
            size={21}
            color="#294880"
          />

          <View style={styles.qualityContent}>
            <Text style={styles.qualityTitle}>
              Synthetic-data prototype · DBSCAN
            </Text>

            <Text style={styles.qualityText}>
              {clustering?.summary?.eligibleReportCount ?? 0} eligible reports · {clustering?.summary?.uniqueLocationCount ?? 0} distinct locations · {clustering?.summary?.repeatedPinReports ?? 0} additional reports at shared pins · {clustering?.summary?.noiseLocationCount ?? 0} unclustered locations.
              {" "}{clustering?.summary?.excluded?.outsideBoundary ?? 0} outside-boundary and {clustering?.summary?.excluded?.invalidCoordinates ?? 0} invalid-coordinate reports excluded.
            </Text>
          </View>
        </View>

        <Text style={styles.disclaimer}>
          Synthetic test data only—not actual danger, future incident probability, or evidence of policing effectiveness. DBSCAN uses a 300 m neighbourhood and 4 distinct locations (including the point itself); shared pins retain report counts but cannot establish density alone. Levels describe report volume, not forecast risk.
        </Text>
      </ScrollView>
    </Admin_Layout>
  );
}

// =====================================================
// SUMMARY CARD COMPONENT
// =====================================================

function SummaryCard({
  icon,
  label,
  value,
  subtext,
  subColor,
  color,
  background,
}) {
  return (
    <View style={styles.summaryCard}>
      <View
        style={[
          styles.summaryIcon,
          { backgroundColor: background },
        ]}
      >
        <Ionicons
          name={icon}
          size={24}
          color={color}
        />
      </View>

      <View style={styles.summaryContent}>
        <Text style={styles.summaryLabel}>
          {label}
        </Text>

        <View style={styles.summaryValueRow}>
          <Text
            style={[
              styles.summaryValue,
              { color },
            ]}
          >
            {value}
          </Text>

          <Text
            style={[
              styles.summarySubtext,
              { color: subColor },
            ]}
          >
            {subtext}
          </Text>
        </View>
      </View>
    </View>
  );
}

// =====================================================
// STYLES
// =====================================================

const styles = StyleSheet.create({
  page: {
    padding: 20,
    paddingBottom: 32,
    gap: 16,
    backgroundColor: "#F8FAFC",
  },

  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#F0C7C7",
    backgroundColor: "#FFF7F7",
  },

  errorText: {
    flex: 1,
    fontFamily: "PoppinsRegular",
    fontSize: 11,
    color: "#854545",
  },

  // SUMMARY CARDS

  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
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

  summaryIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },

  summaryContent: {
    flex: 1,
  },

  summaryLabel: {
    fontSize: 14,
    color: "#4B5D7A",
    marginBottom: 6,
    fontFamily: "PoppinsMedium",
  },

  summaryValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 8,
  },

  summaryValue: {
    fontSize: 22,
    fontFamily: "PoppinsSemiBold",
  },

  summarySubtext: {
    fontSize: 11,
    fontFamily: "PoppinsRegular",
  },

  // FILTER PANEL

  filterCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 20,
    padding: 22,
    gap: 18,
    position: "relative",
    zIndex: 100,
    overflow: "visible",
  },

  filterHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
  },

  filterHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 220,
    gap: 12,
  },

  filterIconBox: {
    width: 52,
    height: 52,
    borderRadius: 15,
    backgroundColor: "#E8EFFB",
    alignItems: "center",
    justifyContent: "center",
  },

  filterHeaderText: {
    flex: 1,
  },

  filterTitle: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 19,
    color: "#294880",
  },

  filterSubtitle: {
    fontFamily: "PoppinsRegular",
    fontSize: 13,
    color: "#5D6F92",
    marginTop: 2,
  },

  resetFilterButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: "#E8EFFB",
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },

  resetFilterText: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 12,
    color: "#294880",
  },

  filtersRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "flex-start",
    position: "relative",
    zIndex: 100,
    overflow: "visible",
  },

  filterFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  filterResultsText: {
    fontFamily: "PoppinsRegular",
    fontSize: 11,
    color: "#718096",
  },

  // MAP AND LOCATION LIST LAYOUT

  contentRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 16,
  },

  contentColumn: {
    flexDirection: "column",
  },

  mapPanel: {
    flexGrow: 3,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    height: 650,
  },

  locationsPanel: {
    flexGrow: 2,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    height: 650,
  },

  stackedPanel: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    width: "100%",
  },

  panel: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },

  sectionTitle: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 15,
    color: "#294880",
  },

  sectionSubtitle: {
    fontFamily: "PoppinsRegular",
    fontSize: 13,
    color: "#647B75",
  },

  // MAP

  mapHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },

  mapHeaderText: {
    flex: 1,
    minWidth: 0,
  },

  resetMapButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    backgroundColor: "#F8FAF9",
  },

  resetMapText: {
    fontFamily: "PoppinsMedium",
    fontSize: 13,
    color: "#294880",
  },

  mapContainer: {
    flex: 1,
    minHeight: 280,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E5EBEA",
    backgroundColor: "#F2F5F4",
  },

  mapContainerNarrow: {
    flex: 0,
    height: 430,
  },

  mapState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    gap: 8,
  },

  stateText: {
    fontFamily: "PoppinsMedium",
    fontSize: 13,
    color: "#294880",
    textAlign: "center",
  },

  stateSubtext: {
    fontFamily: "PoppinsRegular",
    fontSize: 13,
    color: "#647B75",
    textAlign: "center",
  },

  legend: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 16,
    marginTop: 4,
  },

  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  legendText: {
    fontFamily: "PoppinsRegular",
    fontSize: 13,
    color: "#4B5D7A",
  },

  mapHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F2F6FC",
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 8,
  },

  mapHintText: {
    flex: 1,
    fontFamily: "PoppinsRegular",
    fontSize: 13,
    color: "#4B5D7A",
  },

  // DETECTED LOCATIONS

  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 6,
  },

  listHeaderText: {
    flex: 1,
    minWidth: 150,
  },

  countText: {
    fontFamily: "PoppinsMedium",
    fontSize: 14,
    color: "#294880",
  },

  locationsScroll: {
    flex: 1,
  },

  locationsScrollContent: {
    paddingBottom: 6,
  },

  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
    gap: 8,
  },

  locationList: {
    gap: 10,
  },

  locationCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5EBEA",
    backgroundColor: "#F8FAF9",
  },

  locationCardMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  locationCardSelected: {
    borderColor: "#294880",
    backgroundColor: "#F2F6FC",
  },

  rankBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "#E5EBEA",
    alignItems: "center",
    justifyContent: "center",
  },

  rankBoxSelected: {
    backgroundColor: "#294880",
  },

  rankText: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 14,
    color: "#647B75",
  },

  rankTextSelected: {
    color: "#FFFFFF",
  },

  locationContent: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },

  locationName: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 15,
    color: "#294880",
  },

  locationMeta: {
    fontFamily: "PoppinsRegular",
    fontSize: 13,
    color: "#647B75",
  },

  locationLevelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },

  levelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  levelText: {
    fontFamily: "PoppinsMedium",
    fontSize: 13,
  },

  hotspotSummary: {
    fontFamily: "PoppinsRegular",
    fontSize: 12,
    lineHeight: 18,
    color: "#52667F",
    marginTop: 3,
  },

  detailsToggle: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    backgroundColor: "#FFFFFF",
  },

  detailsToggleText: {
    fontFamily: "PoppinsMedium",
    fontSize: 13,
    color: "#294880",
  },

  detailsPanel: {
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    gap: 12,
  },

  detailsMetrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  detailMetric: {
    flexGrow: 1,
    flexBasis: 120,
    minWidth: 110,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5EBEA",
    backgroundColor: "#FFFFFF",
  },

  detailMetricLabel: {
    fontFamily: "PoppinsMedium",
    fontSize: 12,
    color: "#647B75",
    marginBottom: 2,
  },

  detailMetricValue: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 14,
    color: "#294880",
  },

  detailsBlock: {
    gap: 6,
  },

  detailsLabel: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 13,
    color: "#294880",
  },

  detailsValue: {
    fontFamily: "PoppinsRegular",
    fontSize: 12,
    lineHeight: 18,
    color: "#52667F",
  },

  typeChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },

  typeChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "#EEF3FF",
  },

  typeChipText: {
    fontFamily: "PoppinsMedium",
    fontSize: 12,
    color: "#294880",
  },

  detailReportRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: "#EDF2F7",
  },

  detailReportMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },

  detailReportTitle: {
    fontFamily: "PoppinsMedium",
    fontSize: 13,
    color: "#294880",
  },

  detailReportMeta: {
    fontFamily: "PoppinsRegular",
    fontSize: 12,
    color: "#647B75",
  },

  detailReportStatus: {
    fontFamily: "PoppinsMedium",
    fontSize: 12,
    textAlign: "right",
  },

  incidentTypes: {
    fontFamily: "PoppinsRegular",
    fontSize: 12,
    color: "#82918B",
    marginTop: 2,
  },

  latestText: {
    fontFamily: "PoppinsRegular",
    fontSize: 12,
    color: "#82918B",
  },

  locationAction: {
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },

  levelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },

  levelBadgeText: {
    fontFamily: "PoppinsMedium",
    fontSize: 12,
  },

  viewMapText: {
    fontFamily: "PoppinsMedium",
    fontSize: 12,
    color: "#294880",
  },

  viewMoreButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    backgroundColor: "#F8FAF9",
    marginTop: 10,
  },

  viewMoreText: {
    fontFamily: "PoppinsMedium",
    fontSize: 14,
    color: "#294880",
  },

  // DATA QUALITY

  qualityBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    backgroundColor: "#FFFFFF",
  },

  qualityContent: {
    flex: 1,
    gap: 2,
  },

  qualityTitle: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 15,
    color: "#294880",
  },

  qualityText: {
    fontFamily: "PoppinsRegular",
    fontSize: 13,
    lineHeight: 18,
    color: "#647B75",
  },

  disclaimer: {
    fontFamily: "PoppinsRegular",
    fontSize: 12,
    lineHeight: 17,
    color: "#82918B",
    textAlign: "center",
    paddingHorizontal: 10,
  },
});
