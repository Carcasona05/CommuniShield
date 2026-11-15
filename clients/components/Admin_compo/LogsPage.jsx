import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { BatchFilterDropdown } from "../../components/Admin_compo/AdminBatchFilters";
import { ListSkeleton } from "../../components/PageSkeletons";
import ToastProvider, { useToast } from "../../components/Toast";
import apiClient from "../../services/apiClient";
import useViewMoreQuery from "../../hooks/useViewMoreQuery";
import QueryErrorNotice from "../QueryErrorNotice";
import { actorRoleValue, logDateFilters, validBrowsePage } from "../../services/adminBrowsing";
import useSmoothScrollToTop from "../../hooks/useSmoothScrollToTop";
import { toReportCode, hashReportIdsInText } from "../../services/dataStore";

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

const formatLogValue = (value) => {
  if (typeof value !== "string" || value === "") return "";
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) return "";
      if (parsed.length === 1) {
        const entry = parsed[0] || {};
        const status = entry.status || "";
        const label = entry.label || "";
        if (status && status !== "succeeded") return status;
        if (label) {
          let pct = null;
          if (
            typeof entry.confidence === "number" &&
            Number.isFinite(entry.confidence)
          ) {
            pct =
              entry.confidence <= 1
                ? Math.round(entry.confidence * 100)
                : Math.round(entry.confidence);
          }
          return pct === null ? label : `${label} (${pct}%)`;
        }
        return status;
      }
      const counts = {};
      parsed.forEach((entry) => {
        const key =
          entry && entry.status && entry.status !== "succeeded"
            ? entry.status
            : (entry && (entry.label || entry.status)) || "unknown";
        counts[key] = (counts[key] || 0) + 1;
      });
      const parts = Object.keys(counts)
        .sort((a, b) => counts[b] - counts[a])
        .map((key) => `${key} \u00d7 ${counts[key]}`);
      return `${parsed.length} records \u00b7 ${parts.join(", ")}`;
    }
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.count === "number"
    ) {
      return `${parsed.count} records`;
    }
    return value;
  } catch {
    return value;
  }
};

const mapLogs = (list) =>
  (list || []).map((log) => ({
    ...log,
    rawReportId: log.reportId || "",
    reportId: toReportCode(log.reportId || log.id),
    details: hashReportIdsInText(log.details || ""),
    dateTime: formatLogTime(log.dateTime),
    rawDateTime: log.dateTime || null,
    actorRole: log.actorRole || "system",
  }));

