import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Admin_Layout from "../../components/Admin_compo/Admin_Layout";
import Admin_ViewSimilarReportsModal from "../../components/Admin_compo/Admin_ViewSimilarReportsModal";
import Admin_AddReportModal from "../../components/Admin_compo/Admin_AddReportModal";
import Admin_AddAnnouncementModal from "../../components/Admin_compo/Admin_AddAnnouncementModal";
import apiClient from "../../services/apiClient";
import { uploadImage } from "../../services/imageUpload";
import useAutoRefresh from "../../hooks/useAutoRefresh";
import { getCache, setCache } from "../../services/dataStore";


const COMMUNISHIELD_BLUE = "#294880";

export default function Admin_Validation() {
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [selectedWeekRange, setSelectedWeekRange] = useState("All Weeks");
  const [selectedCompiledGroup, setSelectedCompiledGroup] = useState(null);
  const [viewVisible, setViewVisible] = useState(false);
  const [addReportVisible, setAddReportVisible] = useState(false);

  const [addAnnouncementVisible, setAddAnnouncementVisible] = useState(false);

  const [fontsLoaded] = useFonts({
    PoppinsRegular: require("../../assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("../../assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("../../assets/fonts/Poppins-SemiBold.ttf"),
  });

  const handleAddReport = () => {
    setAddReportVisible(true);
};

const handleAddAnnouncement = () => {
    setAddAnnouncementVisible(true);
  };



  const [reports, setReports] = useState([]);

  const formatSubmittedAt = (iso) => {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";

    return (
      date.toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      }) +
      " • " +
      date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    );
  };

  const loadValidation = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;

      const applyList = (list) => {
        setReports(
          list.map((r) => ({
            id: r.id,
            title: `${r.incident_type || "Incident"} in ${r.barangay || "Argao"}`,
            category: r.incident_category || "",
            type: r.incident_type || "",
            location: r.location || "",
            barangay: r.barangay || "",
            details: r.details || "",
            status: r.status || "Pending Review",
            aiScore: r.ai_score ?? 0,
            severity: r.severity || "Medium",
            sentiment: r.sentiment || "Neutral",
            credibilityReview: r.credibility_review || "",
            submittedBy: r.poster_name || "Anonymous User",
            submittedRole: r.source === "Admin" ? "Admin" : "User",
            submittedAt: formatSubmittedAt(r.created_at),
            verifiedBy: r.is_verified ? "System" : "",
            remarks: "",
            is_verified: r.is_verified,
            comments: r.comments || [],
            images: Array.isArray(r.images) ? r.images : [],
          }))
        );
      };

      const cached = getCache("api:/admin/dashboard");
      if (cached && Array.isArray(cached.reports)) {
        applyList(cached.reports);
      }

      const res = await apiClient.get("/admin/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
      });

      setCache("api:/admin/dashboard", res.data ?? {});
      applyList(res.data?.reports || []);
    } catch {
      // keep last loaded data on failure
    }
  }, []);

  useAutoRefresh(loadValidation, 30000);

  const statusFilters = [
    "All",
    "Pending Review",
    "Under Verification",
    "Resolved",
    "Rejected",
    "Archived",
  ];

  const weeklyRanges = ["All Weeks", "This Week", "Last Week"];

  const getHighestSeverity = (currentSeverity, newSeverity) => {
    const level = {
      Low: 1,
      Medium: 2,
      High: 3,
      Critical: 4,
    };

    return level[newSeverity] > level[currentSeverity]
      ? newSeverity
      : currentSeverity;
  };

  const getGroupMainStatus = (groupReports) => {
    if (groupReports.some((item) => item.status === "Pending Review")) {
      return "Pending Review";
    }

    if (groupReports.some((item) => item.status === "Under Verification")) {
      return "Under Verification";
    }

    if (groupReports.every((item) => item.status === "Resolved")) {
      return "Resolved";
    }

    if (groupReports.every((item) => item.status === "Rejected")) {
      return "Rejected";
    }

    if (groupReports.every((item) => item.status === "Archived")) {
      return "Archived";
    }

    return groupReports[0]?.status || "Pending Review";
  };

  const getGroupedReports = (reportsList) => {
    const grouped = {};

    reportsList.forEach((report) => {
      const groupKey = `${report.category}-${report.type}-${report.barangay}`.toLowerCase();

      if (!grouped[groupKey]) {
        grouped[groupKey] = {
          id: groupKey,
          title: `${report.type} in ${report.barangay}`,
          category: report.category,
          type: report.type,
          barangay: report.barangay,
          location: report.location,
          status: report.status,
          aiScore: report.aiScore,
          severity: report.severity,
          sentiment: report.sentiment,
          submittedAt: report.submittedAt,
          reports: [report],
        };
      } else {
        grouped[groupKey].reports.push(report);
        grouped[groupKey].aiScore = Math.max(
          grouped[groupKey].aiScore,
          report.aiScore
        );
        grouped[groupKey].severity = getHighestSeverity(
          grouped[groupKey].severity,
          report.severity
        );
      }
    });

    return Object.values(grouped).map((group) => {
      const statusSummary = group.reports.reduce((summary, report) => {
        summary[report.status] = (summary[report.status] || 0) + 1;
        return summary;
      }, {});

      const userReports = group.reports.filter(
        (report) => report.submittedRole === "User"
      );

      const adminReports = group.reports.filter(
        (report) => report.submittedRole === "Admin"
      );

      return {
        ...group,
        status: getGroupMainStatus(group.reports),
        reportCount: group.reports.length,
        userCount: userReports.length,
        adminCount: adminReports.length,
        highestAiScore: Math.max(
          ...group.reports.map((report) => report.aiScore)
        ),
        statusSummary,
      };
    });
  };

  const groupedReports = useMemo(() => {
    return getGroupedReports(reports);
  }, [reports]);

  const parseSubmittedDate = (submittedAt) => {
    const datePart = submittedAt.split("•")[0]?.trim();
    return new Date(datePart);
  };

  const isWithinWeeklyRange = (submittedAt, selectedRange) => {
    if (selectedRange === "All Weeks") return true;

    const reportDate = parseSubmittedDate(submittedAt);

    if (Number.isNaN(reportDate.getTime())) return true;

    const today = new Date();
    const currentDay = today.getDay();

    const startOfThisWeek = new Date(today);
    startOfThisWeek.setDate(today.getDate() - currentDay);
    startOfThisWeek.setHours(0, 0, 0, 0);

    const endOfThisWeek = new Date(startOfThisWeek);
    endOfThisWeek.setDate(startOfThisWeek.getDate() + 6);
    endOfThisWeek.setHours(23, 59, 59, 999);

    const startOfLastWeek = new Date(startOfThisWeek);
    startOfLastWeek.setDate(startOfThisWeek.getDate() - 7);

    const endOfLastWeek = new Date(startOfThisWeek);
    endOfLastWeek.setMilliseconds(-1);

    if (selectedRange === "This Week") {
      return reportDate >= startOfThisWeek && reportDate <= endOfThisWeek;
    }

    if (selectedRange === "Last Week") {
      return reportDate >= startOfLastWeek && reportDate <= endOfLastWeek;
    }

    return true;
  };

  const filteredReports = useMemo(() => {
    return groupedReports.filter((group) => {
      const matchesStatus =
        selectedStatus === "All" ||
        group.reports.some((report) => report.status === selectedStatus);

      const matchesWeek =
        selectedWeekRange === "All Weeks" ||
        group.reports.some((report) =>
          isWithinWeeklyRange(report.submittedAt, selectedWeekRange)
        );

      return matchesStatus && matchesWeek;
    });
  }, [groupedReports, selectedStatus, selectedWeekRange]);

  if (!fontsLoaded) {
    return null;
  }

  const totalReports = reports.length;

  const compiledIncidents = groupedReports.filter(
    (group) => group.reportCount > 1
  ).length;

  const pendingReports = reports.filter(
    (item) => item.status === "Pending Review"
  ).length;

  const verifyingReports = reports.filter(
    (item) => item.status === "Under Verification"
  ).length;

  const resolvedReports = reports.filter(
    (item) => item.status === "Resolved"
  ).length;

  const rejectedReports = reports.filter(
    (item) => item.status === "Rejected"
  ).length;

  const getStatusStyle = (status) => {
    if (status === "Resolved") {
      return {
        icon: "checkmark-circle-outline",
        color: "#22A06B",
        bg: "#EAF8F1",
      };
    }

    if (status === "Rejected") {
      return {
        icon: "close-circle-outline",
        color: "#E45757",
        bg: "#FFF5F5",
      };
    }

    if (status === "Under Verification") {
      return {
        icon: "sync-outline",
        color: COMMUNISHIELD_BLUE,
        bg: "#EAF2FF",
      };
    }

    if (status === "Archived") {
      return {
        icon: "archive-outline",
        color: "#6B7280",
        bg: "#EEF1F5",
      };
    }

    if (status === "Marked Fake") {
      return {
        icon: "warning-outline",
        color: "#B42318",
        bg: "#FFF1F0",
      };
    }

    return {
      icon: "time-outline",
      color: "#C98A2E",
      bg: "#FFF4E5",
    };
  };

  const getSeverityStyle = (severity) => {
    if (severity === "High" || severity === "Critical") {
      return {
        bg: "#FFF5F5",
        color: "#E45757",
      };
    }

    if (severity === "Medium") {
      return {
        bg: "#FFF4E5",
        color: "#C98A2E",
      };
    }

    return {
      bg: "#EAF8F1",
      color: "#22A06B",
    };
  };

  const openCompiledGroup = (group) => {
    setSelectedCompiledGroup(group);
    setViewVisible(true);
  };

  const closeReport = () => {
    setViewVisible(false);
    setSelectedCompiledGroup(null);
  };

  const applyValidation = async (target, newStatus) => {
    if (!target) return;

    const targetIds = target.reports
      ? target.reports.map((item) => item.id)
      : [target.id];

    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;

      await Promise.all(
        targetIds.map((id) =>
          apiClient.post(
            `/reports/${id}/status`,
            {
              status: newStatus,
              is_verified: newStatus === "Resolved",
            },
            { headers: { Authorization: `Bearer ${token}` } }
          )
        )
      );

      setViewVisible(false);
      setSelectedCompiledGroup(null);
      loadValidation();
    } catch (error) {
      Alert.alert(
        "Update Failed",
        error.response?.data?.error || "Could not update report status."
      );
    }
  };

  const handleVerify = (target) => {
    applyValidation(target, "Under Verification");
  };

  const handleReject = (target) => {
    applyValidation(target, "Rejected");
  };

  const handleMapAndVerify = (target) => {
    applyValidation(target, "Resolved");
  };

  const handleMarkAsFake = (report, group) => {
    applyValidation(group || report, "Marked Fake");
  };

  const handleAnnouncementSubmit = async (announcement) => {
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;

      let picUrl = null;
      if (announcement.image?.uri) {
        try {
          picUrl = await uploadImage(announcement.image.uri);
        } catch {
          // keep null on upload failure
        }
      }

      await apiClient.post(
        "/admin/announcements",
        {
          type: announcement.type,
          location: announcement.location,
          details: announcement.details,
          pic_url: picUrl,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setAddAnnouncementVisible(false);
      Alert.alert(
        "Announcement Published",
        "The announcement has been posted."
      );
    } catch (error) {
      Alert.alert(
        "Publish Failed",
        error.response?.data?.error || "Could not publish the announcement."
      );
    }
  };

  const handleReportSubmit = () => {
    setAddReportVisible(false);
  };


  const StatCard = ({ icon, title, value, color, bg }) => (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>

      <View style={styles.statTextBox}>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statTitle}>{title}</Text>
      </View>
    </View>
  );

  return (
    <Admin_Layout>
      <View style={styles.wrapper}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.statsRow}>
            <StatCard
              icon="documents-outline"
              title="Total Reports"
              value={totalReports}
              color={COMMUNISHIELD_BLUE}
              bg="#EAF2FF"
            />

            <StatCard
              icon="copy-outline"
              title="Similar Groups"
              value={compiledIncidents}
              color="#7C3AED"
              bg="#F3E8FF"
            />

            <StatCard
              icon="time-outline"
              title="Pending Review"
              value={pendingReports}
              color="#C98A2E"
              bg="#FFF4E5"
            />

            <StatCard
              icon="sync-outline"
              title="Under Verification"
              value={verifyingReports}
              color={COMMUNISHIELD_BLUE}
              bg="#EAF2FF"
            />

            <StatCard
              icon="checkmark-circle-outline"
              title="Resolved"
              value={resolvedReports}
              color="#22A06B"
              bg="#EAF8F1"
            />

            <StatCard
              icon="close-circle-outline"
              title="Rejected"
              value={rejectedReports}
              color="#E45757"
              bg="#FFF5F5"
            />
          </View>

          <View style={styles.filterCard}>
            <View style={styles.filterTopRow}>
              <View style={styles.filterHeaderTitleBox}>
                <View style={styles.filterMainIconBox}>
                  <Ionicons name="options-outline" size={20} color={COMMUNISHIELD_BLUE} />
                </View>

                <View>
                  <Text style={styles.filterMainTitle}>Filter Reports</Text>
                  <Text style={styles.filterMainSubtitle}>
                    Filter by status and weekly date range
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.addReportButton}
                onPress={handleAddReport}
                activeOpacity={0.85}
              >
                <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
                <Text style={styles.addReportButtonText}>Add Report</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.addReportButton}
                onPress={handleAddAnnouncement}
                activeOpacity={0.85}
              >
                <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
                <Text style={styles.addReportButtonText}>Add Announcement</Text>
              </TouchableOpacity>








            </View>

            <View style={styles.filterBody}>
              <View style={styles.filterColumn}>
                <View style={styles.filterHeaderRow}>
                  <View style={styles.filterTitleBox}>
                    <Ionicons name="funnel-outline" size={17} color={COMMUNISHIELD_BLUE} />
                    <Text style={styles.filterTitle}>Status</Text>
                  </View>

                  <Text style={styles.filterSelectedText}>{selectedStatus}</Text>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.filterRow}
                >
                  {statusFilters.map((status) => {
                    const isActive = selectedStatus === status;

                    return (
                      <TouchableOpacity
                        key={status}
                        style={[
                          styles.filterPill,
                          isActive && styles.activeFilterPill,
                        ]}
                        onPress={() => setSelectedStatus(status)}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.filterPillText,
                            isActive && styles.activeFilterPillText,
                          ]}
                        >
                          {status}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.filterColumn}>
                <View style={styles.filterHeaderRow}>
                  <View style={styles.filterTitleBox}>
                    <Ionicons
                      name="calendar-outline"
                      size={17}
                      color={COMMUNISHIELD_BLUE}
                    />
                    <Text style={styles.filterTitle}>Date Range</Text>
                  </View>

                  <Text style={styles.filterSelectedText}>Weekly only</Text>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.filterRow}
                >
                  {weeklyRanges.map((range) => {
                    const isActive = selectedWeekRange === range;

                    return (
                      <TouchableOpacity
                        key={range}
                        style={[
                          styles.datePill,
                          isActive && styles.activeDatePill,
                        ]}
                        onPress={() => setSelectedWeekRange(range)}
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name={isActive ? "calendar" : "calendar-outline"}
                          size={15}
                          color={isActive ? "#FFFFFF" : COMMUNISHIELD_BLUE}
                        />

                        <Text
                          style={[
                            styles.datePillText,
                            isActive && styles.activeDatePillText,
                          ]}
                        >
                          {range}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          </View>

          <View style={styles.reportsCard}>
            <View style={styles.listHeader}>
              <View style={styles.listHeaderTextBox}>
                <Text style={styles.sectionTitle}>Reports for Validation</Text>
              </View>

              <Text style={styles.resultText}>
                {filteredReports.length} result
                {filteredReports.length === 1 ? "" : "s"}
              </Text>
            </View>

            {filteredReports.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons
                  name="document-text-outline"
                  size={42}
                  color="#5D6F92"
                />
                <Text style={styles.emptyTitle}>No reports found</Text>
                <Text style={styles.emptyText}>
                  Try changing the status or weekly date range.
                </Text>
              </View>
            ) : (
              filteredReports.map((group, index) => {
                const statusStyle = getStatusStyle(group.status);
                const severityStyle = getSeverityStyle(group.severity);
                const isCompiled = group.reportCount > 1;

                return (
                  <View
                    key={group.id}
                    style={[
                      styles.reportRow,
                      index !== 0 && styles.reportRowBorder,
                    ]}
                  >
                    <View
                      style={[
                        styles.reportIconBox,
                        {
                          backgroundColor: isCompiled
                            ? "#F3E8FF"
                            : statusStyle.bg,
                        },
                      ]}
                    >
                      <Ionicons
                        name={isCompiled ? "copy-outline" : statusStyle.icon}
                        size={25}
                        color={isCompiled ? "#7C3AED" : statusStyle.color}
                      />
                    </View>

                    <View style={styles.reportContent}>
                      <View style={styles.reportTopRow}>
                        <View style={styles.reportTitleBox}>
                          <Text style={styles.reportTitle}>{group.title}</Text>

                          <Text style={styles.reportMeta}>
                            {group.reportCount} similar post
                            {group.reportCount === 1 ? "" : "s"}
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.statusBadge,
                            {
                              backgroundColor: statusStyle.bg,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeText,
                              {
                                color: statusStyle.color,
                              },
                            ]}
                          >
                            {group.status}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.infoBoxGrid}>
                        <View style={styles.infoItem}>
                          <Text style={styles.infoLabel}>Category</Text>
                          <Text style={styles.infoValue}>{group.category}</Text>
                        </View>

                        <View style={styles.infoItem}>
                          <Text style={styles.infoLabel}>Incident Type</Text>
                          <Text style={styles.infoValue}>{group.type}</Text>
                        </View>

                        <View style={styles.infoItem}>
                          <Text style={styles.infoLabel}>Location</Text>
                          <View style={styles.infoLocationRow}>
                            <Ionicons
                              name="location-outline"
                              size={15}
                              color="#5D6F92"
                            />
                            <Text style={styles.infoLocationText}>
                              {group.location}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.infoItem}>
                          <Text style={styles.infoLabel}>Highest AI Score</Text>
                          <Text style={styles.infoValue}>
                            {group.highestAiScore}%
                          </Text>
                        </View>

                        <View style={styles.infoItem}>
                          <Text style={styles.infoLabel}>Severity</Text>
                          <View
                            style={[
                              styles.miniBadge,
                              { backgroundColor: severityStyle.bg },
                            ]}
                          >
                            <Text
                              style={[
                                styles.miniBadgeText,
                                { color: severityStyle.color },
                              ]}
                            >
                              {group.severity}
                            </Text>
                          </View>
                        </View>
                      </View>

                      <View style={styles.bottomRow}>
                        <TouchableOpacity
                          style={styles.viewButton}
                          onPress={() => openCompiledGroup(group)}
                          activeOpacity={0.85}
                        >
                          <Ionicons
                            name="eye-outline"
                            size={17}
                            color="#FFFFFF"
                          />
                          <Text style={styles.viewButtonText}>
                            {isCompiled ? "View Posts" : "View Posts"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>

        <Admin_ViewSimilarReportsModal
        visible={viewVisible}
        compiledGroup={selectedCompiledGroup}
        onClose={closeReport}
        onVerify={handleVerify}
        onReject={handleReject}
        onMapAndVerify={handleMapAndVerify}
        onMarkAsFake={handleMarkAsFake}
    />

        <Admin_AddReportModal
        visible={addReportVisible}
        onClose={() => setAddReportVisible(false)}
        onSubmit={handleReportSubmit}
    />

    <Admin_AddAnnouncementModal
      visible={addAnnouncementVisible}
      onClose={() => setAddAnnouncementVisible(false)}
      onSubmit={handleAnnouncementSubmit}
    />
            
      </View>
    </Admin_Layout>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: "#F5F8FC",
  },

  container: {
    flex: 1,
    backgroundColor: "#F5F8FC",
  },

  scrollContent: {
    paddingBottom: 34,
  },

  statsRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: 10,
    marginBottom: 18,
  },

  statCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
  },

  statIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  statTextBox: {
    flex: 1,
    minWidth: 0,
  },

  statValue: {
    fontSize: 22,
    fontFamily: "PoppinsSemiBold",
    color: "#2F4267",
  },

  statTitle: {
    fontSize: 12,
    color: "#5D6F92",
    marginTop: 3,
    fontFamily: "PoppinsMedium",
  },

  filterCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 16,
    padding: 18,
    marginBottom: 18,
  },

  filterTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    marginBottom: 16,
  },

  filterHeaderTitleBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },

  filterMainIconBox: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#EAF2FF",
    alignItems: "center",
    justifyContent: "center",
  },

  filterMainTitle: {
    fontSize: 16,
    fontFamily: "PoppinsSemiBold",
    color: COMMUNISHIELD_BLUE,
  },

  filterMainSubtitle: {
    fontSize: 13,
    fontFamily: "PoppinsRegular",
    color: "#5D6F92",
    marginTop: 2,
  },

  addReportButton: {
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: COMMUNISHIELD_BLUE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },

  addReportButtonText: {
    fontSize: 13,
    fontFamily: "PoppinsSemiBold",
    color: "#FFFFFF",
  },

  filterBody: {
    flexDirection: "row",
    gap: 18,
    flexWrap: "wrap",
  },

  filterColumn: {
    flex: 1,
    minWidth: 320,
    backgroundColor: "#F7F9FD",
    borderWidth: 1,
    borderColor: "#E4EAF3",
    borderRadius: 14,
    padding: 14,
  },

  filterHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  },

  filterTitleBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  filterTitle: {
    fontSize: 14,
    fontFamily: "PoppinsSemiBold",
    color: COMMUNISHIELD_BLUE,
  },

  filterSelectedText: {
    fontSize: 12,
    fontFamily: "PoppinsMedium",
    color: "#7A8BA8",
  },

  filterRow: {
    gap: 10,
    paddingRight: 4,
  },

  filterPill: {
    height: 38,
    paddingHorizontal: 15,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },

  activeFilterPill: {
    backgroundColor: COMMUNISHIELD_BLUE,
    borderColor: COMMUNISHIELD_BLUE,
  },

  filterPillText: {
    fontSize: 13,
    fontFamily: "PoppinsMedium",
    color: COMMUNISHIELD_BLUE,
  },

  activeFilterPillText: {
    color: "#FFFFFF",
  },

  datePill: {
    height: 38,
    paddingHorizontal: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },

  activeDatePill: {
    backgroundColor: COMMUNISHIELD_BLUE,
    borderColor: COMMUNISHIELD_BLUE,
  },

  datePillText: {
    fontSize: 13,
    fontFamily: "PoppinsMedium",
    color: COMMUNISHIELD_BLUE,
  },

  activeDatePillText: {
    color: "#FFFFFF",
  },

  reportsCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 16,
    overflow: "hidden",
  },

  listHeader: {
    minHeight: 82,
    paddingHorizontal: 22,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#D9E2F0",
    backgroundColor: "#F7F9FD",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },

  listHeaderTextBox: {
    flex: 1,
  },

  sectionTitle: {
    fontSize: 21,
    fontFamily: "PoppinsSemiBold",
    color: COMMUNISHIELD_BLUE,
  },

  resultText: {
    fontSize: 15,
    fontFamily: "PoppinsMedium",
    color: COMMUNISHIELD_BLUE,
  },

  reportRow: {
    paddingHorizontal: 22,
    paddingVertical: 20,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
  },

  reportRowBorder: {
    borderTopWidth: 1,
    borderTopColor: "#E4EAF3",
  },

  reportIconBox: {
    width: 52,
    height: 52,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },

  reportContent: {
    flex: 1,
    minWidth: 0,
  },

  reportTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
  },

  reportTitleBox: {
    flex: 1,
  },

  reportTitle: {
    fontSize: 18,
    fontFamily: "PoppinsMedium",
    color: "#111827",
    lineHeight: 23,
    marginBottom: 4,
  },

  reportMeta: {
    fontSize: 14,
    color: "#5D6F92",
    lineHeight: 20,
    fontFamily: "PoppinsRegular",
  },

  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },

  statusBadgeText: {
    fontSize: 12,
    fontFamily: "PoppinsMedium",
  },

  infoBoxGrid: {
    flexDirection: "row",
    alignItems: "stretch",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },

  infoItem: {
    flex: 1,
    minWidth: 180,
    backgroundColor: "#F7F9FD",
    borderWidth: 1,
    borderColor: "#E4EAF3",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  infoLabel: {
    fontSize: 12,
    color: "#7A8BA8",
    fontFamily: "PoppinsMedium",
    marginBottom: 5,
  },

  infoValue: {
    fontSize: 14,
    color: COMMUNISHIELD_BLUE,
    fontFamily: "PoppinsMedium",
    lineHeight: 19,
  },

  infoLocationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },

  infoLocationText: {
    flex: 1,
    fontSize: 14,
    color: COMMUNISHIELD_BLUE,
    fontFamily: "PoppinsMedium",
    lineHeight: 19,
  },

  miniBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },

  miniBadgeText: {
    fontSize: 12,
    fontFamily: "PoppinsMedium",
  },

  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 12,
  },

  viewButton: {
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: COMMUNISHIELD_BLUE,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  viewButtonText: {
    fontSize: 13,
    fontFamily: "PoppinsSemiBold",
    color: "#FFFFFF",
  },

  emptyState: {
    paddingVertical: 48,
    alignItems: "center",
    justifyContent: "center",
  },

  emptyTitle: {
    fontSize: 18,
    fontFamily: "PoppinsMedium",
    color: "#2F4267",
    marginTop: 12,
    marginBottom: 6,
  },

  emptyText: {
    fontSize: 15,
    color: "#5D6F92",
    fontFamily: "PoppinsRegular",
  },
});