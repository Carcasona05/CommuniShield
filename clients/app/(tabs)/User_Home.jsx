import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ThemedView from "../../components/ThemedView";
import ThemedText from "../../components/ThemedText";
import MapView from "../../components/MapView";
import ReportPost_Layout from "../../components/ReportPost_Layout";
import ReportByAdmin from "../../components/ReportByAdmin";
import apiClient from "../../services/apiClient";
import useAutoRefresh from "../../hooks/useAutoRefresh";
import useScrollToTop from "../../hooks/useScrollToTop";
import { subscribeRefresh } from "../../services/refreshBus";
import { publishNavVisibility, subscribeNavVisibility } from "../../services/navBus";
import { getCache, setCache, patchCachedReports } from "../../services/dataStore";
import { SkeletonFeed } from "../../components/SkeletonCard";
import { buildNearbySafety, formatSafetyReportAge, SAFETY_RADIUS_KM } from "../../services/safetyTips";

const PRIMARY = "#294880";

const FONT = {
  regular: "Poppins-Regular",
  medium: "Poppins-Medium",
  semiBold: "Poppins-SemiBold",
};

const timeRangeOptions = ["Past 24 Hours", "Past 7 Days"];

const statusOptions = [
  "All Status",
  "Pending Review",
  "Under Verification",
  "Resolved",
  "Rejected",
  "Archived",
];

const sourceOptions = ["All", "User", "Admin"];

const PAGE_SIZE = 10;

const isWithinPastHours = (dateValue, hours) => {
  const date = new Date(dateValue);
  const limit = new Date();
  limit.setHours(limit.getHours() - hours);

  return date >= limit;
};

const isWithinPastWeek = (dateValue) => {
  const date = new Date(dateValue);
  const limit = new Date();
  limit.setDate(limit.getDate() - 7);

  return date >= limit;
};

const mapFeed = (reportsData, adminData) => {
  const userPosts = (reportsData?.reports || []).map((r) => ({
    id: r.id,
    postSource: "User",
    userName: r.poster_name || "Anonymous User",
    userAvatar: null,
    location: r.location,
    latitude: r.latitude ?? null,
    longitude: r.longitude ?? null,
    incidentCategory: r.incident_category,
    incidentType: r.incident_type,
    severity: r.severity ?? "Unknown",
    details: r.details,
    status: r.status || "Pending Review",
    verified: r.is_verified,
    datePosted: r.created_at,
    likes: r.likes ?? 0,
    comments: r.comments ?? 0,
    isLiked: r.is_liked ?? false,
    images: Array.isArray(r.images) ? r.images : [],
    sentiment: r.sentiment ?? null,
    sentiment_status: r.sentiment_status ?? "unavailable",
    sentiment_error: r.sentiment_error ?? "",
    sentiment_confidence: r.sentiment_confidence ?? 0,
    sentiment_language: r.sentiment_language ?? "unknown",
    sentiment_provider: r.sentiment_provider ?? "none",
    sentiment_model: r.sentiment_model ?? "none",
    sentiment_analyzed_at: r.sentiment_analyzed_at ?? null,
    commentList: [],
  }));

  const adminPosts = (adminData?.posts || []).map((p) => ({
    id: p.id,
    postSource: "Admin",
    adminName: p.adminName || "CommuniShield Admin",
    type: p.type,
    location: p.location,
    details: p.details,
    datePosted: p.datePosted,
    status: "Admin Report",
    pic: p.pic,
  }));

  return [...adminPosts, ...userPosts];
};

const SEVERITY_COLORS = { Critical: "#991B1B", High: "#C2410C", Medium: "#946200", Low: PRIMARY, Unknown: "#64748B" };