const STATUS_OPTIONS = [
  "All",
  "Report Verified",
  "Report Mapped",
  "Report Rejected",
  "Report Archived",
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

const POST_BY_OPTIONS = ["All", "User", "Admin", "Super Admin"];
const DATE_OPTIONS = ["All Time", "Today", "Last 7 Days", "Last 30 Days", "This Month"];
const ARCHIVED_STATUS_OPTIONS = ["All", "Report Archived"];

const LOG_TABS = [
  { key: "activity", label: "Activity logs", icon: "list-outline" },
  { key: "archived", label: "Archived reports", icon: "archive-outline" },
];

export default function LogsPage({ Layout }) {
  return (
    <ToastProvider>
      <LogsContent Layout={Layout} />
    </ToastProvider>
  );
}

function LogsContent({ Layout }) {
  const toast = useToast();
  const searchParams = useLocalSearchParams();
  const [activeTab, setActiveTab] = useState("activity");
  const [restoringId, setRestoringId] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [selectedArchivedStatus, setSelectedArchivedStatus] = useState("All");
  const [selectedPostBy, setSelectedPostBy] = useState("All");
  const [selectedDate, setSelectedDate] = useState("All Time");

  const [fontsLoaded] = useFonts({
    PoppinsRegular: require("../../assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("../../assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("../../assets/fonts/Poppins-SemiBold.ttf"),
  });

  const highlightParam = Array.isArray(searchParams?.highlightReport)
    ? searchParams.highlightReport[0]
    : searchParams?.highlightReport;
  const commonFilters = { ...logDateFilters(selectedDate), ...(actorRoleValue(selectedPostBy) ? { actorRole: actorRoleValue(selectedPostBy) } : {}) };
  const logQuery = useViewMoreQuery({ endpoint: "/admin/browse", params: { view: "logs", ...commonFilters,
    ...(selectedStatus !== "All" ? { status: selectedStatus } : {}), ...(highlightParam ? { focusReport: highlightParam } : {}) },
    validate: validBrowsePage, enabled: activeTab === "activity" });
  const archivedQuery = useViewMoreQuery({ endpoint: "/admin/browse", params: { view: "archived", ...commonFilters },
    validate: validBrowsePage, enabled: activeTab === "archived" });
  const { loading, reload: loadLogs } = logQuery;
  const { loading: archivedLoading, reload: loadArchived } = archivedQuery;
  const logs = useMemo(() => {
    const focus = logQuery.data?.focusedItem;
    const rows = focus && !logQuery.items.some(row => row.id === focus.id) ? [...logQuery.items, focus] : logQuery.items;
    return mapLogs(rows);
  }, [logQuery.items, logQuery.data?.focusedItem]);
  const archivedReports = archivedQuery.items;

  const [highlightId, setHighlightId] = useState(null);
  const highlightConsumedRef = useRef(null);
  const scrollRef = useRef(null);
  const { scrollToTop, trackScroll, stopScrollAnimation } = useSmoothScrollToTop(scrollRef);
  const logsCardTopRef = useRef(null);
  const rowOffsetsRef = useRef({});
  const [showScrollTop, setShowScrollTop] = useState(false);
  const showScrollTopRef = useRef(false);

  const handleRestoreReport = async (report) => {
    if (restoringId) return;

    const reportCode = toReportCode(report.id);
    setRestoringId(report.id);
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;

      await apiClient.post(
        `/reports/${report.id}/status`,
        { status: "Pending Review", is_verified: false },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      await Promise.all([loadArchived(), loadLogs()]);
      toast.success(`Report ${reportCode} restored to Pending Review.`);
    } catch (error) {
      toast.error(
        error?.response?.data?.error || "Could not restore this report."
      );
    } finally {
      setRestoringId(null);
    }
  };

  const filteredLogs = logs;
  const filteredArchivedReports = archivedReports;
  const visibleLogs = logs;
  const visibleArchived = archivedReports;

  const handleScroll = (e) => {
    trackScroll(e);
    const next = e.nativeEvent.contentOffset.y > 300;
    if (next !== showScrollTopRef.current) {
      showScrollTopRef.current = next;
      setShowScrollTop(next);
    }
  };

  useEffect(() => {
    if (!highlightParam || highlightConsumedRef.current === highlightParam) {
      return;
    }
    if (loading) return;

    const target = logs.find(
      (log) => log.rawReportId && log.rawReportId === highlightParam
    );
    if (!target) return;

    highlightConsumedRef.current = highlightParam;
    setHighlightId(target.id);

  }, [highlightParam, logs, loading]);

  useEffect(() => {
    if (!highlightId) return;

    const timer = setTimeout(() => setHighlightId(null), 3000);
    return () => clearTimeout(timer);
  }, [highlightId]);

  useEffect(() => {
    if (!highlightId) return;

    let tries = 0;
    let timer = null;

    const attempt = () => {
      const cardTop = logsCardTopRef.current;
      const rowTop = rowOffsetsRef.current[highlightId];

      if (cardTop != null && rowTop != null) {
        scrollRef.current?.scrollTo({
          y: Math.max(cardTop + rowTop - 90, 0),
          animated: true,
        });
        return;
      }

      if (tries < 15) {
        tries += 1;
        timer = setTimeout(attempt, 100);
      }
    };

    timer = setTimeout(attempt, 200);
    return () => clearTimeout(timer);
  }, [highlightId]);

  if (!fontsLoaded) {
    return null;
  }

  const totalLogs = logQuery.data?.total ?? "—";
  const verifiedLogs = logQuery.data?.stats.verified ?? "—";
  const rejectedLogs = logQuery.data?.stats.rejected ?? "—";
  const aiLogs = logQuery.data?.stats.ai ?? "—";

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

    if (type === "Report Archived") {
      return {
        icon: "archive-outline",
        color: "#64748B",
        bg: "#EEF2F6",
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

    if (type === "Report Archived") {
      return {
        bg: "#EEF2F6",
        color: "#64748B",
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
    <Layout>
      <Pressable style={styles.wrapper} onPress={() => setHighlightId(null)}>
        <ScrollView
          ref={scrollRef}
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          onScrollBeginDrag={stopScrollAnimation}
          onTouchStart={stopScrollAnimation}
          scrollEventThrottle={16}
        >
          <View style={styles.tabBar} accessibilityRole="tablist">
            {LOG_TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.tabButton, isActive && styles.tabButtonActive]}
                  onPress={() => setActiveTab(tab.key)}
                  accessibilityRole="tab"
                  accessibilityLabel={tab.label}
                  accessibilityState={{ selected: isActive }}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name={tab.icon}
                    size={16}
                    color={isActive ? "#294880" : "#7A8BA8"}
                  />
                  <Text
                    style={[styles.tabText, isActive && styles.tabTextActive]}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {activeTab === "activity" ? (
            <>
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
                <View style={styles.filterRow}>
                  <BatchFilterDropdown
                    label="Post by"
                    value={selectedPostBy}
                    options={POST_BY_OPTIONS}
                    onChange={setSelectedPostBy}
                  />
                  <BatchFilterDropdown
                    label="Status"
                    value={selectedStatus}
                    options={STATUS_OPTIONS}
                    onChange={setSelectedStatus}
                  />
                  <BatchFilterDropdown
                    label="Date"
                    value={selectedDate}
                    options={DATE_OPTIONS}
                    onChange={setSelectedDate}
                  />
                </View>
              </View>
            </>
          ) : (
            <View style={styles.filterCard}>
              <View style={styles.filterRow}>
                <BatchFilterDropdown label="Post by" value={selectedPostBy} options={POST_BY_OPTIONS} onChange={setSelectedPostBy} />
                <BatchFilterDropdown label="Status" value={selectedArchivedStatus} options={ARCHIVED_STATUS_OPTIONS} onChange={setSelectedArchivedStatus} />
                <BatchFilterDropdown label="Date" value={selectedDate} options={DATE_OPTIONS} onChange={setSelectedDate} />
              </View>
            </View>
          )}

          <View
            style={styles.logsCard}
            onLayout={(e) => {
              logsCardTopRef.current = e.nativeEvent.layout.y;
            }}
          >
            <View style={styles.listHeader}>
              <View>
                <Text style={styles.sectionTitle}>
                  {activeTab === "activity"
                    ? "Recent Activity"
                    : "Archived reports"}
                </Text>
                <Text style={styles.sectionSubtitle}>
                  {activeTab === "activity"
                    ? "Unified admin and super admin activity across the system."
                    : "Reports moved out of every active feed and feature."}
                </Text>
              </View>

              <Text style={styles.resultText}>
                 {activeTab === "activity"
                  ? logQuery.data?.total ?? "—"
                  : archivedQuery.data?.total ?? "—"}{" "}
                result
                {(activeTab === "activity"
                  ? logQuery.data?.total
                  : archivedQuery.data?.total) === 1
                  ? ""
                  : "s"}
              </Text>
            </View>
            <QueryErrorNotice message={activeTab === "activity" ? logQuery.errorMessage : archivedQuery.errorMessage}
              onRetry={activeTab === "activity" ? loadLogs : loadArchived}
              refreshing={activeTab === "activity" ? logQuery.refreshing : archivedQuery.refreshing}
              hasData={Boolean(activeTab === "activity" ? logQuery.data : archivedQuery.data)} />
            {activeTab !== "activity" ? null : loading ? <ListSkeleton /> : !logQuery.data ? null : filteredLogs.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="document-outline" size={42} color="#5D6F92" />
                <Text style={styles.emptyTitle}>No logs found</Text>
                <Text style={styles.emptyText}>
                  Try changing your search keyword or selected filter.
                </Text>
              </View>
            ) : (
              visibleLogs.map((log, index) => {
                const logStyle = getLogStyle(log.actionType);
                const badgeStyle = getBadgeStyle(log.actionType);

                return (
                  <View
                    key={log.id}
                    onLayout={(e) => {
                      rowOffsetsRef.current[log.id] =
                        e.nativeEvent.layout.y;
                    }}
                    style={[
                      styles.logRow,
                      index !== 0 && styles.logRowBorder,
                      highlightId === log.id && styles.logRowHighlight,
                    ]}
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
                            {formatLogValue(log.oldStatus) || "N/A"}
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
                            {formatLogValue(log.newStatus) || "N/A"}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })
            )}

            {activeTab === "archived" ? (
              archivedLoading ? (
                <View style={styles.emptyState}>
                  <ActivityIndicator size="small" color="#294880" />
                  <Text style={[styles.emptyText, styles.loadingText]}>
                    Loading archived reports...
                  </Text>
                </View>
              ) : !archivedQuery.data ? null : filteredArchivedReports.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="archive-outline" size={42} color="#5D6F92" />
                  <Text style={styles.emptyTitle}>No archived reports</Text>
                  <Text style={styles.emptyText}>
                    Reports moved to the archive appear here.
                  </Text>
                </View>
              ) : (
                <>
                  {visibleArchived.map((report, index) => (
                    <View
                      key={report.id}
                      testID="archived-report-row"
                      style={[
                        styles.logRow,
                        index !== 0 && styles.logRowBorder,
                      ]}
                    >
                      <View
                        style={[styles.logIconBox, { backgroundColor: "#EEF2F6" }]}
                      >
                        <Ionicons
                          name="archive-outline"
                          size={25}
                          color="#64748B"
                        />
                      </View>

                      <View style={styles.logContent}>
                        <View style={styles.logTopRow}>
                          <View style={styles.logTitleBox}>
                            <Text style={styles.logTitle}>
                              {report.incident_type || "Incident"}
                            </Text>
                            <Text style={styles.logMeta}>
                              {report.reporter_name || "Anonymous User"} •{" "}
                              {formatLogTime(report.created_at)}
                            </Text>
                          </View>

                          <View
                            style={[
                              styles.actionBadge,
                              { backgroundColor: "#EEF2F6" },
                            ]}
                          >
                            <Text
                              style={[
                                styles.actionBadgeText,
                                { color: "#64748B" },
                              ]}
                            >
                              Archived
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.logDetails}>
                          {[report.location, report.incident_category]
                            .filter(Boolean)
                            .join(" • ") || "Location not specified"}
                        </Text>

                        <View style={styles.statusChangeBox}>
                          <View style={styles.statusItem}>
                            <Text style={styles.statusLabel}>Report ID</Text>
                            <Text style={styles.statusValue}>
                              {toReportCode(report.id)}
                            </Text>
                          </View>

                          <View style={styles.statusItem}>
                            <Text style={styles.statusLabel}>Status</Text>
                            <Text style={styles.statusValue}>Archived</Text>
                          </View>

                          <View style={styles.statusItem}>
                            <Text style={styles.statusLabel}>Severity</Text>
                            <Text style={styles.statusValue}>
                              {report.severity || "Medium"}
                            </Text>
                          </View>

                          <TouchableOpacity
                            style={styles.restoreBtn}
                            onPress={() => handleRestoreReport(report)}
                            disabled={Boolean(restoringId)}
                            accessibilityRole="button"
                            accessibilityLabel={`Restore report ${toReportCode(report.id)}`}
                            activeOpacity={0.85}
                          >
                            {restoringId === report.id ? (
                              <ActivityIndicator size="small" color="#294880" />
                            ) : (
                              <Ionicons
                                name="refresh-outline"
                                size={15}
                                color="#294880"
                              />
                            )}
                            <Text style={styles.restoreText}>Restore</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  ))}

                  {archivedQuery.hasMore && (
                    <TouchableOpacity
                      style={styles.viewMoreBtn}
                      onPress={archivedQuery.loadMore}
                      disabled={archivedQuery.loadingMore || archivedQuery.refreshing}
                      accessibilityRole="button"
                      accessibilityLabel="View more archived reports"
                      activeOpacity={0.8}
                    >
                      <Text style={styles.viewMoreText}>{archivedQuery.loadingMore ? "Loading more…" : "View more"}</Text>
                    </TouchableOpacity>
                  )}
                </>
              )
            ) : null}

            {activeTab === "activity" &&
              logQuery.hasMore && (
                <TouchableOpacity
                  style={styles.viewMoreBtn}
                  onPress={logQuery.loadMore}
                  disabled={logQuery.loadingMore || logQuery.refreshing}
                  accessibilityRole="button"
                  accessibilityLabel="View more logs"
                  activeOpacity={0.8}
                >
                  <Text style={styles.viewMoreText}>{logQuery.loadingMore ? "Loading more…" : "View more"}</Text>
                </TouchableOpacity>
              )}
          </View>
        </ScrollView>

        {showScrollTop && (
          <TouchableOpacity
            style={styles.scrollTopBtn}
            accessibilityRole="button"
            accessibilityLabel="Back to top"
            onPress={scrollToTop}
            activeOpacity={0.8}
          >
            <Ionicons name="chevron-up" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </Pressable>
    </Layout>
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
    fontSize: 24,
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
    fontSize: 22,
    fontFamily: "PoppinsSemiBold",
    color: "#2F4267",
  },

  statTitle: {
    fontSize: 12,
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
    zIndex: 30,
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
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    gap: 12,
  },

  logsCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 16,
    overflow: "hidden",
  },

  tabBar: {
    flexDirection: "row",
    gap: 8,
    padding: 5,
    marginBottom: 18,
    borderRadius: 14,
    backgroundColor: "#F0F3F8",
    borderWidth: 1,
    borderColor: "#E4EAF3",
  },

  tabButton: {
    flex: 1,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 10,
  },

  tabButtonActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },

  tabText: {
    fontSize: 14,
    fontFamily: "PoppinsMedium",
    color: "#7A8BA8",
    textAlign: "center",
  },

  tabTextActive: {
    fontFamily: "PoppinsSemiBold",
    color: "#294880",
  },

  restoreBtn: {
    minWidth: 160,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#C9D6EC",
    backgroundColor: "#EAF2FF",
  },

  restoreText: {
    fontSize: 13,
    fontFamily: "PoppinsMedium",
    color: "#294880",
  },

  loadingText: {
    marginTop: 12,
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
    fontSize: 16,
    fontFamily: "PoppinsSemiBold",
    color: "#294880",
    marginBottom: 5,
  },

  sectionSubtitle: {
    fontSize: 13,
    color: "#5D6F92",
    fontFamily: "PoppinsRegular",
  },

  resultText: {
    fontSize: 12,
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

  logRowHighlight: {
    backgroundColor: "#EEF4FF",
    borderColor: "#294880",
    borderRadius: 10,
    borderTopWidth: 2.5,
    borderBottomWidth: 2.5,
    borderLeftWidth: 2.5,
    borderRightWidth: 2.5,
    marginTop: 5,
    marginBottom: 5,
    marginHorizontal: 6,
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
    fontSize: 16,
    fontFamily: "PoppinsMedium",
    color: "#111827",
    lineHeight: 22,
    marginBottom: 4,
  },

  logMeta: {
    fontSize: 12,
    color: "#5D6F92",
    lineHeight: 18,
    fontFamily: "PoppinsRegular",
  },

  actionBadge: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },

  actionBadgeText: {
    fontSize: 11,
    fontFamily: "PoppinsMedium",
  },

  logDetails: {
    fontSize: 13,
    color: "#5D6F92",
    lineHeight: 19,
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
    fontSize: 12,
    color: "#294880",
    fontFamily: "PoppinsMedium",
    lineHeight: 18,
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
    fontSize: 16,
    fontFamily: "PoppinsMedium",
    color: "#2F4267",
    marginTop: 12,
    marginBottom: 6,
  },

  emptyText: {
    fontSize: 13,
    color: "#5D6F92",
    fontFamily: "PoppinsRegular",
  },

  viewMoreBtn: {
    alignSelf: "center",
    marginTop: 16,
    marginBottom: 6,
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#294880",
  },

  viewMoreText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "PoppinsSemiBold",
  },

  scrollTopBtn: {
    position: "absolute",
    right: 26,
    bottom: 30,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#294880",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
    elevation: 6,
    shadowColor: "#000000",
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
});
