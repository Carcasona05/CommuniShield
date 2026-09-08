import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
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
import { getCache, setCache } from "../../services/dataStore";
import { SkeletonFeed } from "../../components/SkeletonCard";

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
    incidentCategory: r.incident_category,
    incidentType: r.incident_type,
    details: r.details,
    status: r.status || "Pending Review",
    verified: r.is_verified,
    datePosted: r.created_at,
    likes: r.likes ?? 0,
    comments: r.comments ?? 0,
    isLiked: r.is_liked ?? false,
    images: Array.isArray(r.images) ? r.images : [],
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

const MapPreview = ({ style }) => {
  return (
    <View style={[styles.mapCard, style]}>
      <MapView interactive={false} />

      <View style={styles.mapReminderCard}>
        <View style={styles.reminderIcon}>
          <Ionicons name="shield-checkmark-outline" size={17} color={PRIMARY} />
        </View>

        <View style={styles.reminderTextWrap}>
          <ThemedText style={styles.reminderTitle}>Area Reminder</ThemedText>
          <ThemedText style={styles.reminderText}>
            Stay aware of nearby reports and admin safety updates before going
            around the area.
          </ThemedText>
        </View>
      </View>
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
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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

  useAutoRefresh(loadReports, 30000);

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

  const handleDropdownToggle = (dropdownName) => {
    setOpenDropdown((current) =>
      current === dropdownName ? null : dropdownName
    );
  };

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

      setReports((prevReports) =>
        prevReports.map((report) =>
          report.id === reportId && report.postSource === "User"
            ? {
                ...report,
                isLiked: liked,
                likes: report.likes + (liked ? 1 : -1),
              }
            : report
        )
      );
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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[PRIMARY]}
            tintColor={PRIMARY}
          />
        }
      >
        <MapPreview style={styles.mapSpacing} />

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
          {filteredReports.map((report, index) => {
            const cardSpacing =
              index !== filteredReports.length - 1
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
    paddingBottom: 110,
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

  mapReminderCard: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderRadius: 20,
    padding: 13,
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.9)",
    flexDirection: "row",
    alignItems: "flex-start",
  },

  reminderIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#E8EEF9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  reminderTextWrap: {
    flex: 1,
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
});

export default User_Home;