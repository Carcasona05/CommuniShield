import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from "react-native";
import { Ionicons, MaterialIcons, Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFonts } from "expo-font";
import AsyncStorage from "@react-native-async-storage/async-storage";
import SAdmin_Layout from "../../components/SAdmin_Compo/SAdmin_Layout";
import apiClient from "../../services/apiClient";
import useAutoRefresh from "../../hooks/useAutoRefresh";
import { getCache, setCache } from "../../services/dataStore";
import { SAdminDashboardSkeleton } from "../../components/AdminSkeleton";

const formatRelativeTime = (iso) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
};

const getActivityStyle = (actionType = "") => {
  if (actionType.includes("Deleted")) {
    return {
      icon: "trash-outline",
      color: "#DC2626",
      bg: "#FEE2E2",
    };
  }

  if (actionType.includes("Verified")) {
    return {
      icon: "shield-checkmark-outline",
      color: "#059669",
      bg: "#D1FAE5",
    };
  }

  if (actionType.includes("Mapped")) {
    return {
      icon: "map-outline",
      color: "#059669",
      bg: "#D1FAE5",
    };
  }

  if (actionType.includes("Admin")) {
    return {
      icon: "person-circle-outline",
      color: "#2563EB",
      bg: "#DBEAFE",
    };
  }

  if (actionType.includes("AI")) {
    return {
      icon: "sparkles-outline",
      color: "#7C3AED",
      bg: "#EDE9FE",
    };
  }

  return {
    icon: "document-text-outline",
    color: "#D97706",
    bg: "#FFF4E5",
  };
};

