import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import AsyncStorage from "@react-native-async-storage/async-storage";

import Admin_Layout from "../../components/Admin_compo/Admin_Layout";
import apiClient from "../../services/apiClient";
import useAutoRefresh from "../../hooks/useAutoRefresh";
import { getCache, setCache, toReportCode } from "../../services/dataStore";

export default function Admin_Logs() {
  const [searchText, setSearchText] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("All");

  const [fontsLoaded] = useFonts({
    PoppinsRegular: require("../../assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("../../assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("../../assets/fonts/Poppins-SemiBold.ttf"),
  });

  const [logs, setLogs] = useState(() => {
    const cached = getCache("api:/admin/logs");
    return cached?.logs || [];
  });

  const formatLogTime = (iso) => {
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

  const loadLogs = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;

      const applyLogs = (list) =>
        setLogs(
          list.map((log) => ({
            ...log,
            reportId: toReportCode(log.reportId || log.id),
            dateTime: formatLogTime(log.dateTime),
          }))
        );

      const cached = getCache("api:/admin/logs");
      if (cached && Array.isArray(cached.logs)) {
        applyLogs(cached.logs);
      }

      const res = await apiClient.get("/admin/logs", {
        headers: { Authorization: `Bearer ${token}` },
      });

      setCache("api:/admin/logs", res.data ?? {});
      applyLogs(res.data?.logs || []);
    } catch {
      // keep last loaded data on failure
    }
  }, []);

  useAutoRefresh(loadLogs, 30000);

  const filters = [
    "All",
    "Report Verified",
    "Report Mapped",
    "Report Rejected",
    "Report Deleted",
    "AI Analysis Completed",
    "Admin Added",
    "Admin Updated",
    "Admin Disabled",
    "Admin Deleted",
    "System Settings Updated",
    "Announcement Created",
    "Notification Sent",
  ];

  const filteredLogs = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return logs.filter((log) => {
      const matchesFilter =
        selectedFilter === "All" || log.actionType === selectedFilter;

      const matchesSearch =
        !query ||
        log.id.toLowerCase().includes(query) ||
        log.title.toLowerCase().includes(query) ||
        log.actor.toLowerCase().includes(query) ||
        log.reportId.toLowerCase().includes(query) ||
        log.actionType.toLowerCase().includes(query) ||
        log.details.toLowerCase().includes(query);

      return matchesFilter && matchesSearch;
    });
  }, [searchText, selectedFilter, logs]);

  if (!fontsLoaded) {
    return null;
  }

  const totalLogs = logs.length;
  const verifiedLogs = logs.filter(
    (item) =>
      item.actionType === "Report Verified" ||
      item.actionType === "Report Mapped"
  ).length;
  const rejectedLogs = logs.filter(
    (item) =>
      item.actionType === "Report Rejected" ||
      item.actionType === "Report Deleted"
  ).length;
  const aiLogs = logs.filter(
    (item) => item.actionType === "AI Analysis Completed"
  ).length;

  const getLogStyle = (type) => {
    if (type === "Report Verified" || type === "Report Mapped") {
      return {
        icon:
          type === "Report Mapped"
            ? "map-outline"
            : "shield-checkmark-outline",
        color: "#22A06B",
        bg: "#EAF8F1",
      };
    }

    if (type === "Report Rejected" || type === "Report Deleted") {
      return {
        icon: "close-circle-outline",
        color: "#E45757",
        bg: "#FFF5F5",
      };
    }

    if (type === "AI Analysis Completed") {
      return {
        icon: "sparkles-outline",
        color: "#7C3AED",
        bg: "#F3E8FF",
      };
    }

    if (type && type.startsWith("Admin")) {
      return {
        icon: "person-circle-outline",
        color: "#294880",
        bg: "#EAF2FF",
      };
    }

    if (type === "Notification Sent") {
      return {
        icon: "notifications-outline",
        color: "#C98A2E",
        bg: "#FFF4E5",
      };
    }

    if (type === "Announcement Created") {
      return {
        icon: "add-circle-outline",
        color: "#294880",
        bg: "#EAF2FF",
      };
    }

    return {
      icon: "document-text-outline",
      color: "#294880",
      bg: "#EAF2FF",
    };
  };

  const getBadgeStyle = (type) => {
    if (type === "Report Verified" || type === "Report Mapped") {
      return {
        bg: "#EAF8F1",
        color: "#22A06B",
      };
    }

    if (type === "Report Rejected" || type === "Report Deleted") {
      return {
        bg: "#FFF5F5",
        color: "#E45757",
      };
    }

    if (type === "AI Analysis Completed") {
      return {
        bg: "#F3E8FF",
        color: "#7C3AED",
      };
    }

    if (type === "Notification Sent") {
      return {
        bg: "#FFF4E5",
        color: "#C98A2E",
      };
    }

    return {
      bg: "#EAF2FF",
      color: "#294880",
    };
  };

  const StatCard = ({ icon, title, value, color, bg }) => (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={25} color={color} />
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
              icon="list-outline"
              title="Total Logs"
              value={totalLogs}
              color="#294880"
              bg="#EAF2FF"
            />

            <StatCard
              icon="shield-checkmark-outline"
              title="Verified Actions"
              value={verifiedLogs}
              color="#22A06B"
              bg="#EAF8F1"
            />

            <StatCard
              icon="close-circle-outline"
              title="Rejected Reports"
              value={rejectedLogs}
              color="#E45757"
              bg="#FFF5F5"
            />

            <StatCard
              icon="sparkles-outline"
              title="AI Logs"
              value={aiLogs}
              color="#7C3AED"
              bg="#F3E8FF"
            />
          </View>

          <View style={styles.filterCard}>
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={21} color="#5D6F92" />

              <TextInput
                style={styles.searchInput}
                placeholder="Search by report ID, action, actor, or details..."
                placeholderTextColor="#8A98B3"
                value={searchText}
                onChangeText={setSearchText}
              />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {filters.map((filter) => {
                const isActive = selectedFilter === filter;

                return (
                  <TouchableOpacity
                    key={filter}
                    style={[
                      styles.filterPill,
                      isActive && styles.activeFilterPill,
                    ]}
                    onPress={() => setSelectedFilter(filter)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.filterPillText,
                        isActive && styles.activeFilterPillText,
                      ]}
                    >
                      {filter}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.logsCard}>
            <View style={styles.listHeader}>
              <View>
                <Text style={styles.sectionTitle}>Recent Admin Activity</Text>
                <Text style={styles.sectionSubtitle}>
                  These logs show report-related actions for normal admin
                  workflow.
                </Text>
              </View>

              <Text style={styles.resultText}>
                {filteredLogs.length} result
                {filteredLogs.length === 1 ? "" : "s"}
              </Text>
            </View>

            {filteredLogs.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="document-outline" size={42} color="#5D6F92" />
                <Text style={styles.emptyTitle}>No logs found</Text>
                <Text style={styles.emptyText}>
                  Try changing your search keyword or selected filter.
                </Text>
              </View>
            ) : (
              filteredLogs.map((log, index) => {
                const logStyle = getLogStyle(log.actionType);
                const badgeStyle = getBadgeStyle(log.actionType);

                return (
                  <View
                    key={log.id}
                    style={[styles.logRow, index !== 0 && styles.logRowBorder]}
                  >
                    <View
                      style={[
                        styles.logIconBox,
                        { backgroundColor: logStyle.bg },
                      ]}
                    >
                      <Ionicons
                        name={logStyle.icon}
                        size={25}
                        color={logStyle.color}
                      />
                    </View>

                    <View style={styles.logContent}>
                      <View style={styles.logTopRow}>
                        <View style={styles.logTitleBox}>
                          <Text style={styles.logTitle}>{log.title}</Text>
                          <Text style={styles.logMeta}>
                            {log.actor} • {log.dateTime}
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.actionBadge,
                            { backgroundColor: badgeStyle.bg },
                          ]}
                        >
                          <Text
                            style={[
                              styles.actionBadgeText,
                              { color: badgeStyle.color },
                            ]}
                          >
                            {log.actionType}
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.logDetails}>{log.details}</Text>

                      <View style={styles.statusChangeBox}>
                        <View style={styles.statusItem}>
                          <Text style={styles.statusLabel}>Report ID</Text>
                          <Text style={styles.statusValue}>{log.reportId}</Text>
                        </View>

                        <View style={styles.statusItem}>
                          <Text style={styles.statusLabel}>Old Status</Text>
                          <Text style={styles.statusValue}>
                            {log.oldStatus}
                          </Text>
                        </View>

                        <View style={styles.statusArrowBox}>
                          <Ionicons
                            name="arrow-forward-outline"
                            size={18}
                            color="#8A98B3"
                          />
                        </View>

                        <View style={styles.statusItem}>
                          <Text style={styles.statusLabel}>New Status</Text>
                          <Text style={styles.statusValue}>
                            {log.newStatus}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
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

  headerCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 18,
    padding: 24,
    marginBottom: 18,
  },

  headerTextBox: {
    flex: 1,
  },

  pageTitle: {
    fontSize: 30,
    color: "#294880",
    fontFamily: "PoppinsSemiBold",
    marginBottom: 8,
  },

  pageSubtitle: {
    fontSize: 16,
    color: "#5D6F92",
    lineHeight: 24,
    maxWidth: 900,
    fontFamily: "PoppinsRegular",
  },

  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    marginBottom: 18,
  },

  statCard: {
    flex: 1,
    minWidth: 210,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 16,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
  },

  statIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },

  statTextBox: {
    flex: 1,
  },

  statValue: {
    fontSize: 26,
    fontFamily: "PoppinsSemiBold",
    color: "#2F4267",
  },

  statTitle: {
    fontSize: 15,
    color: "#5D6F92",
    marginTop: 4,
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

  searchBox: {
    height: 50,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    backgroundColor: "#F7F9FD",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 16,
  },

  searchInput: {
    flex: 1,
    height: "100%",
    marginLeft: 10,
    color: "#294880",
    fontSize: 16,
    fontFamily: "PoppinsRegular",
    outlineStyle: Platform.OS === "web" ? "none" : undefined,
  },

  filterRow: {
    gap: 10,
  },

  filterPill: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },

  activeFilterPill: {
    backgroundColor: "#294880",
    borderColor: "#294880",
  },

  filterPillText: {
    fontSize: 14,
    fontFamily: "PoppinsMedium",
    color: "#294880",
  },

  activeFilterPillText: {
    color: "#FFFFFF",
  },

  logsCard: {
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

  sectionTitle: {
    fontSize: 21,
    fontFamily: "PoppinsSemiBold",
    color: "#294880",
    marginBottom: 5,
  },

  sectionSubtitle: {
    fontSize: 15,
    color: "#5D6F92",
    fontFamily: "PoppinsRegular",
  },

  resultText: {
    fontSize: 15,
    fontFamily: "PoppinsMedium",
    color: "#294880",
  },

  logRow: {
    paddingHorizontal: 22,
    paddingVertical: 20,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
  },

  logRowBorder: {
    borderTopWidth: 1,
    borderTopColor: "#E4EAF3",
  },

  logIconBox: {
    width: 52,
    height: 52,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },

  logContent: {
    flex: 1,
    minWidth: 0,
  },

  logTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  },

  logTitleBox: {
    flex: 1,
  },

  logTitle: {
    fontSize: 18,
    fontFamily: "PoppinsMedium",
    color: "#111827",
    lineHeight: 23,
    marginBottom: 4,
  },

  logMeta: {
    fontSize: 14,
    color: "#5D6F92",
    lineHeight: 20,
    fontFamily: "PoppinsRegular",
  },

  actionBadge: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },

  actionBadgeText: {
    fontSize: 12,
    fontFamily: "PoppinsMedium",
  },

  logDetails: {
    fontSize: 15,
    color: "#5D6F92",
    lineHeight: 22,
    marginBottom: 14,
    fontFamily: "PoppinsRegular",
  },

  statusChangeBox: {
    flexDirection: "row",
    alignItems: "stretch",
    flexWrap: "wrap",
    gap: 10,
  },

  statusItem: {
    flex: 1,
    minWidth: 160,
    backgroundColor: "#F7F9FD",
    borderWidth: 1,
    borderColor: "#E4EAF3",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  statusLabel: {
    fontSize: 12,
    color: "#7A8BA8",
    fontFamily: "PoppinsMedium",
    marginBottom: 5,
  },

  statusValue: {
    fontSize: 14,
    color: "#294880",
    fontFamily: "PoppinsMedium",
    lineHeight: 19,
  },

  statusArrowBox: {
    width: 34,
    alignItems: "center",
    justifyContent: "center",
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