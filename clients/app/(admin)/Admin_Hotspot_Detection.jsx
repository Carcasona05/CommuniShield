import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFonts } from "expo-font";
import Admin_Layout from "../../components/Admin_compo/Admin_Layout";
import apiClient from "../../services/apiClient";
import useAutoRefresh from "../../hooks/useAutoRefresh";
import { getCache, setCache } from "../../services/dataStore";

const isOpenReport = (report) =>
  !["Rejected", "Archived"].includes(report.status);

export default function Admin_Hotspot_Detection() {
  const [reports, setReports] = useState(() => {
    const cached = getCache("api:/admin/dashboard");
    return Array.isArray(cached?.reports) ? cached.reports : [];
  });
  const [loading, setLoading] = useState(
    () => getCache("api:/admin/dashboard") === undefined
  );
  const [fontsLoaded] = useFonts({
    PoppinsRegular: require("../../assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("../../assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("../../assets/fonts/Poppins-SemiBold.ttf"),
  });

  const loadHotspots = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;
      const response = await apiClient.get("/admin/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = response.data ?? {};
      setCache("api:/admin/dashboard", data);
      setReports(Array.isArray(data.reports) ? data.reports : []);
    } catch {
      // Keep the last loaded incident set available when refresh fails.
    } finally {
      setLoading(false);
    }
  }, []);

  useAutoRefresh(loadHotspots, 60000);

  if (!fontsLoaded) return null;

  const highRiskReports = reports.filter(
    (report) =>
      isOpenReport(report) &&
      ["High", "Critical"].includes(report.severity || "Medium")
  );
  const hotspots = Object.values(
    highRiskReports.reduce((groups, report) => {
      const location = report.barangay || report.location || "Location not specified";
      const group = groups[location] || {
        location,
        count: 0,
        critical: 0,
        reportTypes: new Set(),
      };
      group.count += 1;
      if (report.severity === "Critical") group.critical += 1;
      if (report.incident_type) group.reportTypes.add(report.incident_type);
      groups[location] = group;
      return groups;
    }, {})
  ).sort((left, right) => right.count - left.count);

  return (
    <Admin_Layout>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.heading}>
          <Text style={styles.title}>Hotspot Detection</Text>
          <Text style={styles.subtitle}>Open high-severity incidents grouped by reported location</Text>
        </View>

        <View style={styles.metrics}>
          <View style={styles.metric}>
            <Ionicons name="warning-outline" size={22} color="#B33A36" />
            <Text style={styles.metricValue}>{highRiskReports.length}</Text>
            <Text style={styles.metricLabel}>High-risk reports</Text>
          </View>
          <View style={styles.metric}>
            <Ionicons name="location-outline" size={22} color="#294880" />
            <Text style={styles.metricValue}>{hotspots.length}</Text>
            <Text style={styles.metricLabel}>Affected locations</Text>
          </View>
          <View style={styles.metric}>
            <Ionicons name="flame-outline" size={22} color="#B33A36" />
            <Text style={styles.metricValue}>
              {highRiskReports.filter((report) => report.severity === "Critical").length}
            </Text>
            <Text style={styles.metricLabel}>Critical incidents</Text>
          </View>
        </View>

        <View style={styles.list}>
          <View style={styles.listHeading}>
            <Text style={styles.listTitle}>Highest concentration</Text>
            <Text style={styles.count}>{loading ? "Updating" : `${hotspots.length} locations`}</Text>
          </View>
          {hotspots.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="checkmark-circle-outline" size={28} color="#25845C" />
              <Text style={styles.emptyText}>
                {loading ? "Loading incident data..." : "No open high-severity incidents found."}
              </Text>
            </View>
          ) : hotspots.map((item, index) => (
            <View key={item.location} style={styles.row}>
              <View style={styles.rank}><Text style={styles.rankText}>{index + 1}</Text></View>
              <View style={styles.rowBody}>
                <Text style={styles.location}>{item.location}</Text>
                <Text style={styles.types} numberOfLines={2}>
                  {[...item.reportTypes].join(", ") || "Incident types unavailable"}
                </Text>
              </View>
              <View style={styles.rowCounts}>
                <Text style={styles.reportCount}>{item.count}</Text>
                <Text style={styles.criticalCount}>{item.critical} critical</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </Admin_Layout>
  );
}

const styles = StyleSheet.create({
  page: { padding: 24, paddingBottom: 36, gap: 18 },
  heading: { gap: 3 },
  title: { color: "#19263B", fontFamily: "PoppinsSemiBold", fontSize: 23 },
  subtitle: { color: "#63728A", fontFamily: "PoppinsRegular", fontSize: 13 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  metric: { flex: 1, minWidth: 150, minHeight: 112, justifyContent: "center", gap: 3, padding: 16, borderWidth: 1, borderColor: "#DCE3ED", borderRadius: 6, backgroundColor: "#FFFFFF" },
  metricValue: { color: "#1E2D43", fontFamily: "PoppinsSemiBold", fontSize: 23 },
  metricLabel: { color: "#69778D", fontFamily: "PoppinsRegular", fontSize: 12 },
  list: { paddingHorizontal: 18, borderWidth: 1, borderColor: "#DCE3ED", borderRadius: 6, backgroundColor: "#FFFFFF" },
  listHeading: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#E5EAF1" },
  listTitle: { color: "#1F2E43", fontFamily: "PoppinsSemiBold", fontSize: 15 },
  count: { color: "#68768B", fontFamily: "PoppinsRegular", fontSize: 11 },
  row: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#E8EDF3" },
  rank: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: "#EFF3F8" },
  rankText: { color: "#42526A", fontFamily: "PoppinsSemiBold", fontSize: 12 },
  rowBody: { flex: 1, gap: 2 },
  location: { color: "#25354C", fontFamily: "PoppinsMedium", fontSize: 14 },
  types: { color: "#738096", fontFamily: "PoppinsRegular", fontSize: 11 },
  rowCounts: { minWidth: 70, alignItems: "flex-end" },
  reportCount: { color: "#B33A36", fontFamily: "PoppinsSemiBold", fontSize: 19 },
  criticalCount: { color: "#69778D", fontFamily: "PoppinsRegular", fontSize: 10 },
  empty: { minHeight: 130, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  emptyText: { color: "#65738A", fontFamily: "PoppinsRegular", fontSize: 13 },
});