const formatCount = (value) =>
  String(value ?? 0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export default function SAdmin_Dashboard() {
  const router = useRouter();

  const [fontsLoaded] = useFonts({
    PoppinsRegular: require("../../assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("../../assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("../../assets/fonts/Poppins-SemiBold.ttf"),
  });

  const [summary, setSummary] = useState(() => {
    const cached = getCache("api:/admin/dashboard");
    return cached?.summary || { total: 0, pending: 0, verified: 0, rejected: 0 };
  });
  const [accounts, setAccounts] = useState(() => {
    const cached = getCache("api:/admin/accounts");
    return cached?.accounts || [];
  });
  const [logs, setLogs] = useState(() => {
    const cached = getCache("api:/admin/logs");
    return cached?.logs || [];
  });
  const [loading, setLoading] = useState(() => getCache("api:/admin/dashboard") === undefined);

  const fetchDashboard = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;

      const cached = getCache("api:/admin/dashboard");
      if (cached?.summary) {
        setSummary(cached.summary);
      }

      const res = await apiClient.get("/admin/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
      });

      setCache("api:/admin/dashboard", res.data ?? {});
      setSummary(res.data?.summary ?? {});
    } catch {
      // keep last loaded data on failure
    }
  }, []);

  const fetchAccounts = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;

      const cached = getCache("api:/admin/accounts");
      if (cached && Array.isArray(cached.accounts)) {
        setAccounts(cached.accounts);
      }

      const res = await apiClient.get("/admin/accounts", {
        headers: { Authorization: `Bearer ${token}` },
      });

      setCache("api:/admin/accounts", res.data ?? {});
      setAccounts(res.data?.accounts || []);
    } catch {
      // keep last loaded data on failure
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;

      const cached = getCache("api:/admin/logs");
      if (cached && Array.isArray(cached.logs)) {
        setLogs(cached.logs);
      }

      const res = await apiClient.get("/admin/logs", {
        headers: { Authorization: `Bearer ${token}` },
      });

      setCache("api:/admin/logs", res.data ?? {});
      setLogs(res.data?.logs || []);
    } catch {
      // keep last loaded data on failure
    }
  }, []);

  const loadDashboard = useCallback(async () => {
    await Promise.all([fetchDashboard(), fetchAccounts(), fetchLogs()]);
    setLoading(false);
  }, [fetchDashboard, fetchAccounts, fetchLogs]);

  useAutoRefresh(loadDashboard, 30000);

  if (!fontsLoaded) {
    return null;
  }

  if (loading) {
    return (
      <SAdmin_Layout>
        <SAdminDashboardSkeleton />
      </SAdmin_Layout>
    );
  }

  const totalReports = summary.total || 0;
  const pendingReports = summary.pending || 0;
  const verifiedReports = summary.verified || 0;
  const rejectedReports = summary.rejected || 0;

  const activeAdmins = accounts.filter(
    (a) => a.role === "admin" && a.status === "Active"
  ).length;

  const auditLogsToday = logs.filter((log) => {
    const date = new Date(log.dateTime);
    return (
      !Number.isNaN(date.getTime()) &&
      date.toDateString() === new Date().toDateString()
    );
  }).length;

  const pct = (value) =>
    totalReports ? Math.round((value / totalReports) * 100) : 0;

  const overviewCards = [
    {
      title: "Total Reports",
      value: formatCount(totalReports),
      note: "All submitted incident reports",
      icon: "document-text-outline",
      iconType: "Ionicons",
      color: "#294880",
      bg: "#E8EFFB",
    },
    {
      title: "Pending Reports",
      value: formatCount(pendingReports),
      note: "Waiting for validation",
      icon: "time-outline",
      iconType: "Ionicons",
      color: "#D97706",
      bg: "#FEF3C7",
    },
    {
      title: "Verified Reports",
      value: formatCount(verifiedReports),
      note: "Mapped and verified reports",
      icon: "shield-checkmark-outline",
      iconType: "Ionicons",
      color: "#059669",
      bg: "#D1FAE5",
    },
    {
      title: "Rejected Reports",
      value: formatCount(rejectedReports),
      note: "Reports marked as invalid",
      icon: "close-circle-outline",
      iconType: "Ionicons",
      color: "#DC2626",
      bg: "#FEE2E2",
    },
    {
      title: "Active Admins",
      value: formatCount(activeAdmins),
      note: "Normal admins currently registered",
      icon: "people-outline",
      iconType: "Ionicons",
      color: "#2563EB",
      bg: "#DBEAFE",
    },
    {
      title: "Audit Logs Today",
      value: formatCount(auditLogsToday),
      note: "System and admin activities",
      icon: "list-outline",
      iconType: "Ionicons",
      color: "#7C3AED",
      bg: "#EDE9FE",
    },
  ];

  const adminSummary = [
    {
      label: "SuperAdmin Accounts",
      value: formatCount(
        accounts.filter((a) => a.role === "super_admin").length
      ),
      icon: "star-outline",
      color: "#294880",
    },
    {
      label: "Normal Admin Accounts",
      value: formatCount(accounts.filter((a) => a.role === "admin").length),
      icon: "person-outline",
      color: "#2563EB",
    },
    {
      label: "Pending Admin Requests",
      value: "0",
      icon: "person-add-outline",
      color: "#D97706",
    },
    {
      label: "Disabled Accounts",
      value: formatCount(
        accounts.filter((a) => a.status === "Disabled").length
      ),
      icon: "person-remove-outline",
      color: "#DC2626",
    },
  ];

  const recentActivities = logs.slice(0, 5).map((log) => {
    const style = getActivityStyle(log.actionType);

    return {
      id: log.id,
      title: log.title || log.actionType || "Activity",
      description: log.details || "",
      time: formatRelativeTime(log.dateTime),
      type: log.actionType || "Activity",
      icon: style.icon,
      color: style.color,
      bg: style.bg,
    };
  });

  const aiSettings = [
    {
      label: "AI Scoring",
      value: "Enabled",
      status: "active",
    },
    {
      label: "High Credibility Threshold",
      value: "90%",
      status: "normal",
    },
    {
      label: "Medium Credibility Threshold",
      value: "65%",
      status: "normal",
    },
    {
      label: "Model Version",
      value: "CommuniShield-AI v1.0",
      status: "normal",
    },
  ];

  const reportBreakdown = [
    {
      label: "Verified",
      value: pct(verifiedReports),
      color: "#059669",
    },
    {
      label: "Pending",
      value: pct(pendingReports),
      color: "#D97706",
    },
    {
      label: "Rejected",
      value: pct(rejectedReports),
      color: "#DC2626",
    },
  ];

  const getCardIcon = (item) => {
    if (item.iconType === "Feather") {
      return <Feather name={item.icon} size={23} color={item.color} />;
    }

    if (item.iconType === "MaterialIcons") {
      return <MaterialIcons name={item.icon} size={23} color={item.color} />;
    }

    return <Ionicons name={item.icon} size={23} color={item.color} />;
  };

  return (
    <SAdmin_Layout>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.overviewGrid}>
          {overviewCards.map((item, index) => (
            <View key={index} style={styles.overviewCard}>
              <View
                style={[
                  styles.overviewIconBox,
                  { backgroundColor: item.bg },
                ]}
              >
                {getCardIcon(item)}
              </View>

              <View style={styles.overviewTextBox}>
                <Text style={styles.overviewValue}>{item.value}</Text>
                <Text style={styles.overviewTitle}>{item.title}</Text>
                <Text style={styles.overviewNote}>{item.note}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.mainGrid}>
          <View style={styles.leftColumn}>
            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <View>
                  <Text style={styles.panelTitle}>
                    Report Verification Overview
                  </Text>
                  <Text style={styles.panelSubtitle}>
                    Current report status distribution
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.smallActionButton}
                  onPress={() => router.push("/(admin)/Admin_Reports")}
                  activeOpacity={0.8}
                >
                  <Text style={styles.smallActionText}>View Reports</Text>
                  <Ionicons
                    name="arrow-forward-outline"
                    size={15}
                    color="#294880"
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.breakdownList}>
                {reportBreakdown.map((item, index) => (
                  <View key={index} style={styles.breakdownItem}>
                    <View style={styles.breakdownTop}>
                      <Text style={styles.breakdownLabel}>{item.label}</Text>
                      <Text style={styles.breakdownValue}>{item.value}%</Text>
                    </View>

                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${item.value}%`,
                            backgroundColor: item.color,
                          },
                        ]}
                      />
                    </View>
                  </View>
                ))}
              </View>
            </View>

            <View style={[styles.panel, { minHeight: 545 }]}>
              <View style={styles.panelHeader}>
                <View>
                  <Text style={styles.panelTitle}>
                    Recent Critical Activities
                  </Text>
                  <Text style={styles.panelSubtitle}>
                    Latest actions automatically recorded in the audit trail
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.smallActionButton}
                  onPress={() => router.push("/(sadmin)/SAdmin_AuditLogs")}
                  activeOpacity={0.8}
                >
                  <Text style={styles.smallActionText}>Audit Logs</Text>
                  <Ionicons
                    name="arrow-forward-outline"
                    size={15}
                    color="#294880"
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.activityList}>
                {recentActivities.map((item) => (
                  <View key={item.id} style={styles.activityItem}>
                    <View
                      style={[
                        styles.activityIconBox,
                        { backgroundColor: item.bg },
                      ]}
                    >
                      <Ionicons
                        name={item.icon}
                        size={20}
                        color={item.color}
                      />
                    </View>

                    <View style={styles.activityContent}>
                      <View style={styles.activityHeader}>
                        <Text style={styles.activityTitle}>{item.title}</Text>
                        <Text style={styles.activityTime}>{item.time}</Text>
                      </View>

                      <Text style={styles.activityDesc}>
                        {item.description}
                      </Text>

                      <View style={styles.activityTag}>
                        <Text style={styles.activityTagText}>{item.type}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </View>

          <View style={styles.rightColumn}>
            <View style={styles.panel}>
              <View style={styles.panelHeaderCompact}>
                <View>
                  <Text style={styles.panelTitle}>Admin Management</Text>
                  <Text style={styles.panelSubtitle}>
                    Account and role summary
                  </Text>
                </View>
              </View>

              <View style={styles.adminSummaryList}>
                {adminSummary.map((item, index) => (
                  <View key={index} style={styles.adminSummaryItem}>
                    <View style={styles.adminSummaryLeft}>
                      <View style={styles.adminIconCircle}>
                        <Ionicons
                          name={item.icon}
                          size={18}
                          color={item.color}
                        />
                      </View>

                      <Text style={styles.adminSummaryLabel}>
                        {item.label}
                      </Text>
                    </View>

                    <Text style={styles.adminSummaryValue}>{item.value}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => router.push("/(sadmin)/SAdmin_AdminAccounts")}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryButtonText}>
                  Manage Admin Accounts
                </Text>
                <Ionicons
                  name="arrow-forward-outline"
                  size={17}
                  color="#FFFFFF"
                />
              </TouchableOpacity>
            </View>

            <View style={styles.panel}>
              <View style={styles.panelHeaderCompact}>
                <View>
                  <Text style={styles.panelTitle}>AI Configuration Status</Text>
                  <Text style={styles.panelSubtitle}>
                    Current AI and model settings
                  </Text>
                </View>
              </View>

              <View style={styles.aiList}>
                {aiSettings.map((item, index) => (
                  <View key={index} style={styles.aiItem}>
                    <View>
                      <Text style={styles.aiLabel}>{item.label}</Text>
                      <Text style={styles.aiValue}>{item.value}</Text>
                    </View>

                    <View
                      style={[
                        styles.statusPill,
                        item.status === "active" && styles.activeStatusPill,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusPillText,
                          item.status === "active" &&
                            styles.activeStatusPillText,
                        ]}
                      >
                        {item.status === "active" ? "Active" : "Set"}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </SAdmin_Layout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFD",
  },

  contentContainer: {
    paddingBottom: 30,
  },

  overviewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 22,
  },

  overviewCard: {
    flexGrow: 1,
    flexBasis: 250,
    minWidth: 230,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#294880",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    elevation: 3,
  },

  overviewIconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },

  overviewTextBox: {
    flex: 1,
  },

  overviewValue: {
    fontSize: 24,
    fontFamily: "PoppinsSemiBold",
    color: "#294880",
    marginBottom: 2,
  },

  overviewTitle: {
    fontSize: 14,
    fontFamily: "PoppinsSemiBold",
    color: "#30415F",
  },

  overviewNote: {
    fontSize: 12,
    fontFamily: "PoppinsRegular",
    color: "#6B7A99",
    marginTop: 3,
  },

  mainGrid: {
    flexDirection: "row",
    gap: 20,
    alignItems: "flex-start",
  },

  leftColumn: {
    flex: 1.55,
    gap: 20,
  },

  rightColumn: {
    flex: 1,
    gap: 20,
  },

  panel: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    padding: 20,
    shadowColor: "#294880",
    shadowOpacity: 0.06,
    shadowRadius: 14,
    
    shadowOffset: {
      width: 0,
      height: 8,
    },
    elevation: 3,
  },

  panelHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 18,
    gap: 14,
  },

  panelHeaderCompact: {
    marginBottom: 18,
  },

  panelTitle: {
    fontSize: 18,
    fontFamily: "PoppinsSemiBold",
    color: "#294880",
    marginBottom: 4,
  },

  panelSubtitle: {
    fontSize: 13,
    fontFamily: "PoppinsRegular",
    color: "#6B7A99",
    lineHeight: 18,
  },

  smallActionButton: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#E8EFFB",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  smallActionText: {
    fontSize: 13,
    fontFamily: "PoppinsMedium",
    color: "#294880",
  },

  breakdownList: {
    gap: 16,
  },

  breakdownItem: {
    gap: 8,
  },

  breakdownTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  breakdownLabel: {
    fontSize: 14,
    fontFamily: "PoppinsMedium",
    color: "#30415F",
  },

  breakdownValue: {
    fontSize: 14,
    fontFamily: "PoppinsSemiBold",
    color: "#294880",
  },

  progressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "#EEF3FA",
    overflow: "hidden",
  },

  progressFill: {
    height: "100%",
    borderRadius: 999,
  },

  activityList: {
    gap: 14,
  },

  activityItem: {
    flexDirection: "row",
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF3FA",
  },

  activityIconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },

  activityContent: {
    flex: 1,
  },

  activityHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  activityTitle: {
    flex: 1,
    fontSize: 14,
    fontFamily: "PoppinsSemiBold",
    color: "#294880",
  },

  activityTime: {
    fontSize: 12,
    fontFamily: "PoppinsRegular",
    color: "#8A98B3",
  },

  activityDesc: {
    fontSize: 13,
    fontFamily: "PoppinsRegular",
    color: "#5F6F8C",
    lineHeight: 19,
    marginTop: 4,
  },

  activityTag: {
    alignSelf: "flex-start",
    backgroundColor: "#F3F6FB",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 8,
  },

  activityTagText: {
    fontSize: 11,
    fontFamily: "PoppinsMedium",
    color: "#294880",
  },

  adminSummaryList: {
    gap: 12,
    marginBottom: 18,
  },

  adminSummaryItem: {
    height: 48,
    borderRadius: 14,
    backgroundColor: "#F8FAFD",
    borderWidth: 1,
    borderColor: "#E5ECF6",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  adminSummaryLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  adminIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: "#E8EFFB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  adminSummaryLabel: {
    fontSize: 13,
    fontFamily: "PoppinsMedium",
    color: "#30415F",
  },

  adminSummaryValue: {
    fontSize: 16,
    fontFamily: "PoppinsSemiBold",
    color: "#294880",
  },

  primaryButton: {
    height: 46,
    borderRadius: 14,
    backgroundColor: "#294880",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "PoppinsSemiBold",
  },

  aiList: {
    gap: 12,
  },

  aiItem: {
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: "#F8FAFD",
    borderWidth: 1,
    borderColor: "#E5ECF6",
    paddingHorizontal: 13,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  aiLabel: {
    fontSize: 12,
    fontFamily: "PoppinsRegular",
    color: "#6B7A99",
    marginBottom: 3,
  },

  aiValue: {
    fontSize: 14,
    fontFamily: "PoppinsSemiBold",
    color: "#294880",
  },

  statusPill: {
    borderRadius: 999,
    backgroundColor: "#E8EFFB",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  activeStatusPill: {
    backgroundColor: "#D1FAE5",
  },

  statusPillText: {
    fontSize: 11,
    fontFamily: "PoppinsSemiBold",
    color: "#294880",
  },

  activeStatusPillText: {
    color: "#059669",
  },
});