import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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

const CACHE_KEY = "api:/admin/dashboard";

const PERIODS = [
  { label: "All time", value: "all" },
  { label: "24 hours", value: "24h" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
];

const LEVELS = ["All", "Critical", "High", "Moderate", "Low"];

const ALL_ARGAO_BARANGAYS = ARGAO_BARANGAYS.map((b) => b.name);

const textValue = (value) => String(value ?? "").trim();

const getDate = (report) => {
  const value = report?.created_at || report?.reported_at || report?.date;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getLocation = (report) => {
  const barangay = textValue(report?.barangay || report?.barangay_name);
  if (barangay) return barangay;
  const location = textValue(report?.location);
  if (location) return location;
  if (report?.latitude != null && report?.longitude != null) {
    return `${Number(report.latitude).toFixed(4)}, ${Number(report.longitude).toFixed(4)}`;
  }
  return "Location not specified";
};

const hasCoordinates = (report) => {
  if (report?.latitude == null || report?.longitude == null) return false;
  const lat = Number(report.latitude);
  const lng = Number(report.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
};

const getHotspotCenter = (hotspot) => {
  const mappedReports = (hotspot?.reports || []).filter(hasCoordinates);
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
    zoom: 16,
  };
};

const isExcluded = (report) => {
  const status = textValue(report?.status).toLowerCase();
  return ["rejected", "archived", "marked fake"].includes(status);
};

const getLevel = (count) => {
  if (count >= 10) return "Critical";
  if (count >= 5) return "High";
  if (count >= 3) return "Moderate";
  return "Low";
};

const getColors = (level) => {
  if (level === "Critical") return { color: "#B93838", background: "#FDEEEE", dot: "#D94841" };
  if (level === "High") return { color: "#C25E00", background: "#FFF0E5", dot: "#E66C00" };
  if (level === "Moderate") return { color: "#8A7300", background: "#FEFCE8", dot: "#EAB308" };
  return { color: "#16794B", background: "#EAF8F1", dot: "#37956D" };
};

const getPeriodStart = (period) => {
  const now = new Date();
  const start = new Date(now);
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

export default function Admin_Hotspot_Detection() {
  const { width } = useWindowDimensions();
  const isNarrow = width < 950;

  const scrollViewRef = useRef(null);
  const [mapY, setMapY] = useState(0);

  const [reports, setReports] = useState(() => {
    const cached = getCache(CACHE_KEY);
    return Array.isArray(cached?.reports) ? cached.reports : [];
  });

  const [loading, setLoading] = useState(() => getCache(CACHE_KEY) === undefined);
  const [errorMessage, setErrorMessage] = useState("");

  // Filters state
  const [period, setPeriod] = useState("7d");
  const [selectedLocation, setSelectedLocation] = useState("All");
  const [selectedLevel, setSelectedLevel] = useState("All");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  const [showAllHotspots, setShowAllHotspots] = useState(false);
  const [selectedHotspotKey, setSelectedHotspotKey] = useState(null);

  const [fontsLoaded] = useFonts({
    PoppinsRegular: require("../../assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("../../assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("../../assets/fonts/Poppins-SemiBold.ttf"),
  });

  const loadReports = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) {
        setErrorMessage("Your session is missing. Please sign in again.");
        return;
      }
      const response = await apiClient.get("/admin/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = response.data ?? {};
      if (!Array.isArray(data.reports)) {
        throw new Error("The dashboard response does not contain a reports array.");
      }
      setCache(CACHE_KEY, data);
      setReports(data.reports);
      setErrorMessage("");
    } catch (error) {
      const cached = getCache(CACHE_KEY);
      if (Array.isArray(cached?.reports)) {
        setReports(cached.reports);
      }
      const status = error?.response?.status;
      if (status === 401 || status === 403) {
        setErrorMessage("Access denied. Your session may have expired or your account lacks administrator permissions.");
      } else {
        setErrorMessage(error?.message || "Unable to retrieve reports. Check your connection.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useAutoRefresh(loadReports, 60000);

  const periodReports = useMemo(() => {
    const startPeriod = getPeriodStart(period);
    const startCustom = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const endCustom = toDate ? new Date(`${toDate}T23:59:59.999`) : null;

    return reports.filter((report) => {
      if (isExcluded(report)) return false;
      const date = getDate(report);

      if (startPeriod && date !== null && date < startPeriod) return false;
      if (startCustom && date !== null && date < startCustom) return false;
      if (endCustom && date !== null && date > endCustom) return false;

      return true;
    });
  }, [reports, period, fromDate, toDate]);

  const hotspots = useMemo(() => {
    const groups = new Map();

    periodReports.forEach((report) => {
      const location = getLocation(report);
      if (!location || location === "Location not specified") return;

      const key = location.toLowerCase();
      if (!groups.has(key)) {
        groups.set(key, { key, location, reports: [] });
      }
      groups.get(key).reports.push(report);
    });

    return Array.from(groups.values())
      .map((group) => {
        const latestDate = group.reports.reduce((latest, report) => {
          const date = getDate(report);
          if (!date) return latest;
          if (!latest || date > latest) return date;
          return latest;
        }, null);

        const types = [
          ...new Set(
            group.reports
              .map((report) => textValue(report?.incident_type || report?.type || report?.category))
              .filter(Boolean)
          ),
        ];

        const mappedCount = group.reports.filter(hasCoordinates).length;

        return {
          ...group,
          count: group.reports.length,
          mappedCount,
          latestDate,
          types,
          level: getLevel(group.reports.length),
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [periodReports]);

  const visibleHotspots = useMemo(() => {
    const query = search.trim().toLowerCase();
    return hotspots.filter((hotspot) => {
      const matchesSearch =
        !query ||
        hotspot.location.toLowerCase().includes(query) ||
        hotspot.types.some((type) => type.toLowerCase().includes(query));

      const matchesLocation =
        selectedLocation === "All" ||
        hotspot.location.toLowerCase().includes(selectedLocation.toLowerCase());

      const matchesLevel = selectedLevel === "All" || hotspot.level === selectedLevel;

      return matchesSearch && matchesLocation && matchesLevel;
    });
  }, [hotspots, search, selectedLocation, selectedLevel]);

  const displayedHotspots = showAllHotspots ? visibleHotspots : visibleHotspots.slice(0, 10);

  const selectedHotspot = hotspots.find((item) => item.key === selectedHotspotKey) || null;

  const mapFocusTarget = useMemo(() => {
    if (selectedHotspot) {
      return getHotspotCenter(selectedHotspot);
    }
    if (selectedLocation !== "All") {
      const matchingHotspots = hotspots.filter((h) =>
        h.location.toLowerCase().includes(selectedLocation.toLowerCase())
      );
      if (matchingHotspots.length > 0) {
        const dummyGroup = {
          reports: matchingHotspots.flatMap((h) => h.reports),
        };
        return getHotspotCenter(dummyGroup);
      }
    }
    return null;
  }, [selectedHotspot, selectedLocation, hotspots]);

  const mapReports = useMemo(() => {
    const source = selectedHotspot ? selectedHotspot.reports : periodReports;
    return source.filter((report) => {
      if (!hasCoordinates(report)) return false;
      if (selectedLocation === "All") return true;
      const loc = getLocation(report);
      return loc.toLowerCase().includes(selectedLocation.toLowerCase());
    });
  }, [selectedHotspot, periodReports, selectedLocation]);

  const summary = useMemo(() => ({
    totalReports: periodReports.length,
    locations: hotspots.length,
    high: hotspots.filter((item) => item.level === "High" || item.level === "Critical").length,
    moderate: hotspots.filter((item) => item.level === "Moderate").length,
    unmapped: periodReports.filter((report) => !hasCoordinates(report)).length,
  }), [periodReports, hotspots]);

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
    setSelectedLocation("All");
  };

  const resetFilters = () => {
    setPeriod("7d");
    setSelectedLocation("All");
    setSelectedLevel("All");
    setFromDate("");
    setToDate("");
    setSearch("");
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
      >
        {!!errorMessage && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={21} color="#B93838" />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        {/* SUMMARY CARDS */}
        <View style={styles.summaryGrid}>
          <SummaryCard
            icon="document-text-outline"
            label="Total Reports"
            value={summary.totalReports}
            subtext="All Argao records"
            subColor="#5D6F92"
            color="#294880"
            background="#E8EFFB"
          />
          <SummaryCard
            icon="location-outline"
            label="Detected Locations"
            value={summary.locations}
            subtext="Identified zones"
            subColor="#294880"
            color="#294880"
            background="#E8EFFB"
          />
          <SummaryCard
            icon="warning-outline"
            label="High Concentration"
            value={summary.high}
            subtext="Needs attention"
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

        {/* UNIFIED FILTER CARD WITH SPACE-OCCUPYING WRAP */}
        <View style={styles.filterCard}>
          <View style={styles.filterTopRow}>
            <View style={styles.filterHeaderTitleBox}>
              <View style={styles.filterMainIconBox}>
                <Ionicons name="options-outline" size={20} color="#294880" />
              </View>
              <View style={styles.filterTitleText}>
                <Text style={styles.filterMainTitle}>Filter Hotspot Reports</Text>
                <Text style={styles.filterMainSubtitle}>
                  Filter incident concentrations across Argao barangays
                </Text>
              </View>
            </View>
            <Pressable onPress={resetFilters} style={styles.exportButton} activeOpacity={0.85}>
              <Ionicons name="refresh-outline" size={16} color="#FFFFFF" />
              <Text style={styles.buttonText}>Reset Filters</Text>
            </Pressable>
          </View>

          

          {/* BATCH HOVERDOWN FILTERS OCCUPYING FULL WIDTH SPACE */}
          <View style={styles.batchFilterRow}>
            <View style={styles.filterDropdownWrapper}>
              <BatchFilterDropdown
                label="Location (Barangay)"
                value={selectedLocation}
                options={[{ value: "All", label: "All Barangays" }, ...ARGAO_BARANGAYS.map(({ name }) => ({ value: name, label: name }))]}
                onChange={(val) => {
                  setSelectedLocation(val);
                  setSelectedHotspotKey(null);
                  setShowAllHotspots(false);
                }}
              />
            </View>
            <View style={styles.filterDropdownWrapper}>
              <BatchFilterDropdown
                label="Reporting Period"
                value={period}
                options={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
                onChange={(val) => {
                  setPeriod(val);
                  setSelectedHotspotKey(null);
                  setShowAllHotspots(false);
                }}
              />
            </View>
            <View style={styles.filterDropdownWrapper}>
              <BatchFilterDropdown
                label="Concentration Level"
                value={selectedLevel}
                options={LEVELS.map((lvl) => ({ value: lvl, label: lvl === "All" ? "All Levels" : lvl }))}
                onChange={(val) => {
                  setSelectedLevel(val);
                  setShowAllHotspots(false);
                }}
              />
            </View>
            <View style={styles.filterDateWrapper}>
              <BatchDateRangeDropdown
                from={fromDate}
                to={toDate}
                onChangeFrom={setFromDate}
                onChangeTo={setToDate}
              />
            </View>
          </View>

          
        </View>

        {/* WORKSPACE CONTAINER: MAP ON LEFT, DETECTED LOCATIONS ON RIGHT */}
        <View style={[styles.workspace, isNarrow && styles.workspaceNarrow]}>
          
          {/* LEFT SIDE: MAP PANEL */}
          <View
            style={[styles.panel, styles.mapPanel]}
            onLayout={(event) => {
              setMapY(event.nativeEvent.layout.y);
            }}
          >
            <View style={styles.mapHeader}>
              <View style={styles.mapHeaderText}>
                <Text style={styles.sectionTitle}>
                  {selectedHotspot
                    ? selectedHotspot.location
                    : selectedLocation !== "All"
                    ? `${selectedLocation} Map View`
                    : "Incident Concentration Map"}
                </Text>
                <Text style={styles.sectionSubtitle}>
                  {selectedHotspot
                    ? `${selectedHotspot.count} reports · ${selectedHotspot.mappedCount} with coordinates`
                    : `${mapReports.length} mapped reports (${selectedLocation === "All" ? "All Argao" : selectedLocation})`}
                </Text>
              </View>

              {(selectedHotspot || selectedLocation !== "All") && (
                <Pressable onPress={resetMap} style={styles.resetButton}>
                  <Ionicons name="expand-outline" size={16} color="#294880" />
                  <Text style={styles.resetText}>Show all</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.mapContainer}>
              {loading && reports.length === 0 ? (
                <View style={styles.mapState}>
                  <ActivityIndicator size="large" color="#294880" />
                  <Text style={styles.stateText}>Loading incident locations...</Text>
                </View>
              ) : mapReports.length > 0 ? (
                <AdminHeatMap
                  key={`${selectedHotspot?.key || "none"}-${selectedLocation}`}
                  reports={mapReports}
                  focusTarget={mapFocusTarget}
                  resetView={!selectedHotspot && selectedLocation === "All"}
                  onReportSelect={(report) => {
                    const reportLocation = getLocation(report);
                    const match = hotspots.find(
                      (item) => item.key === reportLocation.toLowerCase()
                    );
                    if (match) selectHotspot(match);
                  }}
                />
              ) : (
                <View style={styles.mapState}>
                  <Ionicons name="map-outline" size={39} color="#91A39B" />
                  <Text style={styles.stateText}>No mapped reports available</Text>
                  <Text style={styles.stateSubtext}>
                    Reports need valid latitude and longitude coordinates.
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
                <View key={item.label} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                  <Text style={styles.legendText}>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* RIGHT SIDE: DETECTED LOCATIONS PANEL */}
          <View style={[styles.panel, styles.locationsPanel]}>
            <View style={styles.listHeader}>
              <View style={styles.listHeaderText}>
                <Text style={styles.sectionTitle}>Detected Locations</Text>
                <Text style={styles.sectionSubtitle}>Ranked by report count.</Text>
              </View>
              <Text style={styles.countText}>{visibleHotspots.length} found</Text>
            </View>

            {loading && reports.length === 0 ? (
              <View style={styles.emptyState}>
                <ActivityIndicator size="large" color="#294880" />
                <Text style={styles.stateText}>Fetching locations...</Text>
              </View>
            ) : visibleHotspots.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="location-outline" size={36} color="#91A39B" />
                <Text style={styles.stateText}>No matching locations</Text>
                <Text style={styles.stateSubtext}>Try changing your filter settings.</Text>
              </View>
            ) : (
              <>
                <ScrollView style={styles.locationListContainer} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                  <View style={styles.locationList}>
                    {displayedHotspots.map((hotspot, index) => {
                      const colors = getColors(hotspot.level);
                      const selected = selectedHotspotKey === hotspot.key;

                      return (
                        <Pressable
                          key={hotspot.key}
                          onPress={() => selectHotspot(hotspot)}
                          style={[styles.locationCard, selected && styles.locationCardSelected]}
                        >
                          <View style={[styles.rankBox, selected && styles.rankBoxSelected]}>
                            <Text style={[styles.rankText, selected && styles.rankTextSelected]}>
                              {index + 1}
                            </Text>
                          </View>

                          <View style={styles.locationContent}>
                            <Text style={styles.locationName}>{hotspot.location}</Text>
                            <Text style={styles.locationMeta}>
                              {hotspot.count} {hotspot.count === 1 ? "report" : "reports"} · {hotspot.mappedCount} mapped
                            </Text>
                            <View style={styles.locationLevelRow}>
                              <View style={[styles.levelDot, { backgroundColor: colors.dot }]} />
                              <Text style={[styles.levelText, { color: colors.color }]}>
                                {hotspot.level} concentration
                              </Text>
                            </View>
                          </View>

                          <Ionicons
                            name={selected ? "checkmark-circle" : "chevron-forward"}
                            size={18}
                            color="#294880"
                          />
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>

                {visibleHotspots.length > 10 && (
                  <Pressable
                    onPress={() => setShowAllHotspots(!showAllHotspots)}
                    style={styles.viewMoreButton}
                  >
                    <Text style={styles.viewMoreText}>
                      {showAllHotspots ? "Show Less" : `View More (${visibleHotspots.length - 10} more)`}
                    </Text>
                    <Ionicons
                      name={showAllHotspots ? "chevron-up" : "chevron-down"}
                      size={18}
                      color="#294880"
                    />
                  </Pressable>
                )}
              </>
            )}
          </View>

        </View>

        {/* DATA QUALITY & DISCLAIMER */}
        <View style={styles.qualityBox}>
          <Ionicons name="shield-checkmark-outline" size={21} color="#294880" />
          <View style={styles.qualityContent}>
            <Text style={styles.qualityTitle}>Data scope & quality</Text>
            <Text style={styles.qualityText}>
              Showing records across Argao barangays. {summary.unmapped} report(s) lack map coordinates but contribute to location groupings.
            </Text>
          </View>
        </View>

        <Text style={styles.disclaimer}>
          Hotspot concentration reflects report volume and should be verified before operational use.
        </Text>
      </ScrollView>
    </Admin_Layout>
  );
}

function SummaryCard({ icon, label, value, subtext, subColor, color, background }) {
  return (
    <View style={styles.summaryCard}>
      <View style={[styles.summaryIcon, { backgroundColor: background }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <View style={styles.summaryContent}>
        <Text style={styles.summaryLabel}>{label}</Text>
        <View style={styles.summaryValueRow}>
          <Text style={[styles.summaryValue, { color }]}>{value}</Text>
          <Text style={[styles.summarySubtext, { color: subColor }]}>{subtext}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    padding: 20,
    paddingBottom: 32,
    gap: 16,
    backgroundColor: "#F8FAF9",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 13,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#F0C7C7",
    backgroundColor: "#FFF7F7",
  },
  errorText: {
    flex: 1,
    fontFamily: "PoppinsRegular",
    fontSize: 11,
    lineHeight: 17,
    color: "#854545",
  },
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
    minWidth: 0,
  },
  summaryLabel: {
    fontSize: 13,
    color: "#4B5D7A",
    marginBottom: 4,
    fontFamily: "PoppinsMedium",
  },
  summaryValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  summaryValue: {
    fontSize: 20,
    fontFamily: "PoppinsSemiBold",
  },
  summarySubtext: {
    fontSize: 10,
    fontFamily: "PoppinsRegular",
  },
  filterCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 16,
    padding: 18,
    gap: 14,
    zIndex: 10,
  },
  filterTopRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  filterHeaderTitleBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 240,
  },
  filterMainIconBox: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#EAF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  filterTitleText: {
    flex: 1,
  },
  filterMainTitle: {
    fontSize: 16,
    fontFamily: "PoppinsSemiBold",
    color: "#294880",
  },
  filterMainSubtitle: {
    fontSize: 12,
    fontFamily: "PoppinsRegular",
    color: "#5D6F92",
    marginTop: 2,
  },
  exportButton: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#294880",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  buttonText: {
    fontFamily: "PoppinsMedium",
    fontSize: 12,
    color: "#FFFFFF",
  },
 
  batchFilterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "flex-start",
    zIndex: 20,
  },
  filterDropdownWrapper: {
    flex: 1,
    minWidth: 200,
  },
  filterDateWrapper: {
    flex: 2,
    minWidth: 280,
  },
  filterResultsCount: {
    fontFamily: "PoppinsRegular",
    fontSize: 11,
    color: "#82918B",
    marginTop: 2,
  },
  workspace: {
    flexDirection: "row",
    gap: 16,
  },
  workspaceNarrow: {
    flexDirection: "column",
  },
  panel: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  mapPanel: {
    flex: 1.2,
  },
  locationsPanel: {
    flex: 1,
    maxHeight: 520,
  },
  sectionTitle: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 15,
    color: "#294880",
  },
  sectionSubtitle: {
    fontFamily: "PoppinsRegular",
    fontSize: 11,
    color: "#647B75",
  },
  mapHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  mapHeaderText: {
    flex: 1,
  },
  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    backgroundColor: "#F8FAF9",
  },
  resetText: {
    fontFamily: "PoppinsMedium",
    fontSize: 11,
    color: "#294880",
  },
  mapContainer: {
    height: 350,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E5EBEA",
    backgroundColor: "#F2F5F4",
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
    fontSize: 11,
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
    fontSize: 11,
    color: "#4B5D7A",
  },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  countText: {
    fontFamily: "PoppinsMedium",
    fontSize: 12,
    color: "#294880",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
    gap: 8,
  },
  locationListContainer: {
    maxHeight: 380,
  },
  locationList: {
    gap: 10,
  },
  locationCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5EBEA",
    backgroundColor: "#F8FAF9",
    gap: 10,
  },
  locationCardSelected: {
    borderColor: "#294880",
    backgroundColor: "#F2F6FC",
  },
  rankBox: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: "#E5EBEA",
    alignItems: "center",
    justifyContent: "center",
  },
  rankBoxSelected: {
    backgroundColor: "#294880",
  },
  rankText: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 11,
    color: "#647B75",
  },
  rankTextSelected: {
    color: "#FFFFFF",
  },
  locationContent: {
    flex: 1,
    gap: 2,
  },
  locationName: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 12,
    color: "#294880",
  },
  locationMeta: {
    fontFamily: "PoppinsRegular",
    fontSize: 10,
    color: "#647B75",
  },
  locationLevelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  levelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  levelText: {
    fontFamily: "PoppinsMedium",
    fontSize: 10,
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
    marginTop: 4,
  },
  viewMoreText: {
    fontFamily: "PoppinsMedium",
    fontSize: 12,
    color: "#294880",
  },
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
    fontSize: 13,
    color: "#294880",
  },
  qualityText: {
    fontFamily: "PoppinsRegular",
    fontSize: 11,
    lineHeight: 16,
    color: "#647B75",
  },
  disclaimer: {
    fontFamily: "PoppinsRegular",
    fontSize: 10,
    lineHeight: 15,
    color: "#82918B",
    textAlign: "center",
    paddingHorizontal: 10,
  },
});