const MapPreview = ({ style, reports = [] }) => {
  const [userPosition, setUserPosition] = useState(null);
  const [locationStatus, setLocationStatus] = useState("loading");
  const [now, setNow] = useState(Date.now);
  const [expandedSafetyKey, setExpandedSafetyKey] = useState(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    let subscription;
    setUserPosition(null);
    setLocationStatus("loading");
    setExpandedSafetyKey(null);
    const updateLocation = (location) => {
      if (!active) return;
      setUserPosition([location.coords.latitude, location.coords.longitude]);
      setLocationStatus("ready");
      setNow(Date.now());
    };
    const start = async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!active) return;
        if (permission.status !== "granted") {
          setLocationStatus("denied");
          return;
        }
        // Use actual device coordinates, not the map's Cebu-clamped display position.
        subscription = await Location.watchPositionAsync({
          accuracy: Location.Accuracy.High,
          distanceInterval: 20,
          timeInterval: 10000,
        }, updateLocation, () => {
          if (active) {
            setUserPosition(null);
            setLocationStatus("unavailable");
          }
        });
        if (!active) subscription.remove();
      } catch {
        if (active) setLocationStatus("unavailable");
      }
    };
    start();
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => {
      active = false;
      subscription?.remove();
      clearInterval(timer);
    };
  }, []));
  const safety = useMemo(() => buildNearbySafety(reports, userPosition, now), [reports, userPosition, now]);
  const severityColor = SEVERITY_COLORS[safety?.highestSeverity] || PRIMARY;
  const safetyKey = safety?.incidents.map((incident) => incident.id || incident.incidentType).join("|");
  const safetyExpanded = !!safety && expandedSafetyKey === safetyKey;

  return (
    <View style={style}>
      <View style={styles.mapCard}>
        <MapView interactive={false} position={userPosition} />
        {safety ? (
          <TouchableOpacity
            style={styles.safetyFloatingButton}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="Nearby Safety Tips"
            accessibilityHint="Show or hide safety tips below the map"
            accessibilityState={{ expanded: safetyExpanded }}
            onPress={() => setExpandedSafetyKey(safetyExpanded ? null : safetyKey)}
          >
            <Ionicons name="shield-checkmark-outline" size={21} color={severityColor} />
            <View style={styles.safetyButtonTitle}>
              <ThemedText style={styles.reminderTitle}>Nearby Safety Tips</ThemedText>
              <ThemedText style={styles.safetyMeta}>
                {safety.count} active {safety.count === 1 ? "report" : "reports"} within {SAFETY_RADIUS_KM} km · {formatSafetyReportAge(safety.latestReportedAt, now)}
              </ThemedText>
            </View>
            <Ionicons name={safetyExpanded ? "chevron-up" : "chevron-down"} size={19} color={PRIMARY} />
          </TouchableOpacity>
        ) : null}
      </View>
      {safetyExpanded ? (
        <View style={[styles.safetyCard, { borderLeftColor: severityColor }]}>
          {safety.incidents.map((incident) => (
            <View key={incident.id || incident.incidentType} style={styles.safetyIncident}>
              <ThemedText style={[styles.safetyIncidentTitle, { color: SEVERITY_COLORS[incident.severity] }]}>
                {incident.incidentType}
              </ThemedText>
              <ThemedText style={styles.safetyMeta}>
                {incident.distanceKm < 1 ? `${Math.round(incident.distanceKm * 1000)} m` : `${incident.distanceKm.toFixed(1)} km`} away · {incident.verified ? "Verified report" : "Unverified report"}
              </ThemedText>
              <ThemedText style={styles.safetyMeta}>
                Reported {formatSafetyReportAge(incident.postedAt, now).toLowerCase()}
              </ThemedText>
              {incident.tips.map((tip) => (
                <ThemedText key={tip} style={styles.reminderText}>• {tip}</ThemedText>
              ))}
            </View>
          ))}
          <ThemedText style={styles.safetyDisclaimer}>
            Reports do not confirm a current threat. Follow official updates. If you are in immediate danger, call 911 from a safe place.
          </ThemedText>
        </View>
      ) : !safety && (locationStatus === "denied" || locationStatus === "unavailable") ? (
        <ThemedText style={styles.reminderText}>
          {locationStatus === "denied"
            ? "Enable location access in your app or browser settings to see nearby safety tips."
            : "Your location is unavailable. Nearby safety tips will appear when a location fix is available."}
        </ThemedText>
      ) : null}
    </View>
  );
};

