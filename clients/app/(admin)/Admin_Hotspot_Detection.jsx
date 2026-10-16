import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  //useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFonts } from "expo-font";

import Admin_Layout from "../../components/Admin_compo/Admin_Layout";
import AdminHeatMap from "../../components/Admin_compo/AdminHeatMap";
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

const textValue = (value) => String(value ?? "").trim();

const getDate = (report) => {
  const value =
    report?.created_at || report?.reported_at || report?.date;

  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getLocation = (report) => {
  const barangay = textValue(
    report?.barangay || report?.barangay_name
  );

  if (barangay) return barangay;

  const location = textValue(report?.location);

  if (location) return location;

  if (report?.latitude != null && report?.longitude != null) {
    return `${Number(report.latitude).toFixed(4)}, ${Number(
      report.longitude
    ).toFixed(4)}`;
  }

  return "Location not specified";
};

const hasCoordinates = (report) => {
  if (report?.latitude == null || report?.longitude == null) {
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
    zoom: 17,
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
  const scrollViewRef = useRef(null);
  const [mapY, setMapY] = useState(0);

  //const { width } = useWindowDimensions();
  //const isNarrow = width < 760;

  const [reports, setReports] = useState(() => {
    const cached = getCache(CACHE_KEY);
    return Array.isArray(cached?.reports) ? cached.reports : [];
  });

  const [loading, setLoading] = useState(
    () => getCache(CACHE_KEY) === undefined
  );
  //const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  //const [lastUpdated, setLastUpdated] = useState(null);

  const [period, setPeriod] = useState("7d");
  const [selectedLevel, setSelectedLevel] = useState("All");
  const [search, setSearch] = useState("");
  const [showAllHotspots, setShowAllHotspots] = useState(false);

  const [selectedHotspotKey, setSelectedHotspotKey] =
    useState(null);

  const [fontsLoaded] = useFonts({
    PoppinsRegular: require("../../assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("../../assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("../../assets/fonts/Poppins-SemiBold.ttf"),
  });

  const loadReports = useCallback(async () => {
    //setRefreshing(true);

    try {
      const token = await AsyncStorage.getItem("access_token");

      if (!token) {
        setErrorMessage(
          "Your session is missing. Please sign in again."
        );
        return;
      }

      const response = await apiClient.get("/admin/dashboard", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = response.data ?? {};

      if (!Array.isArray(data.reports)) {
        throw new Error(
          "The dashboard response does not contain a reports array."
        );
      }

      setCache(CACHE_KEY, data);
      setReports(data.reports);
      setErrorMessage("");
      //setLastUpdated(new Date());
    } catch (error) {
      const cached = getCache(CACHE_KEY);

      if (Array.isArray(cached?.reports)) {
        setReports(cached.reports);
      }

      const status = error?.response?.status;

      if (status === 401 || status === 403) {
        setErrorMessage(
          "Access denied. Your session may have expired or your account may not have administrator access."
        );
      } else {
        setErrorMessage(
          error?.message ||
            "Unable to retrieve reports. Check your connection and server."
        );
      }
    } finally {
      setLoading(false);
      //setRefreshing(false);
    }
  }, []);

  useAutoRefresh(loadReports, 60000);

  const periodReports = useMemo(() => {
    const start = getPeriodStart(period);

    return reports.filter((report) => {
      if (isExcluded(report)) return false;
      if (!start) return true;

      const date = getDate(report);

      return date !== null && date >= start;
    });
  }, [reports, period]);

  const hotspots = useMemo(() => {
    const groups = new Map();

    periodReports.forEach((report) => {
      const location = getLocation(report);

      if (!location || location === "Location not specified") {
        return;
      }

      const key = location.toLowerCase();

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          location,
          reports: [],
        });
      }

      groups.get(key).reports.push(report);
    });

    return Array.from(groups.values())
      .map((group) => {
        const latestDate = group.reports.reduce(
          (latest, report) => {
            const date = getDate(report);

            if (!date) return latest;
            if (!latest || date > latest) return date;

            return latest;
          },
          null
        );

        const types = [
          ...new Set(
            group.reports
              .map((report) =>
                textValue(
                  report?.incident_type ||
                    report?.type ||
                    report?.category
                )
              )
              .filter(Boolean)
          ),
        ];

        const mappedCount = group.reports.filter(
          hasCoordinates
        ).length;

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
        hotspot.types.some((type) =>
          type.toLowerCase().includes(query)
        );

      const matchesLevel =
        selectedLevel === "All" ||
        hotspot.level === selectedLevel;

      return matchesSearch && matchesLevel;
    });
  }, [hotspots, search, selectedLevel]);

  const displayedHotspots = showAllHotspots
    ? visibleHotspots
    : visibleHotspots.slice(0, 10);

  const selectedHotspot =
    hotspots.find(
      (item) => item.key === selectedHotspotKey
    ) || null;

  const mapReports = useMemo(() => {
    const source = selectedHotspot
      ? selectedHotspot.reports
      : periodReports;

    return source.filter(hasCoordinates);
  }, [selectedHotspot, periodReports]);

  const summary = useMemo(() => ({
    totalReports: periodReports.length,
    locations: hotspots.length,
    high: hotspots.filter(
      (item) => item.level === "High" || item.level === "Critical"
    ).length,
    moderate: hotspots.filter(
      (item) => item.level === "Moderate"
    ).length,
    unmapped: periodReports.filter(
      (report) => !hasCoordinates(report)
    ).length,
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
  };

  const resetFilters = () => {
    setPeriod("7d");
    setSelectedLevel("All");
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
        {/* MAIN HEADER 
        <View style={[styles.header, isNarrow && styles.headerNarrow]}>
          <View style={styles.headerIcon}>
            <Ionicons
              name="navigate-circle-outline"
              size={27}
              color="#294880"
            />
          </View>

          <View style={styles.headerText}>
            <Text style={styles.title}>Hotspot Detection</Text>
            <Text style={styles.subtitle}>
              Monitor report concentrations across Argao, Cebu.
            </Text>
            {lastUpdated && (
              <Text style={styles.updatedText}>
                Updated {lastUpdated.toLocaleTimeString()}
              </Text>
            )}
          </View>

          <Pressable
            onPress={loadReports}
            disabled={refreshing}
            style={styles.refreshButton}
          >
            {refreshing ? (
              <ActivityIndicator
                size="small"
                color="#294880"
              />
            ) : (
              <Ionicons
                name="refresh-outline"
                size={17}
                color="#294880"
              />
            )}
            <Text style={styles.refreshText}>Refresh</Text>
          </Pressable>
        </View> */}

        {!!errorMessage && (
          <View style={styles.errorBox}>
            <Ionicons
              name="alert-circle-outline"
              size={21}
              color="#B93838"
            />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        {/* SUMMARY CARDS */}
        <View style={styles.summaryGrid}>
          <SummaryCard
            icon="document-text-outline"
            label="Total Reports"
            value={summary.totalReports}
            subtext="Selected period"
            subColor="#5D6F92"
            color="#294880"
            background="#E8EFFB"
          />

          <SummaryCard
            icon="location-outline"
            label="Detected Locations"
            value={summary.locations}
            subtext="Identified locations"
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

        {/* IMPROVED ANALYSIS FILTERS */}
        <View style={styles.filterCard}>
          <View style={styles.filterHeaderRow}>
            <View style={styles.filterTitleContainer}>
              <Ionicons name="filter-outline" size={18} color="#294880" />
              <Text style={styles.filterCardTitle}>Filter Reports</Text>
            </View>
            <Pressable onPress={resetFilters} style={styles.resetFilterButton}>
              <Text style={styles.resetFilterButtonText}>Reset Filters</Text>
            </Pressable>
          </View>

          <View style={styles.searchBox}>
            <Ionicons
              name="search-outline"
              size={18}
              color="#82918B"
            />
            <TextInput
              value={search}
              onChangeText={(value) => {
                setSearch(value);
                setShowAllHotspots(false);
              }}
              placeholder="Search location or incident type..."
              placeholderTextColor="#98A39E"
              style={styles.searchInput}
            />
            {!!search && (
              <Pressable
                onPress={() => {
                  setSearch("");
                  setShowAllHotspots(false);
                }}
              >
                <Ionicons
                  name="close-circle"
                  size={18}
                  color="#82918B"
                />
              </Pressable>
            )}
          </View>

          <Text style={styles.filterLabel}>Reporting period</Text>
          <View style={styles.filterChipsRow}>
            {PERIODS.map((item) => {
              const active = period === item.value;
              return (
                <Pressable
                  key={item.value}
                  onPress={() => {
                    setPeriod(item.value);
                    setSelectedHotspotKey(null);
                    setShowAllHotspots(false);
                  }}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      active && styles.filterChipTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.filterLabel}>Concentration level</Text>
          <View style={styles.filterChipsRow}>
            {LEVELS.map((level) => {
              const active = selectedLevel === level;
              return (
                <Pressable
                  key={level}
                  onPress={() => {
                    setSelectedLevel(level);
                    setShowAllHotspots(false);
                  }}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      active && styles.filterChipTextActive,
                    ]}
                  >
                    {level === "All" ? "All levels" : level}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.filterResultsCount}>
            Showing{" "}
            {Math.min(
              visibleHotspots.length,
              showAllHotspots ? visibleHotspots.length : 10
            )}{" "}
            of {visibleHotspots.length} matching locations.
          </Text>
        </View>

        {/* MAP PANEL */}
        <View
          style={styles.panel}
          onLayout={(event) => {
            setMapY(event.nativeEvent.layout.y);
          }}
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
                  : `${mapReports.length} mapped reports in the selected period`}
              </Text>
            </View>

            {selectedHotspot && (
              <Pressable
                onPress={resetMap}
                style={styles.resetButton}
              >
                <Ionicons
                  name="expand-outline"
                  size={16}
                  color="#294880"
                />
                <Text style={styles.resetText}>Show all</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.mapContainer}>
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
                focusTarget={
                  selectedHotspot
                    ? getHotspotCenter(selectedHotspot)
                    : null
                }
                resetView={!selectedHotspot}
                onReportSelect={(report) => {
                  const reportLocation = getLocation(report);

                  const match = hotspots.find(
                    (item) =>
                      item.key === reportLocation.toLowerCase()
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
                  Reports need valid latitude and longitude
                  coordinates to appear on the map.
                </Text>
              </View>
            )}
          </View>

          {/* COLOR LEGEND - LEFT ALIGNED WITH RED, ORANGE, YELLOW, GREEN */}
          <View style={styles.legend}>
            {[
              { label: "Critical", color: "#D94841" },
              { label: "High", color: "#E66C00" },
              { label: "Moderate", color: "#EAB308" },
              { label: "Low", color: "#37956D" },
            ].map((item) => (
              <View key={item.label} style={styles.legendItem}>
                <View
                  style={[
                    styles.legendDot,
                    { backgroundColor: item.color },
                  ]}
                />
                <Text style={styles.legendText}>{item.label}</Text>
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
              Select a detected location below to focus the map
              on its reports. Use “Show all” to reset the view.
            </Text>
          </View>
        </View>

        {/* DETECTED LOCATIONS */}
        <View style={styles.panel}>
          <View style={styles.listHeader}>
            <View style={styles.listHeaderText}>
              <Text style={styles.sectionTitle}>
                Detected Locations
              </Text>
              <Text style={styles.sectionSubtitle}>
                Ranked by report count for the selected period.
              </Text>
            </View>

            <Text style={styles.countText}>
              {visibleHotspots.length} locations
            </Text>
          </View>

          {loading && reports.length === 0 ? (
            <View style={styles.emptyState}>
              <ActivityIndicator
                size="large"
                color="#294880"
              />
              <Text style={styles.stateText}>Fetching reports...</Text>
            </View>
          ) : visibleHotspots.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons
                name="location-outline"
                size={36}
                color="#91A39B"
              />
              <Text style={styles.stateText}>
                No matching locations
              </Text>
              <Text style={styles.stateSubtext}>
                Try changing the period, search term, or
                concentration filter.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.locationList}>
                {displayedHotspots.map((hotspot, index) => {
                  const colors = getColors(hotspot.level);
                  const selected =
                    selectedHotspotKey === hotspot.key;

                  return (
                    <Pressable
                      key={hotspot.key}
                      onPress={() => selectHotspot(hotspot)}
                      style={[
                        styles.locationCard,
                        selected && styles.locationCardSelected,
                      ]}
                    >
                      <View
                        style={[
                          styles.rankBox,
                          selected && styles.rankBoxSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.rankText,
                            selected && styles.rankTextSelected,
                          ]}
                        >
                          {index + 1}
                        </Text>
                      </View>

                      <View style={styles.locationContent}>
                        <Text style={styles.locationName}>
                          {hotspot.location}
                        </Text>

                        <Text style={styles.locationMeta}>
                          {hotspot.count}{" "}
                          {hotspot.count === 1 ? "report" : "reports"}
                          {" · "}
                          {hotspot.mappedCount} mapped
                        </Text>

                        <View style={styles.locationLevelRow}>
                          <View
                            style={[
                              styles.levelDot,
                              { backgroundColor: colors.dot },
                            ]}
                          />
                          <Text
                            style={[
                              styles.levelText,
                              { color: colors.color },
                            ]}
                          >
                            {hotspot.level} concentration
                          </Text>
                        </View>

                        {hotspot.types.length > 0 && (
                          <Text
                            style={styles.incidentTypes}
                            numberOfLines={2}
                          >
                            Types: {hotspot.types.join(", ")}
                          </Text>
                        )}

                        {hotspot.latestDate && (
                          <Text style={styles.latestText}>
                            Latest report:{" "}
                            {hotspot.latestDate.toLocaleDateString()}
                          </Text>
                        )}
                      </View>

                      <View style={styles.locationAction}>
                        <View
                          style={[
                            styles.levelBadge,
                            { backgroundColor: colors.background },
                          ]}
                        >
                          <Text
                            style={[
                              styles.levelBadgeText,
                              { color: colors.color },
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
                          size={22}
                          color="#294880"
                        />
                        <Text style={styles.viewMapText}>
                          {selected ? "Selected" : "Focus map"}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              {visibleHotspots.length > 10 && (
                <Pressable
                  onPress={() => setShowAllHotspots(!showAllHotspots)}
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
        </View>

        {/* DATA QUALITY */}
        <View style={styles.qualityBox}>
          <Ionicons
            name="shield-checkmark-outline"
            size={21}
            color="#294880"
          />
          <View style={styles.qualityContent}>
            <Text style={styles.qualityTitle}>Data quality</Text>
            <Text style={styles.qualityText}>
              {summary.unmapped} report(s) in the selected period
              lack valid map coordinates. These reports can
              contribute to location grouping only when their
              location text is available.
            </Text>
          </View>
        </View>

        <Text style={styles.disclaimer}>
          Hotspot concentration reflects report volume, not
          confirmed danger. Current levels use temporary report
          count thresholds and should be calibrated against
          geographic distance, time period, duplicates, and
          verification status before operational use.
        </Text>
      </ScrollView>
    </Admin_Layout>
  );
}

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
        <Ionicons name={icon} size={24} color={color} />
      </View>

      <View style={styles.summaryContent}>
        <Text style={styles.summaryLabel}>{label}</Text>

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

const styles = StyleSheet.create({
  page: {
    padding: 20,
    paddingBottom: 32,
    gap: 16,
    backgroundColor: "#F8FAF9",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerNarrow: {
    flexWrap: "wrap",
  },
  headerIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#E8EFFB",
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    minWidth: 180,
  },
  title: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 21,
    color: "#294880",
  },
  subtitle: {
    fontFamily: "PoppinsRegular",
    fontSize: 12,
    lineHeight: 18,
    color: "#647B75",
    marginTop: 2,
  },
  updatedText: {
    fontFamily: "PoppinsRegular",
    fontSize: 10,
    color: "#82918B",
    marginTop: 3,
  },
  refreshButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    backgroundColor: "#FFFFFF",
  },
  refreshText: {
    fontFamily: "PoppinsMedium",
    fontSize: 11,
    color: "#294880",
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
    marginBottom: 2,
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
    fontSize: 14,
    color: "#4B5D7A",
    marginBottom: 6,
    fontFamily: "PoppinsMedium",
  },
  summaryValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
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

  /* Improved Admin Validation Style Filter Card */
  filterCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  filterHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  filterTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  filterCardTitle: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 15,
    color: "#294880",
  },
  resetFilterButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  resetFilterButtonText: {
    fontFamily: "PoppinsMedium",
    fontSize: 12,
    color: "#294880",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F4F7FC",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: "PoppinsRegular",
    fontSize: 13,
    color: "#294880",
    padding: 0,
  },
  filterLabel: {
    fontFamily: "PoppinsMedium",
    fontSize: 12,
    color: "#4B5D7A",
    marginTop: 4,
  },
  filterChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    backgroundColor: "#F8FAF9",
  },
  filterChipActive: {
    backgroundColor: "#E8EFFB",
    borderColor: "#294880",
  },
  filterChipText: {
    fontFamily: "PoppinsRegular",
    fontSize: 12,
    color: "#5D6F92",
  },
  filterChipTextActive: {
    fontFamily: "PoppinsMedium",
    color: "#294880",
  },
  filterResultsCount: {
    fontFamily: "PoppinsRegular",
    fontSize: 11,
    color: "#82918B",
    marginTop: 4,
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
    height: 280,
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

  /* Left-aligned Legend Style */
  legend: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
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

  mapHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F2F6FC",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  mapHintText: {
    flex: 1,
    fontFamily: "PoppinsRegular",
    fontSize: 11,
    color: "#4B5D7A",
  },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  listHeaderText: {
    flex: 1,
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
  locationList: {
    gap: 10,
  },
  locationCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5EBEA",
    backgroundColor: "#F8FAF9",
    gap: 12,
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
    fontSize: 12,
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
    fontSize: 13,
    color: "#294880",
  },
  locationMeta: {
    fontFamily: "PoppinsRegular",
    fontSize: 11,
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
    fontSize: 11,
  },
  incidentTypes: {
    fontFamily: "PoppinsRegular",
    fontSize: 10,
    color: "#82918B",
    marginTop: 2,
  },
  latestText: {
    fontFamily: "PoppinsRegular",
    fontSize: 10,
    color: "#82918B",
  },
  locationAction: {
    alignItems: "flex-end",
    gap: 4,
  },
  levelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  levelBadgeText: {
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