import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFonts } from "expo-font";
import Admin_Layout from "../../components/Admin_compo/Admin_Layout";
import Admin_AddReportModal from "../../components/Admin_compo/Admin_AddReportModal";
import Admin_AddAnnouncementModal from "../../components/Admin_compo/Admin_AddAnnouncementModal";
import Admin_AddBlotterModal from "../../components/Admin_compo/Admin_AddBlotterModal";
import {
  BatchDateRangeDropdown,
  BatchFilterDropdown,
} from "../../components/Admin_compo/AdminBatchFilters";
import ToastProvider, { useToast } from "../../components/Toast";
import apiClient from "../../services/apiClient";
import { uploadImage } from "../../services/imageUpload";
import useAutoRefresh from "../../hooks/useAutoRefresh";

const FILTER_STATUSES = ["All", "Pending Review", "Under Verification", "Resolved", "Rejected", "Marked Fake"];
const REPORT_TYPES = ["All", "Incident", "Announcement", "Blotter"];
const POST_BY_OPTIONS = ["All", "Admin", "Super Admin"];

const csvValue = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
};

export default function Admin_ReportManagementWrapper() {
  return (
    <ToastProvider>
      <Admin_ReportManagement />
    </ToastProvider>
  );
}

function Admin_ReportManagement() {
  const { error: showError, success: showSuccess } = useToast();
  const [reports, setReports] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("All");
  const [reportType, setReportType] = useState("All");
  const [postBy, setPostBy] = useState("All");
  const [addReportVisible, setAddReportVisible] = useState(false);
  const [addAnnouncementVisible, setAddAnnouncementVisible] = useState(false);
  const [addBlotterVisible, setAddBlotterVisible] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewRecord, setPreviewRecord] = useState(null);
  const initialLoadRef = useRef(true);

  const [fontsLoaded] = useFonts({
    PoppinsRegular: require("../../assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("../../assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("../../assets/fonts/Poppins-SemiBold.ttf"),
  });

  const loadRecords = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };
      const params = {
        source: "Admin",
        from: from.trim() || undefined,
        to: to.trim() || undefined,
        status: status === "All" ? undefined : status,
      };
      const [reportResponse, announcementResponse, logResponse] = await Promise.all([
        apiClient.get("/admin/dashboard", { headers, params }),
        apiClient.get("/admin/announcements", { headers, params }),
        apiClient.get("/admin/logs", {
          headers,
          params: { from: params.from, to: params.to },
        }),
      ]);
      setReports(Array.isArray(reportResponse.data?.reports) ? reportResponse.data.reports : []);
      setAnnouncements(Array.isArray(announcementResponse.data?.announcements) ? announcementResponse.data.announcements : []);
      setLogs(Array.isArray(logResponse.data?.logs) ? logResponse.data.logs : []);
    } catch (error) {
      showError(error?.response?.data?.error || "Could not load admin records.");
    } finally {
      setLoading(false);
    }
  }, [from, status, to, showError]);

  useEffect(() => {
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      return;
    }
    loadRecords();
  }, [loadRecords]);
  useAutoRefresh(loadRecords, 60000);

  const activityRecords = useMemo(() => {
    return (status === "All" ? logs : []).map((item) => ({
        id: `activity-${item.id}`,
        kind: "Activity",
        title: item.title || item.actionType || "Admin activity",
        location: "",
        status: item.actionType || "Recorded",
        severity: "",
        created_at: item.dateTime,
        details: item.details,
        actor: item.actor,
        actorRole: item.actorRole || "system",
    }));
  }, [logs, status]);

  const visibleRecords = useMemo(() => [
    ...reports.map((item) => ({
      id: item.id,
      kind: [item.reportType, item.report_type, item.kind].includes("Blotter") ? "Blotter" : "Incident",
      title: `${item.incident_type || "Incident"}${item.location ? ` in ${item.location}` : ""}`,
      location: item.location || "",
      status: item.status || "Pending Review",
      severity: item.severity || "Medium",
      created_at: item.created_at,
      details: item.details || "",
      actor: item.reporter_name || "Admin",
      actorRole: String(item.actorRole || item.role || item.source || "admin").toLowerCase(),
    })),
    ...(status === "All"
      ? announcements.map((item) => ({
          id: `announcement-${item.id}`,
          kind: "Announcement",
          title: item.title || item.type || "Announcement",
          location: item.location || "",
          status: "Published",
          severity: "",
          created_at: item.created_at,
          details: item.details || "",
          actor: "Admin",
          actorRole: String(item.actorRole || item.role || "admin").toLowerCase(),
        }))
      : []),
    ...activityRecords,
  ].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()), [activityRecords, announcements, reports, status]);

  const filteredRecords = useMemo(() => {
    const start = from ? new Date(`${from}T00:00:00`) : null;
    const end = to ? new Date(`${to}T23:59:59.999`) : null;

    return visibleRecords.filter((record) => {
      const recordDate = new Date(record.created_at);
      const role = String(record.actorRole || "").toLowerCase();
      const matchesPostBy =
        postBy === "All" ||
        (postBy === "Admin" && role === "admin") ||
        (postBy === "Super Admin" && role === "super_admin");
      const matchesType = reportType === "All" || record.kind === reportType;
      const matchesStatus = status === "All" || record.status === status;
      const matchesDate =
        (!start || (Number.isFinite(recordDate.getTime()) && recordDate >= start)) &&
        (!end || (Number.isFinite(recordDate.getTime()) && recordDate <= end));

      return matchesPostBy && matchesType && matchesStatus && matchesDate;
    });
  }, [from, postBy, reportType, status, to, visibleRecords]);

  const openRecordPreview = (record, successMessage) => {
    setPreviewRecord(record);
    setPreviewVisible(true);
    showSuccess(successMessage);
  };

  const handleAddReport = async (payload) => {
    const record = {
      id: payload?.id || `incident-${Date.now()}`,
      kind: "Incident",
      reportType: "Incident",
      title: payload?.incident_type
        ? `${payload.incident_type}${payload.location ? ` in ${payload.location}` : ""}`
        : "New incident report",
      location: payload?.location || "",
      status: payload?.status || "Pending Review",
      severity: payload?.severity || "Medium",
      created_at: payload?.created_at || new Date().toISOString(),
      details: payload?.details || "",
      actor: payload?.poster_name || "Admin",
      actorRole: "admin",
      ...payload,
    };

    try {
      setAddReportVisible(false);
      openRecordPreview(record, "Incident saved successfully.");
      loadRecords();
      return record;
    } catch (error) {
      throw new Error(error?.message || "Could not save the incident.");
    }
  };

  const handleAddAnnouncement = async (announcement) => {
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) throw new Error("Please sign in before posting an announcement.");
      let picUrl = null;
      if (announcement.image?.uri) picUrl = await uploadImage(announcement.image.uri);
      await apiClient.post("/admin/announcements", {
        type: announcement.type,
        title: announcement.title,
        location: announcement.location,
        details: announcement.details,
        pic_url: picUrl,
      }, { headers: { Authorization: `Bearer ${token}` } });
      const record = {
        id: announcement.id || `announcement-${Date.now()}`,
        kind: "Announcement",
        reportType: "Announcement",
        title: announcement.title,
        location: announcement.location,
        status: "Published",
        severity: "",
        created_at: announcement.createdAt || new Date().toISOString(),
        details: announcement.details,
        actor: "Admin",
        actorRole: "admin",
        ...announcement,
      };
      setAddAnnouncementVisible(false);
      openRecordPreview(record, "Announcement published successfully.");
      loadRecords();
    } catch (error) {
      throw new Error(error?.response?.data?.error || error?.message || "Could not publish the announcement.");
    }
  };

  const handleAddBlotter = async (blotter) => {
    try {
      const record = {
        id: blotter.id || `blotter-${Date.now()}`,
        kind: "Blotter",
        reportType: "Blotter",
        title: blotter.title || `${blotter.incidentType || "Blotter report"} • ${blotter.location || "Location unspecified"}`,
        location: blotter.location || "",
        barangay: blotter.barangay || "",
        status: blotter.status || "Pending Review",
        severity: blotter.severity || "Medium",
        created_at: blotter.created_at || new Date().toISOString(),
        details: blotter.details || blotter.incidentDescription || "",
        actor: blotter.reportedBy || "Admin",
        actorRole: "admin",
        ...blotter,
      };
      setAddBlotterVisible(false);
      openRecordPreview(record, "Blotter report saved successfully.");
      loadRecords();
      return record;
    } catch (error) {
      throw new Error(error?.message || "Could not save the blotter report.");
    }
  };

  const exportCsv = async () => {
    const columns = ["Record type", "Title", "Location", "Status / action", "Severity", "Date", "Actor", "Details"];
    const rows = filteredRecords.map((record) => [
      record.kind,
      record.title,
      record.location,
      record.status,
      record.severity,
      record.created_at,
      record.actor,
      record.details,
    ]);
    const content = [columns, ...rows].map((row) => row.map(csvValue).join(",")).join("\r\n");

    if (Platform.OS === "web") {
      const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "communishield-admin-records.csv";
      link.click();
      URL.revokeObjectURL(url);
      return;
    }

    await Share.share({ title: "CommuniShield admin records CSV", message: content });
  };

  const handlePrintPreview = () => {
    if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.print === "function") {
      window.print();
      return;
    }
    showError("Print/export is available from the web version of the app.");
  };

  if (!fontsLoaded) return null;

  const recordMetrics = [
    {
      title: "Reports",
      value: filteredRecords.filter((record) => ["Incident", "Blotter"].includes(record.kind)).length,
      icon: "document-text-outline",
      color: "#294880",
      background: "#EAF2FF",
    },
    {
      title: "Announcements",
      value: filteredRecords.filter((record) => record.kind === "Announcement").length,
      icon: "megaphone-outline",
      color: "#25845C",
      background: "#EAF8F1",
    },
    {
      title: "Admin Activities",
      value: filteredRecords.filter((record) => record.kind === "Activity").length,
      icon: "list-outline",
      color: "#B96A18",
      background: "#FFF4E5",
    },
  ];

  return (
    <Admin_Layout>
      <View style={styles.wrapper}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.statsRow}>
            {recordMetrics.map((metric) => (
              <View key={metric.title} style={styles.statCard}>
                <View style={[styles.statIcon, { backgroundColor: metric.background }]}>
                  <Ionicons name={metric.icon} size={23} color={metric.color} />
                </View>
                <View style={styles.statTextBox}>
                  <Text style={styles.statValue}>{metric.value}</Text>
                  <Text style={styles.statTitle}>{metric.title}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.filterCard}>
            <View style={styles.filterTopRow}>
              <View style={styles.filterHeaderTitleBox}>
                <View style={styles.filterMainIconBox}>
                  <Ionicons name="options-outline" size={20} color="#294880" />
                </View>
                <View style={styles.filterTitleText}>
                  <Text style={styles.filterMainTitle}>Filter Admin Records</Text>
                  <Text style={styles.filterMainSubtitle}>
                    Filter and export database records
                  </Text>
                </View>
              </View>
              <TouchableOpacity style={styles.exportButton} onPress={exportCsv} activeOpacity={0.85}>
                <Ionicons name="download-outline" size={18} color="#FFFFFF" />
                <Text style={styles.buttonText}>Export CSV</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.actions}>
              <TouchableOpacity style={styles.primaryButton} onPress={() => setAddReportVisible(true)} activeOpacity={0.85}>
                <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
                <Text style={styles.buttonText}>Add Incident</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setAddAnnouncementVisible(true)} activeOpacity={0.85}>
                <Ionicons name="megaphone-outline" size={18} color="#294880" />
                <Text style={styles.secondaryButtonText}>Add Announcement</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setAddBlotterVisible(true)} activeOpacity={0.85}>
                <Ionicons name="document-text-outline" size={18} color="#294880" />
                <Text style={styles.secondaryButtonText}>Add Blotter Report</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.batchFilterRow}
            >
              <BatchFilterDropdown
                label="Post by"
                value={postBy}
                options={POST_BY_OPTIONS}
                onChange={setPostBy}
                width={180}
              />
              <BatchFilterDropdown
                label="Type of Report"
                value={reportType}
                options={REPORT_TYPES}
                onChange={setReportType}
                width={200}
              />
              <BatchFilterDropdown
                label="Status"
                value={status}
                options={FILTER_STATUSES}
                onChange={setStatus}
                width={210}
                chips
              />
              <BatchDateRangeDropdown
                from={from}
                to={to}
                onChangeFrom={setFrom}
                onChangeTo={setTo}
                width={250}
              />
            </ScrollView>
          </View>

          <View style={styles.recordsCard}>
            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>Admin-Created Records</Text>
              <Text style={styles.count}>{filteredRecords.length} records</Text>
            </View>
            {loading ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>Loading records...</Text>
              </View>
            ) : filteredRecords.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="document-text-outline" size={40} color="#5D6F92" />
                <Text style={styles.emptyTitle}>No records found</Text>
                <Text style={styles.emptyText}>Try changing the selected filters.</Text>
              </View>
            ) : filteredRecords.map((record, index) => {
              const icon = ["Incident", "Blotter"].includes(record.kind)
                ? "document-text-outline"
                : record.kind === "Announcement"
                  ? "megaphone-outline"
                  : "list-outline";
              const tone = record.kind === "Activity" ? "#B96A18" : "#294880";
              const iconBackground = record.kind === "Activity" ? "#FFF4E5" : "#EAF2FF";
              return (
                <View key={record.id} style={[styles.recordRow, index > 0 && styles.recordRowBorder]}>
                  <View style={[styles.recordIcon, { backgroundColor: iconBackground }]}>
                    <Ionicons name={icon} size={23} color={tone} />
                  </View>
                  <View style={styles.recordBody}>
                    <View style={styles.recordTopRow}>
                      <View style={styles.recordTitleBox}>
                        <Text style={styles.recordTitle}>{record.title}</Text>
                        <Text style={styles.recordMeta}>{record.kind} · {formatDate(record.created_at)}</Text>
                      </View>
                      <View style={styles.statusBadge}>
                        <Text style={styles.statusBadgeText}>{record.status}</Text>
                      </View>
                    </View>
                    <View style={styles.recordInfoRow}>
                      {!!record.location && <Text style={styles.recordMeta}>{record.location}</Text>}
                      {!!record.severity && <Text style={styles.severityBadge}>{record.severity}</Text>}
                      {!!record.actor && <Text style={styles.recordMeta}>{record.actor}</Text>}
                    </View>
                    {!!record.details && <Text style={styles.recordDetails} numberOfLines={2}>{record.details}</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>
      <Admin_AddReportModal
        visible={addReportVisible}
        onClose={() => setAddReportVisible(false)}
        onSubmit={handleAddReport}
      />
      <Admin_AddAnnouncementModal
        visible={addAnnouncementVisible}
        onClose={() => setAddAnnouncementVisible(false)}
        onSubmit={handleAddAnnouncement}
      />
      <Admin_AddBlotterModal
        visible={addBlotterVisible}
        onClose={() => setAddBlotterVisible(false)}
        onSubmit={handleAddBlotter}
      />

      {previewVisible && previewRecord ? (
        <>
          <View style={styles.previewOverlay} />
          <View style={styles.previewModalOuter}>
            <View style={styles.previewModal}>
              <View style={styles.previewHeader}>
                <Text style={styles.previewTitle}>Posted Record</Text>
                <TouchableOpacity onPress={() => setPreviewVisible(false)} hitSlop={10}>
                  <Ionicons name="close" size={24} color="#4B5D7A" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.previewScroll} showsVerticalScrollIndicator={false}>
                <View style={styles.previewSection}>
                  <Text style={styles.previewSectionTitle}>System Details</Text>
                  <View style={styles.previewPair}><Text style={styles.previewLabel}>Record Type</Text><Text style={styles.previewValue}>{previewRecord.kind}</Text></View>
                  <View style={styles.previewPair}><Text style={styles.previewLabel}>Blotter No.</Text><Text style={styles.previewValue}>{previewRecord.blotterNo || previewRecord.id || "—"}</Text></View>
                  <View style={styles.previewPair}><Text style={styles.previewLabel}>Date/Time Reported</Text><Text style={styles.previewValue}>{previewRecord.dateReported || formatDate(previewRecord.created_at) || "—"}</Text></View>
                  <View style={styles.previewPair}><Text style={styles.previewLabel}>Barangay</Text><Text style={styles.previewValue}>{previewRecord.barangay || "—"}</Text></View>
                </View>

                <View style={styles.previewSection}>
                  <Text style={styles.previewSectionTitle}>Incident Info</Text>
                  <View style={styles.previewPair}><Text style={styles.previewLabel}>Location</Text><Text style={styles.previewValue}>{previewRecord.location || "—"}</Text></View>
                  <View style={styles.previewPair}><Text style={styles.previewLabel}>Type of Incident</Text><Text style={styles.previewValue}>{previewRecord.incidentType || previewRecord.incident_type || "—"}</Text></View>
                  <View style={styles.previewPair}><Text style={styles.previewLabel}>Date & Time of Incident</Text><Text style={styles.previewValue}>{previewRecord.incidentDateTime || "—"}</Text></View>
                </View>

                <View style={styles.previewSection}>
                  <Text style={styles.previewSectionTitle}>Parties Involved</Text>
                  <View style={styles.previewPair}><Text style={styles.previewLabel}>Complainant Name</Text><Text style={styles.previewValue}>{previewRecord.complainantName || previewRecord.poster_name || "—"}</Text></View>
                  <View style={styles.previewPair}><Text style={styles.previewLabel}>Age</Text><Text style={styles.previewValue}>{previewRecord.complainantAge || "—"}</Text></View>
                  <View style={styles.previewPair}><Text style={styles.previewLabel}>Contact No.</Text><Text style={styles.previewValue}>{previewRecord.complainantContact || "—"}</Text></View>
                  <View style={styles.previewPair}><Text style={styles.previewLabel}>Respondent</Text><Text style={styles.previewValue}>{previewRecord.respondent || "—"}</Text></View>
                </View>

                <View style={styles.previewSection}>
                  <Text style={styles.previewSectionTitle}>Narrative & Actions</Text>
                  <View style={styles.previewPair}><Text style={styles.previewLabel}>Incident Description</Text><Text style={styles.previewValue}>{previewRecord.details || previewRecord.incidentDescription || "—"}</Text></View>
                  <View style={styles.previewPair}><Text style={styles.previewLabel}>Action Taken</Text><Text style={styles.previewValue}>{previewRecord.actionTaken || "—"}</Text></View>
                </View>

                <View style={styles.previewSection}>
                  <Text style={styles.previewSectionTitle}>Administrative Tracking</Text>
                  <View style={styles.previewPair}><Text style={styles.previewLabel}>Status</Text><Text style={styles.previewValue}>{previewRecord.status || "—"}</Text></View>
                  <View style={styles.previewPair}><Text style={styles.previewLabel}>Reported By</Text><Text style={styles.previewValue}>{previewRecord.reportedBy || previewRecord.actor || "—"}</Text></View>
                  <View style={styles.previewPair}><Text style={styles.previewLabel}>Blotter Officer</Text><Text style={styles.previewValue}>{previewRecord.blotterOfficer || "—"}</Text></View>
                  <View style={styles.previewPair}><Text style={styles.previewLabel}>Date Recorded</Text><Text style={styles.previewValue}>{previewRecord.dateRecorded || formatDate(previewRecord.created_at) || "—"}</Text></View>
                </View>
              </ScrollView>

              <View style={styles.previewFooter}>
                <TouchableOpacity style={styles.previewPrimaryButton} onPress={handlePrintPreview} activeOpacity={0.85}>
                  <Ionicons name="print-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.previewPrimaryButtonText}>Print / Export PDF</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.previewSecondaryButton} onPress={() => setPreviewVisible(false)} activeOpacity={0.85}>
                  <Text style={styles.previewSecondaryButtonText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </>
      ) : null}
    </Admin_Layout>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: "#F5F8FC" },
  container: { flex: 1, backgroundColor: "#F5F8FC" },
  scrollContent: { padding: 22, paddingBottom: 36 },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 18 },
  statCard: { flex: 1, minWidth: 190, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D9E2F0", borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center" },
  statIcon: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", marginRight: 10 },
  statTextBox: { flex: 1, minWidth: 0 },
  statValue: { fontSize: 22, fontFamily: "PoppinsSemiBold", color: "#2F4267" },
  statTitle: { fontSize: 12, color: "#5D6F92", marginTop: 3, fontFamily: "PoppinsMedium" },
  filterCard: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D9E2F0", borderRadius: 16, padding: 18, marginBottom: 18 },
  filterTopRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14, marginBottom: 16 },
  filterHeaderTitleBox: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 240 },
  filterMainIconBox: { width: 42, height: 42, borderRadius: 13, backgroundColor: "#EAF2FF", alignItems: "center", justifyContent: "center" },
  filterTitleText: { flex: 1 },
  filterMainTitle: { fontSize: 16, fontFamily: "PoppinsSemiBold", color: "#294880" },
  filterMainSubtitle: { fontSize: 13, fontFamily: "PoppinsRegular", color: "#5D6F92", marginTop: 2 },
  exportButton: { minHeight: 42, paddingHorizontal: 16, borderRadius: 12, backgroundColor: "#25845C", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  primaryButton: { minHeight: 42, paddingHorizontal: 16, borderRadius: 12, backgroundColor: "#294880", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  secondaryButton: { minHeight: 42, paddingHorizontal: 16, borderRadius: 12, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D9E2F0", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  buttonText: { fontSize: 13, fontFamily: "PoppinsSemiBold", color: "#FFFFFF" },
  secondaryButtonText: { fontSize: 13, fontFamily: "PoppinsSemiBold", color: "#294880" },
  previewOverlay: { position: "absolute", inset: 0, backgroundColor: "rgba(15, 30, 55, 0.25)", zIndex: 20 },
  previewModalOuter: { position: "absolute", inset: 0, justifyContent: "center", alignItems: "center", zIndex: 21, padding: 20 },
  previewModal: { width: "100%", maxWidth: 760, maxHeight: "85%", backgroundColor: "#FFFFFF", borderRadius: 18, borderWidth: 1, borderColor: "#D9E2F0", overflow: "hidden" },
  previewModalHidden: { opacity: 0, pointerEvents: "none" },
  previewHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#E7ECF3", backgroundColor: "#F7F9FD" },
  previewTitle: { fontSize: 18, fontFamily: "PoppinsSemiBold", color: "#294880" },
  previewScroll: { maxHeight: 560, paddingHorizontal: 18, paddingVertical: 16 },
  previewSection: { marginBottom: 14, backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E7ECF3", borderRadius: 12, padding: 14 },
  previewSectionTitle: { fontSize: 13, fontFamily: "PoppinsSemiBold", color: "#294880", marginBottom: 10 },
  previewPair: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8 },
  previewLabel: { flex: 1, fontSize: 12, color: "#5D6F92", fontFamily: "PoppinsMedium" },
  previewValue: { flex: 1.25, fontSize: 12, color: "#1F2A37", fontFamily: "PoppinsRegular", textAlign: "right" },
  previewFooter: { flexDirection: "row", justifyContent: "flex-end", gap: 10, paddingHorizontal: 18, paddingVertical: 14, borderTopWidth: 1, borderTopColor: "#E7ECF3", backgroundColor: "#F7F9FD" },
  previewPrimaryButton: { minHeight: 42, paddingHorizontal: 16, borderRadius: 10, backgroundColor: "#294880", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  previewPrimaryButtonText: { color: "#FFFFFF", fontFamily: "PoppinsSemiBold", fontSize: 13 },
  previewSecondaryButton: { minHeight: 42, paddingHorizontal: 16, borderRadius: 10, backgroundColor: "#EEF2F8", alignItems: "center", justifyContent: "center" },
  previewSecondaryButtonText: { color: "#294880", fontFamily: "PoppinsSemiBold", fontSize: 13 },
  batchFilterRow: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingBottom: 2 },
  criteriaInput: { flexGrow: 1, minWidth: 145, height: 42, borderWidth: 1, borderColor: "#D9E2F0", borderRadius: 8, backgroundColor: "#FFFFFF", paddingHorizontal: 12, color: "#2F4267", fontFamily: "PoppinsRegular", fontSize: 13 },
  searchInput: { flexGrow: 2, minWidth: 220 },
  filterBody: { flexDirection: "row", flexWrap: "wrap", gap: 18 },
  filterColumn: { flex: 1, minWidth: 300, backgroundColor: "#F7F9FD", borderWidth: 1, borderColor: "#E4EAF3", borderRadius: 14, padding: 14 },
  filterHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 },
  filterTitleBox: { flexDirection: "row", alignItems: "center", gap: 7 },
  filterTitle: { fontSize: 14, fontFamily: "PoppinsSemiBold", color: "#294880" },
  filterSelectedText: { fontSize: 12, fontFamily: "PoppinsMedium", color: "#7A8BA8" },
  pills: { gap: 10, paddingRight: 4 },
  filterPill: { minHeight: 38, paddingHorizontal: 15, borderRadius: 999, borderWidth: 1, borderColor: "#D9E2F0", backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  activeFilterPill: { backgroundColor: "#294880", borderColor: "#294880" },
  filterPillText: { fontSize: 13, fontFamily: "PoppinsMedium", color: "#294880" },
  activeFilterPillText: { color: "#FFFFFF" },
  recordsCard: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D9E2F0", borderRadius: 16, overflow: "hidden" },
  listHeader: { minHeight: 82, paddingHorizontal: 22, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: "#D9E2F0", backgroundColor: "#F7F9FD", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 },
  listTitle: { fontSize: 21, fontFamily: "PoppinsSemiBold", color: "#294880" },
  count: { fontSize: 15, fontFamily: "PoppinsMedium", color: "#294880" },
  recordRow: { paddingHorizontal: 22, paddingVertical: 20, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "flex-start", gap: 16 },
  recordRowBorder: { borderTopWidth: 1, borderTopColor: "#E4EAF3" },
  recordIcon: { width: 52, height: 52, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  recordBody: { flex: 1, minWidth: 0 },
  recordTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10 },
  recordTitleBox: { flex: 1, minWidth: 0 },
  recordTitle: { fontSize: 17, fontFamily: "PoppinsMedium", color: "#111827", lineHeight: 23, marginBottom: 4 },
  recordMeta: { fontSize: 12, color: "#5D6F92", lineHeight: 18, fontFamily: "PoppinsRegular" },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: "#EAF2FF" },
  statusBadgeText: { fontSize: 11, fontFamily: "PoppinsMedium", color: "#294880" },
  recordInfoRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 4 },
  severityBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: "#FFF4E5", color: "#B96A18", fontSize: 11, fontFamily: "PoppinsMedium" },
  recordDetails: { color: "#43536A", fontFamily: "PoppinsRegular", fontSize: 13, lineHeight: 19, marginTop: 4 },
  emptyState: { minHeight: 150, alignItems: "center", justifyContent: "center", gap: 8, padding: 28 },
  emptyTitle: { fontSize: 18, fontFamily: "PoppinsMedium", color: "#2F4267" },
  emptyText: { fontSize: 14, color: "#5D6F92", fontFamily: "PoppinsRegular", textAlign: "center" },
});