const DropdownFilter = ({
  label,
  value,
  options,
  isOpen,
  onToggle,
  onSelect,
  icon,
}) => {
  return (
    <View style={styles.dropdownBlock}>
      <TouchableOpacity
        activeOpacity={0.85}
        style={[styles.dropdownButton, isOpen && styles.activeDropdownButton]}
        onPress={onToggle}
      >
        <View style={styles.dropdownLeft}>
          <View
            style={[
              styles.dropdownIconWrap,
              isOpen && styles.activeDropdownIconWrap,
            ]}
          >
            <Ionicons
              name={icon}
              size={15}
              color={isOpen ? "#FFFFFF" : PRIMARY}
            />
          </View>

          <View style={styles.dropdownTextWrap}>
            <ThemedText
              style={[
                styles.dropdownLabel,
                isOpen && styles.activeDropdownLabel,
              ]}
            >
              {label}
            </ThemedText>

            <ThemedText
              style={[
                styles.dropdownValue,
                isOpen && styles.activeDropdownValue,
              ]}
              numberOfLines={1}
            >
              {value}
            </ThemedText>
          </View>
        </View>

        <Ionicons
          name={isOpen ? "chevron-up" : "chevron-down"}
          size={16}
          color={isOpen ? "#FFFFFF" : PRIMARY}
        />
      </TouchableOpacity>

      {isOpen ? (
        <View style={styles.dropdownMenu}>
          {options.map((option) => {
            const isActive = option === value;

            return (
              <TouchableOpacity
                key={option}
                activeOpacity={0.85}
                style={[
                  styles.dropdownOption,
                  isActive && styles.activeDropdownOption,
                ]}
                onPress={() => onSelect(option)}
              >
                <ThemedText
                  style={[
                    styles.dropdownOptionText,
                    isActive && styles.activeDropdownOptionText,
                  ]}
                >
                  {option}
                </ThemedText>

                {isActive ? (
                  <Ionicons name="checkmark-circle" size={16} color={PRIMARY} />
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );
};

const User_Home = () => {
  const router = useRouter();

  const [selectedTimeRange, setSelectedTimeRange] = useState("Past 24 Hours");
  const [selectedStatus, setSelectedStatus] = useState("All Status");
  const [selectedSource, setSelectedSource] = useState("All");
  const [openDropdown, setOpenDropdown] = useState(null);
  const [reports, setReports] = useState(() => {
    const cachedReports = getCache("api:/reports");
    const cachedAdmin = getCache("api:/admin/posts");
    return (cachedReports !== undefined || cachedAdmin !== undefined)
      ? mapFeed(cachedReports, cachedAdmin)
      : [];
  });
  const [loading, setLoading] = useState(() => {
    return getCache("api:/reports") === undefined && getCache("api:/admin/posts") === undefined;
  });
  const [refreshing, setRefreshing] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [navShown, setNavShown] = useState(true);
  const [arrowReady, setArrowReady] = useState(false);
  const scrollRef = useScrollToTop();

  const loadReports = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;

      const cachedReports = getCache("api:/reports");
      const cachedAdmin = getCache("api:/admin/posts");
      if (cachedReports !== undefined || cachedAdmin !== undefined) {
        setReports(mapFeed(cachedReports, cachedAdmin));
      }

      const [reportsRes, adminRes] = await Promise.all([
        apiClient.get("/reports", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        apiClient.get("/admin/posts", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      setCache("api:/reports", reportsRes.data ?? {});
      setCache("api:/admin/posts", adminRes.data ?? {});
      setReports(mapFeed(reportsRes.data, adminRes.data));
    } catch {
      // keep empty feed on failure
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useAutoRefresh(loadReports, 60000);

  useEffect(() => subscribeRefresh(loadReports), [loadReports]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadReports();
  }, [loadReports]);

  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      const matchesTimeRange =
        selectedTimeRange === "Past 24 Hours"
          ? isWithinPastHours(report.datePosted, 24)
          : isWithinPastWeek(report.datePosted);

      const matchesSource =
        selectedSource === "All" || report.postSource === selectedSource;

      const matchesStatus =
        selectedStatus === "All Status" ||
        (report.postSource === "User" && report.status === selectedStatus);

      return matchesTimeRange && matchesSource && matchesStatus;
    });
  }, [reports, selectedTimeRange, selectedStatus, selectedSource]);

  const visibleReports = filteredReports.slice(0, visibleCount);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [selectedTimeRange, selectedStatus, selectedSource]);

  const handleDropdownToggle = (dropdownName) => {
    setOpenDropdown((current) =>
      current === dropdownName ? null : dropdownName
    );
  };

  const handleViewMore = () => {
    if (loadingMore) return;
    setLoadingMore(true);
    setTimeout(() => {
      setVisibleCount((count) => count + PAGE_SIZE);
      setLoadingMore(false);
    }, 400);
  };

  const lastScrollYRef = useRef(0);

  const handleScroll = (event) => {
    const y = event.nativeEvent.contentOffset.y;
    setShowScrollTop(y > 300);

    const delta = y - lastScrollYRef.current;
    if (y <= 0) {
      publishNavVisibility(true);
      lastScrollYRef.current = 0;
    } else if (delta > 12) {
      publishNavVisibility(false);
      lastScrollYRef.current = y;
    } else if (delta < -12) {
      publishNavVisibility(true);
      lastScrollYRef.current = y;
    }
  };

  useEffect(() => subscribeNavVisibility(setNavShown), []);

  useEffect(() => {
    if (navShown) {
      setArrowReady(false);
      return undefined;
    }
    const timer = setTimeout(() => setArrowReady(true), 220);
    return () => clearTimeout(timer);
  }, [navShown]);

  const handleLike = async (reportId) => {
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;

      const res = await apiClient.post(
        `/reports/${reportId}/like`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const liked = res.data?.liked ?? false;
      const serverLikes =
        typeof res.data?.likes === "number" ? res.data.likes : null;

      setReports((prevReports) =>
        prevReports.map((report) =>
          report.id === reportId && report.postSource === "User"
            ? {
                ...report,
                isLiked: liked,
                likes:
                  serverLikes ??
                  Math.max(0, report.likes + (liked ? 1 : -1)),
              }
            : report
        )
      );

      patchCachedReports(reportId, (r) => ({
        ...r,
        is_liked: liked,
        likes: serverLikes ?? (r.likes ?? 0) + (liked ? 1 : -1),
      }));
    } catch {
      // ignore like failures
    }
  };

  const handleOpenPost = (report) => {
    router.push({
      pathname: "/User_RepPostView",
      params: {
        post: JSON.stringify(report),
      },
    });
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        ref={scrollRef}
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[PRIMARY]}
            tintColor={PRIMARY}
          />
        }
      >
        <MapPreview style={styles.mapSpacing} reports={reports} />

        <View style={styles.filterCard}>
          <DropdownFilter
            label="Time Range"
            value={selectedTimeRange}
            options={timeRangeOptions}
            icon="calendar-outline"
            isOpen={openDropdown === "timeRange"}
            onToggle={() => handleDropdownToggle("timeRange")}
            onSelect={(option) => {
              setSelectedTimeRange(option);
              setOpenDropdown(null);
            }}
          />

          <DropdownFilter
            label="Status"
            value={selectedStatus}
            options={statusOptions}
            icon="filter-outline"
            isOpen={openDropdown === "status"}
            onToggle={() => handleDropdownToggle("status")}
            onSelect={(option) => {
              setSelectedStatus(option);
              setOpenDropdown(null);
            }}
          />

          <DropdownFilter
            label="By"
            value={selectedSource}
            options={sourceOptions}
            icon="people-outline"
            isOpen={openDropdown === "source"}
            onToggle={() => handleDropdownToggle("source")}
            onSelect={(option) => {
              setSelectedSource(option);
              setOpenDropdown(null);

              if (option === "Admin") {
                setSelectedStatus("All Status");
              }
            }}
          />
        </View>

        <View style={styles.feedList}>
          {visibleReports.map((report, index) => {
            const cardSpacing =
              index !== visibleReports.length - 1
                ? styles.reportCardSpacing
                : null;

            if (report.postSource === "Admin") {
              return (
                <ReportByAdmin
                  key={report.id}
                  report={report}
                  type={report.type}
                  location={report.location}
                  details={report.details}
                  datePosted={report.datePosted}
                  postedDate={report.datePosted}
                  pic={report.pic}
                  image={report.pic}
                  adminName={report.adminName}
                  style={cardSpacing}
                />
              );
            }

            return (
                <ReportPost_Layout
                  key={report.id}
                  userName={report.userName}
                  userAvatar={report.userAvatar}
                  datePosted={report.datePosted}
                  location={report.location}
                incidentCategory={report.incidentCategory}
                incidentType={report.incidentType}
                details={report.details}
                status={report.status}
                verified={report.verified}
                likes={report.likes}
                comments={report.comments}
                isLiked={report.isLiked}
                images={report.images}
                onLike={() => handleLike(report.id)}
                onComment={() => handleOpenPost(report)}
                onAddMedia={() => console.log(`Add media ${report.id}`)}
                style={cardSpacing}
              />
            );
          })}

          {!loading && filteredReports.length > visibleReports.length ? (
            <TouchableOpacity
              style={styles.viewMoreBtn}
              activeOpacity={0.8}
              onPress={handleViewMore}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <ActivityIndicator size="small" color={PRIMARY} />
              ) : (
                <ThemedText style={styles.viewMoreText}>
                  View more posts
                </ThemedText>
              )}
            </TouchableOpacity>
          ) : null}

          {loading && filteredReports.length === 0 ? (
            <SkeletonFeed count={3} />
          ) : filteredReports.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Ionicons name="search-outline" size={24} color="#9CA3AF" />
              </View>

              <ThemedText style={styles.emptyTitle}>No reports found</ThemedText>

              <ThemedText style={styles.emptyText}>
                Try changing the time range, status, or source filter.
              </ThemedText>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {showScrollTop && !navShown && arrowReady ? (
        <TouchableOpacity
          style={styles.scrollTopBtn}
          activeOpacity={0.8}
          onPress={() =>
            scrollRef.current?.scrollTo?.({ y: 0, animated: true })
          }
        >
          <Ionicons name="arrow-up" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      ) : null}
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F6FB",
  },

  scrollContainer: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 148,
  },

  mapSpacing: {
    marginBottom: 12,
  },

  mapCard: {
    height: 260,
    borderRadius: 28,
    backgroundColor: "#EAF0F8",
    overflow: "hidden",
    position: "relative",
    borderWidth: 1,
    borderColor: "#DDE7F5",
  },

  safetyCard: {
    marginTop: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 13,
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.9)",
    borderLeftWidth: 4,
  },

  safetyFloatingButton: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 16,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: 1,
    borderColor: "#DDE7F5",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
    elevation: 5,
    zIndex: 1,
  },

  safetyButtonTitle: {
    flex: 1,
  },

  safetyIncidentTitle: {
    fontFamily: FONT.semiBold,
    fontSize: 13,
  },
  safetyMeta: {
    fontFamily: FONT.regular,
    fontSize: 11,
    color: "#64748B",
    marginTop: 3,
  },
  safetyDisclaimer: {
    fontFamily: FONT.regular,
    fontSize: 11,
    lineHeight: 17,
    color: "#64748B",
    marginTop: 12,
  },

  reminderTitle: {
    fontFamily: FONT.semiBold,
    fontSize: 14,
    color: "#1F2937",
  },

  reminderText: {
    fontFamily: FONT.regular,
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: "#6B7280",
  },

  filterCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E7ECF3",
    zIndex: 50,
  },

  dropdownBlock: {
    marginBottom: 10,
    position: "relative",
  },

  dropdownButton: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: "#F8FAFE",
    borderWidth: 1,
    borderColor: "#DDE7F5",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  activeDropdownButton: {
    backgroundColor: PRIMARY,
    borderColor: PRIMARY,
  },

  dropdownLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  dropdownIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#E8EEF9",
    alignItems: "center",
    justifyContent: "center",
  },

  activeDropdownIconWrap: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },

  dropdownTextWrap: {
    marginLeft: 10,
    flex: 1,
  },

  dropdownLabel: {
    fontFamily: FONT.regular,
    fontSize: 10,
    color: "#7B8794",
  },

  activeDropdownLabel: {
    color: "rgba(255,255,255,0.76)",
  },

  dropdownValue: {
    fontFamily: FONT.medium,
    marginTop: 2,
    fontSize: 13,
    color: PRIMARY,
  },

  activeDropdownValue: {
    color: "#FFFFFF",
  },

  dropdownMenu: {
    marginTop: 7,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E4EBF7",
    overflow: "hidden",
  },

  dropdownOption: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F7",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  activeDropdownOption: {
    backgroundColor: "#F3F6FB",
  },

  dropdownOptionText: {
    fontFamily: FONT.regular,
    fontSize: 13,
    color: "#374151",
  },

  activeDropdownOptionText: {
    fontFamily: FONT.medium,
    color: PRIMARY,
  },

  feedList: {
    marginTop: 2,
  },

  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 22,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E4EBF7",
  },

  emptyIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#F3F6FB",
    alignItems: "center",
    justifyContent: "center",
  },

  emptyTitle: {
    fontFamily: FONT.semiBold,
    marginTop: 8,
    color: "#1F2A37",
    fontSize: 15,
  },

  emptyText: {
    fontFamily: FONT.regular,
    marginTop: 4,
    color: "#6B7280",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },

  reportCardSpacing: {
    marginBottom: 6,
  },

  viewMoreBtn: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E1E8F2",
    backgroundColor: "#FFFFFF",
    marginTop: 6,
    marginBottom: 4,
  },

  viewMoreText: {
    fontFamily: FONT.medium,
    fontSize: 13,
    color: PRIMARY,
  },

  scrollTopBtn: {
    position: "absolute",
    right: 16,
    bottom: 40,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: PRIMARY,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
});

export default User_Home;
