import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFonts } from "expo-font";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import Admin_Layout from "../../components/Admin_compo/Admin_Layout";
import Admin_AddReportModal from "../../components/Admin_compo/Admin_AddReportModal";
import Admin_AddAnnouncementModal from "../../components/Admin_compo/Admin_AddAnnouncementModal";
import Admin_AddBlotterModal from "../../components/Admin_compo/Admin_AddBlotterModal";
import {
  BatchDateRangeDropdown,
  BatchFilterDropdown,
} from "../../components/Admin_compo/AdminBatchFilters";
import ToastProvider, { useToast } from "../../components/Toast";
import ConfirmModal from "../../components/modals/ConfirmModal";
import apiClient from "../../services/apiClient";
import { getCache, getCachedPage } from "../../services/dataStore";
import { uploadImage } from "../../services/imageUpload";
import useAutoRefresh from "../../hooks/useAutoRefresh";
import useSmoothScrollToTop from "../../hooks/useSmoothScrollToTop";

const FILTER_STATUSES = ["All", "Pending Review", "Under Verification", "Resolved", "Rejected", "Marked Fake"];
const REPORT_TYPES = ["All", "Incident", "Announcement", "Blotter"];
const POST_BY_OPTIONS = ["All", "Admin", "Super Admin"];
const PAGE_SIZE = 10;

const csvValue = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
};

const documentValue = (value) => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ") || "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const escapeHtml = (value) => documentValue(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const getRecordDocumentSections = (record) => {
  if (record.kind === "Announcement") {
    return [
      {
        title: "Publication Details",
        fields: [
          ["Record ID", record.id],
          ["Record Type", record.kind],
          ["Published", formatDate(record.created_at)],
          ["Status", record.status],
          ["Published By", record.actor || record.reportedBy],
          ["Location", record.location],
        ],
      },
      { title: "Announcement", fields: [["Details", record.details]] },
    ];
  }

  if (record.kind === "Incident") {
    return [
      {
        title: "Report Information",
        fields: [
          ["Report ID", record.id],
          ["Date/Time Reported", formatDate(record.created_at)],
          ["Reported By", record.poster_name || record.reporter_name || record.actor],
          ["Status", record.status],
          ["Severity", record.severity],
        ],
      },
      {
        title: "Incident Details",
        fields: [
          ["Incident Category", record.incident_category || record.incidentCategory],
          ["Type of Incident", record.incident_type || record.incidentType],
          ["Location", record.location],
          ["Description", record.details],
        ],
      },
    ].map((section) => ({
      ...section,
      fields: section.fields.filter(([, value]) => value !== null && value !== undefined && value !== ""),
    }));
  }

  if (record.kind === "Activity") {
    return [
      {
        title: "Activity Record",
        fields: [
          ["Record ID", record.id],
          ["Action", record.title || record.status],
          ["Date and Time", formatDate(record.created_at)],
          ["Actor", record.actor],
          ["Actor Role", record.actorRole],
          ["Details", record.details],
        ],
      },
    ];
  }

  return [
    {
      title: "Report Identification",
      fields: [
        ["Report ID", record.id],
        ["Record Type", record.kind],
        ["Date/Time Reported", record.dateReported || formatDate(record.created_at)],
        ["Status", record.status],
        ["Severity", record.severity],
        ["Source", record.source || record.actorRole],
      ].filter(([label]) => !(record.kind === "Blotter" && label === "Status")),
    },
    {
      title: "Incident Information",
      fields: [
        ["Incident Category", record.incident_category || record.incidentCategory],
        ["Type of Incident", record.incident_type || record.incidentType],
        ["Location", record.location],
        ["Barangay", record.barangay],
        ["Date/Time of Incident", record.incidentDateTime || record.incident_datetime || record.incident_date],
        ["Coordinates", record.latitude && record.longitude ? `${record.latitude}, ${record.longitude}` : ""],
      ],
    },
    {
      title: "People Involved",
      fields: [
        ["Reported By", record.reportedBy || record.poster_name || record.actor],
        ["Complainant Name", record.complainantName],
        ["Complainant Age", record.complainantAge],
        ["Contact Number", record.complainantContact || record.contact_number],
        ["Respondent", record.respondent],
        ["Blotter Officer", record.blotterOfficer],
      ],
    },
    {
      title: "Narrative and Actions",
      fields: [
        ["Report Details", record.details || record.incidentDescription],
        ["Action Taken", record.actionTaken || record.action_taken],
      ],
    },
  ];
};

const buildRecordDocumentHtml = (record) => {
  const sections = getRecordDocumentSections(record);
  const sectionMarkup = sections.map((section) => `
    <section>
      <h2>${escapeHtml(section.title)}</h2>
      <table><tbody>${section.fields.map(([label, value]) => `
        <tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>
      `).join("")}</tbody></table>
    </section>
  `).join("");
  const images = (record.images || record.photos || [])
    .map((image) => typeof image === "string" ? image : image?.uri || image?.url || image?.image_url)
    .filter(Boolean);
  const imageMarkup = images.length ? `
    <section><h2>Photo Evidence</h2><div class="photos">${images.map((uri, index) => `
      <figure><img src="${escapeHtml(uri)}" alt="Report evidence ${index + 1}" /><figcaption>Evidence ${index + 1}</figcaption></figure>
    `).join("")}</div></section>
  ` : "";

  return `<!doctype html>
    <html><head><meta charset="utf-8" /><title>${escapeHtml(record.title || "Report")}</title>
    <style>
      @page { size: A4; margin: 18mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #1f2937; font: 12px Arial, sans-serif; line-height: 1.5; }
      header { border-bottom: 3px solid #294880; padding-bottom: 14px; margin-bottom: 22px; }
      .brand { color: #294880; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
      h1 { margin: 8px 0 3px; color: #172b4d; font-size: 22px; }
      .subtitle { color: #64748b; font-size: 11px; }
      section { margin: 0 0 20px; break-inside: avoid; }
      h2 { margin: 0 0 8px; padding-bottom: 5px; border-bottom: 1px solid #d9e2f0; color: #294880; font-size: 13px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 7px 9px; border-bottom: 1px solid #e5eaf1; text-align: left; vertical-align: top; white-space: pre-wrap; overflow-wrap: anywhere; }
      th { width: 34%; color: #52627a; font-weight: 600; }
      .photos { display: flex; flex-wrap: wrap; gap: 12px; }
      figure { margin: 0; width: 46%; break-inside: avoid; }
      img { max-width: 100%; max-height: 250px; object-fit: contain; }
      figcaption { color: #64748b; font-size: 10px; }
      footer { margin-top: 26px; padding-top: 8px; border-top: 1px solid #d9e2f0; color: #64748b; font-size: 9px; }
    </style></head><body>
      <header><div class="brand">CommuniShield · Argao, Cebu</div>
        <h1>${escapeHtml(record.title || `${record.kind || "Admin"} Record`)}</h1>
        <div class="subtitle">Official ${escapeHtml(record.kind || "Admin")} Record · Generated ${escapeHtml(new Date().toLocaleString())}</div>
      </header>
      ${sectionMarkup}${imageMarkup}
      <footer>Confidential administrative record. Handle and share in accordance with local records policies.</footer>
    </body></html>`;
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
  const scrollRef = useRef(null);
  const { scrollToTop, trackScroll, stopScrollAnimation } = useSmoothScrollToTop(scrollRef);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const showScrollTopRef = useRef(false);
  const [reports, setReports] = useState(() => (getCachedPage("/admin/dashboard", { source: "Admin" })?.reports || [])
    .filter((item) => item.status !== "Archived"));
  const [blotters, setBlotters] = useState(() => getCache("api:/admin/blotters")?.blotters || []);
  const [announcements, setAnnouncements] = useState(() => getCachedPage("/admin/announcements", { source: "Admin" })?.announcements || []);
  const [logs, setLogs] = useState(() => getCache("api:/admin/logs")?.logs || []);
  const [loading, setLoading] = useState(() => !getCachedPage("/admin/dashboard", { source: "Admin" }) ||
    !getCachedPage("/admin/announcements", { source: "Admin" }) || !getCache("api:/admin/logs"));
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
  const [archiving, setArchiving] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const deleteTargetRef = useRef(null);
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
      // Archived reports only ever appear under Logs > Archived reports.
      setReports(
        (Array.isArray(reportResponse.data?.reports)
          ? reportResponse.data.reports
          : []
        ).filter((item) => String(item.status || "").trim().toLowerCase() !== "archived")
      );
      setAnnouncements(Array.isArray(announcementResponse.data?.announcements) ? announcementResponse.data.announcements : []);
      setLogs(Array.isArray(logResponse.data?.logs) ? logResponse.data.logs : []);

      // Blotters are an additional admin-only source. A failure to load them
      // should not prevent the rest of Record Management from loading.
      try {
        const blotterResponse = await apiClient.get("/admin/blotters", { headers });
        setBlotters(Array.isArray(blotterResponse.data?.blotters) ? blotterResponse.data.blotters : []);
      } catch {
        setBlotters([]);
      }
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
    return (status === "All" ? logs : [])
      .filter((item) => !/^report archived(?:\s*:|\s*$)/i.test(String(item.actionType || "").trim()) &&
        !/^report archived(?:\s*:|\s*$)/i.test(String(item.title || "").trim()))
      .map((item) => ({
        ...item,
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
    ...blotters.map((item) => ({
      ...item,
      id: item.id,
      kind: "Blotter",
      reportType: "Blotter",
      status: "",
      title: `${item.incident_type || "Blotter report"} • ${item.location || "Location unspecified"}`,
      incidentType: item.incident_type,
      incidentDateTime: item.incident_datetime,
      complainantName: item.complainant_name,
      complainantAge: item.complainant_age,
      complainantContact: item.complainant_contact,
      actionTaken: item.action_taken,
      reportedBy: item.reported_by,
      blotterOfficer: item.blotter_officer,
      dateReported: item.date_reported,
      dateRecorded: item.date_recorded,
      location: item.location || "",
      severity: "Medium",
      created_at: item.created_at,
      details: item.incident_description || "",
      actor: item.reported_by || "Admin",
      actorRole: "admin",
    })),
    ...reports.map((item) => ({
      ...item,
      id: item.id,
      kind: [item.reportType, item.report_type, item.kind].includes("Blotter") ? "Blotter" : "Incident",
      title: `${item.incident_type || "Incident"}${item.location ? ` in ${item.location}` : ""}`,
      location: item.location || "",
      status: [item.reportType, item.report_type, item.kind].includes("Blotter") ? "" : item.status || "Pending Review",
      severity: item.severity || "Medium",
      created_at: item.created_at,
      details: item.details || "",
      actor: item.reporter_name || "Admin",
      actorRole: String(item.actorRole || item.role || item.source || "admin").toLowerCase(),
    })),
    ...(status === "All"
      ? announcements.map((item) => ({
          ...item,
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
  ].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()), [activityRecords, announcements, blotters, reports, status]);

  const filteredRecords = useMemo(() => {
    const start = from ? new Date(`${from}T00:00:00`) : null;
    const end = to ? new Date(`${to}T23:59:59.999`) : null;

    return visibleRecords.filter((record) => {
      if (String(record.status || "").trim().toLowerCase() === "archived") return false;
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

  const displayedRecords = filteredRecords.slice(0, visibleCount);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [from, to, status, reportType, postBy]);

  const handleScroll = (event) => {
    trackScroll(event);
    const show = event.nativeEvent.contentOffset.y > 300;
    if (show !== showScrollTopRef.current) {
      showScrollTopRef.current = show;
      setShowScrollTop(show);
    }
  };

  const openRecordPreview = (record, successMessage) => {
    setPreviewRecord(record);
    setPreviewVisible(true);
    if (successMessage) showSuccess(successMessage);
  };

  const handleArchiveRecord = async () => {
    if (!previewRecord || previewRecord.kind !== "Incident" || archiving) return;
    setArchiving(true);
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) throw new Error("Please sign in before archiving a report.");
      await apiClient.post(`/reports/${encodeURIComponent(previewRecord.id)}/status`, {
        status: "Archived",
        is_verified: false,
      }, { headers: { Authorization: `Bearer ${token}` } });
      setReports((current) => current.filter((report) => report.id !== previewRecord.id));
      setPreviewVisible(false);
      setPreviewRecord(null);
      showSuccess("Report moved to Archived.");
      await loadRecords();
    } catch (error) {
      showError(error?.response?.data?.error || error?.message || "Could not archive the report.");
    } finally {
      setArchiving(false);
    }
  };

  const handleAddReport = async (payload) => {
    const wasEditing = Boolean(editingRecord);
    const record = {
      kind: "Incident",
      reportType: "Incident",
      title: payload?.incident_type
        ? `${payload.incident_type}${payload.location ? ` in ${payload.location}` : ""}`
        : "New incident report",
      location: payload?.location || "",
      details: payload?.details || "",
      actor: payload?.poster_name || "Admin",
      actorRole: "admin",
      ...payload,
      id: payload?.id || `incident-${Date.now()}`,
      status: editingRecord?.status || payload?.status || "Pending Review",
      severity: editingRecord?.severity || payload?.severity || "Medium",
      created_at: editingRecord?.created_at || payload?.created_at || new Date().toISOString(),
    };

    try {
      setAddReportVisible(false);
      setEditingRecord(null);
      openRecordPreview(
        record,
        wasEditing ? "Incident report updated." : "Incident saved successfully."
      );
      loadRecords();
      return record;
    } catch (error) {
      throw new Error(error?.message || "Could not save the incident.");
    }
  };

  const handleAddAnnouncement = async (announcement) => {
    const wasEditing = Boolean(editingRecord);
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) throw new Error("Please sign in before posting an announcement.");
      const headers = { Authorization: `Bearer ${token}` };

      const resolvePicUrl = async () => {
        const uri = announcement.image?.uri;
        if (!uri) return announcement.pic_url || null;
        if (/^https?:\/\//i.test(uri)) return uri;
        return await uploadImage(uri);
      };

      const body = {
        type: announcement.type,
        title: announcement.title,
        location: announcement.location,
        details: announcement.details,
        pic_url: await resolvePicUrl(),
      };

      let serverId = null;
      if (wasEditing) {
        const announcementId = String(editingRecord.id).replace(/^announcement-/, "");
        await apiClient.put(
          `/admin/announcements/${encodeURIComponent(announcementId)}`,
          body,
          { headers }
        );
        serverId = announcementId;
      } else {
        const response = await apiClient.post("/admin/announcements", body, { headers });
        serverId = response?.data?.announcement_id || null;
      }

      const record = {
        ...announcement,
        id: serverId ? `announcement-${serverId}` : announcement.id,
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
        pic_url: body.pic_url,
      };
      setAddAnnouncementVisible(false);
      setEditingRecord(null);
      openRecordPreview(
        record,
        wasEditing ? "Announcement updated." : "Announcement published successfully."
      );
      loadRecords();
      return record;
    } catch (error) {
      throw new Error(error?.response?.data?.error || error?.message || "Could not publish the announcement.");
    }
  };

  const handleAddBlotter = async (blotter) => {
    const wasEditing = Boolean(editingRecord);
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) throw new Error("Please sign in before saving a blotter report.");
      const headers = { Authorization: `Bearer ${token}` };
      const response = wasEditing
        ? await apiClient.put(
            `/admin/blotters/${encodeURIComponent(editingRecord.id)}`,
            blotter,
            { headers }
          )
        : await apiClient.post("/admin/blotters", blotter, { headers });
      const saved = response.data?.blotter;
      const record = {
        kind: "Blotter",
        reportType: "Blotter",
        title: blotter.title || `${blotter.incidentType || "Blotter report"} • ${blotter.location || "Location unspecified"}`,
        location: blotter.location || "",
        barangay: blotter.barangay || "",
        details: blotter.details || blotter.incidentDescription || "",
        actor: blotter.reportedBy || "Admin",
        actorRole: "admin",
        ...blotter,
        ...saved,
        status: "",
        id: saved?.id || blotter.id || `blotter-${Date.now()}`,
        severity: blotter.severity || "Medium",
        incidentType: saved?.incident_type || blotter.incidentType,
        incidentDateTime: saved?.incident_datetime || blotter.incidentDateTime,
        complainantName: saved?.complainant_name || blotter.complainantName,
        complainantAge: saved?.complainant_age || blotter.complainantAge,
        complainantContact: saved?.complainant_contact || blotter.complainantContact,
        actionTaken: saved?.action_taken || blotter.actionTaken,
        reportedBy: saved?.reported_by || blotter.reportedBy,
        blotterOfficer: saved?.blotter_officer || blotter.blotterOfficer,
        dateReported: saved?.date_reported || blotter.dateReported,
        dateRecorded: saved?.date_recorded || blotter.dateRecorded,
        created_at: saved?.created_at || blotter.created_at,
      };
      setAddBlotterVisible(false);
      setEditingRecord(null);
      openRecordPreview(
        record,
        wasEditing ? "Blotter report updated." : "Blotter report saved successfully."
      );
      await loadRecords();
      return record;
    } catch (error) {
      throw new Error(error?.response?.data?.error || error?.message || "Could not save the blotter report.");
    }
  };

  const startEditing = (record) => {
    setPreviewVisible(false);
    setPreviewRecord(null);
    setEditingRecord(record);
    if (record.kind === "Incident") setAddReportVisible(true);
    else if (record.kind === "Announcement") setAddAnnouncementVisible(true);
    else if (record.kind === "Blotter") setAddBlotterVisible(true);
    else setEditingRecord(null);
  };

  const openDeleteConfirm = (record) => {
    deleteTargetRef.current = record;
    setDeleteTarget(record);
  };

  const handleDeleteRecord = async () => {
    const target = deleteTargetRef.current;
    if (!target || deleting) return;
    deleteTargetRef.current = null;
    setDeleting(true);
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) throw new Error("Please sign in before deleting a record.");
      const headers = { Authorization: `Bearer ${token}` };

      if (target.kind === "Incident") {
        await apiClient.delete(`/reports/${encodeURIComponent(target.id)}`, { headers });
      } else if (target.kind === "Announcement") {
        const announcementId = String(target.id).replace(/^announcement-/, "");
        await apiClient.delete(
          `/admin/announcements/${encodeURIComponent(announcementId)}`,
          { headers }
        );
      } else if (target.kind === "Blotter") {
        await apiClient.delete(
          `/admin/blotters/${encodeURIComponent(target.id)}`,
          { headers }
        );
      } else {
        throw new Error("This record cannot be deleted.");
      }

      setDeleteTarget(null);
      setPreviewVisible(false);
      setPreviewRecord(null);
      showSuccess("Record deleted.");
      await loadRecords();
    } catch (error) {
      showError(
        error?.response?.data?.error || error?.message || "Could not delete the record."
      );
    } finally {
      setDeleting(false);
    }
  };

  const exportCsv = async () => {
    const columns = ["Record type", "Title", "Location", "Status / action", "Severity", "Date", "Actor", "Details"];
    const rows = filteredRecords.map((record) => [
      record.kind,
      record.title,
      record.location,
      record.kind === "Blotter" ? "" : record.status,
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

  const handlePrintPreview = async () => {
    if (!previewRecord) return;
    const html = buildRecordDocumentHtml(previewRecord);

    try {
      if (Platform.OS === "web") {
        const printWindow = window.open("", "_blank");
        if (!printWindow) {
          showError("Allow pop-ups to export this report as a PDF.");
          return;
        }
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
        return;
      }

      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "Export report as PDF",
          UTI: "com.adobe.pdf",
        });
      } else {
        showError("The PDF was generated, but sharing is unavailable on this device.");
      }
    } catch (error) {
      showError(error?.message || "Could not export this record as a PDF.");
    }
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
          testID="report-management-scroll"
          ref={scrollRef}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onScrollBeginDrag={stopScrollAnimation}
          onTouchStart={stopScrollAnimation}
          style={[styles.container, { scrollbarWidth: "none", msOverflowStyle: "none" }]}
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
                <Ionicons name="megaphone-outline" size={18} color="#FFFFFF" />
                <Text style={styles.secondaryButtonText}>Add Announcement</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setAddBlotterVisible(true)} activeOpacity={0.85}>
                <Ionicons name="document-text-outline" size={18} color="#FFFFFF" />
                <Text style={styles.secondaryButtonText}>Add Blotter Report</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.batchFilterRow}>
              <BatchFilterDropdown
                label="Post by"
                value={postBy}
                options={POST_BY_OPTIONS}
                onChange={setPostBy}
              />
              <BatchFilterDropdown
                label="Type of Report"
                value={reportType}
                options={REPORT_TYPES}
                onChange={setReportType}
              />
              <BatchFilterDropdown
                label="Status"
                value={status}
                options={FILTER_STATUSES}
                onChange={setStatus}
              />
              <BatchDateRangeDropdown
                from={from}
                to={to}
                onChangeFrom={setFrom}
                onChangeTo={setTo}
              />
            </View>
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
            ) : displayedRecords.map((record, index) => {
              const icon = ["Incident", "Blotter"].includes(record.kind)
                ? "document-text-outline"
                : record.kind === "Announcement"
                  ? "megaphone-outline"
                  : "list-outline";
              const tone = record.kind === "Activity" ? "#B96A18" : "#294880";
              const iconBackground = record.kind === "Activity" ? "#FFF4E5" : "#EAF2FF";
              return (
                <TouchableOpacity
                  testID="admin-managed-record"
                  key={record.id}
                  style={[styles.recordRow, index > 0 && styles.recordRowBorder]}
                  onPress={() => openRecordPreview(record)}
                  activeOpacity={0.78}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${record.kind} details`}
                >
                  <View style={[styles.recordIcon, { backgroundColor: iconBackground }]}>
                    <Ionicons name={icon} size={23} color={tone} />
                  </View>
                  <View style={styles.recordBody}>
                    <View style={styles.recordTopRow}>
                      <View style={styles.recordTitleBox}>
                        <Text style={styles.recordTitle}>{record.title}</Text>
                        <Text style={styles.recordMeta}>{record.kind} · {formatDate(record.created_at)}</Text>
                      </View>
                      {record.kind !== "Blotter" && record.status ? (
                        <View style={styles.statusBadge}>
                          <Text style={styles.statusBadgeText}>{record.status}</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.recordInfoRow}>
                      {!!record.location && <Text style={styles.recordMeta}>{record.location}</Text>}
                      {!!record.severity && <Text style={styles.severityBadge}>{record.severity}</Text>}
                      {!!record.actor && <Text style={styles.recordMeta}>{record.actor}</Text>}
                    </View>
                    {!!record.details && <Text style={styles.recordDetails} numberOfLines={2}>{record.details}</Text>}
                    <View style={styles.recordBottomRow} />
                  </View>
                </TouchableOpacity>
              );
            })}
            {!loading && filteredRecords.length > displayedRecords.length ? <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="View more records"
              style={styles.viewMoreBtn}
              onPress={() => setVisibleCount((count) => count + PAGE_SIZE)}
              activeOpacity={0.8}
            >
              <Text style={styles.viewMoreText}>View more</Text>
            </TouchableOpacity> : null}
          </View>
        </ScrollView>
        {showScrollTop ? <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Back to top"
          style={styles.scrollTopBtn}
          onPress={scrollToTop}
          activeOpacity={0.8}
        >
          <Ionicons name="chevron-up" size={22} color="#FFFFFF" />
        </TouchableOpacity> : null}
      </View>
      <Admin_AddReportModal
        visible={addReportVisible}
        record={editingRecord}
        onClose={() => { setAddReportVisible(false); setEditingRecord(null); }}
        onSubmit={handleAddReport}
      />
      <Admin_AddAnnouncementModal
        visible={addAnnouncementVisible}
        record={editingRecord}
        onClose={() => { setAddAnnouncementVisible(false); setEditingRecord(null); }}
        onSubmit={handleAddAnnouncement}
      />
      <Admin_AddBlotterModal
        visible={addBlotterVisible}
        record={editingRecord}
        onClose={() => { setAddBlotterVisible(false); setEditingRecord(null); }}
        onSubmit={handleAddBlotter}
      />

      {previewVisible && previewRecord ? (
        <>
          <View style={styles.previewOverlay} />
          <View style={styles.previewModalOuter}>
            <View style={styles.previewModal}>
              <View style={styles.previewHeader}>
                <View>
                  <Text style={styles.previewTitle}>Report Document</Text>
                  <Text style={styles.previewSubtitle}>{previewRecord.title || previewRecord.id}</Text>
                </View>
                <TouchableOpacity onPress={() => setPreviewVisible(false)} hitSlop={10}>
                  <Ionicons name="close" size={24} color="#4B5D7A" />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={[styles.previewScroll, { scrollbarWidth: "none", msOverflowStyle: "none" }]}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.documentHeading}>
                  <Text style={styles.documentEyebrow}>COMMUNITY SAFETY RECORD</Text>
                  <Text style={styles.documentTitle}>{previewRecord.title || `${previewRecord.kind} Record`}</Text>
                  <Text style={styles.documentId}>Reference {documentValue(previewRecord.id)}</Text>
                </View>

                {getRecordDocumentSections(previewRecord).map((section) => (
                  <View key={section.title} style={styles.previewSection}>
                    <Text style={styles.previewSectionTitle}>{section.title}</Text>
                    {section.fields.map(([label, value]) => (
                      <View key={label} style={styles.previewPair}>
                        <Text style={styles.previewLabel}>{label}</Text>
                        <Text style={styles.previewValue}>{documentValue(value)}</Text>
                      </View>
                    ))}
                  </View>
                ))}

                {(previewRecord.images || previewRecord.photos || []).length > 0 ? (
                  <View style={styles.previewSection}>
                    <Text style={styles.previewSectionTitle}>Photo Evidence</Text>
                    <View style={styles.previewImages}>
                      {(previewRecord.images || previewRecord.photos).map((image, index) => {
                        const uri = typeof image === "string" ? image : image?.uri || image?.url || image?.image_url;
                        return uri ? <Image key={`${uri}-${index}`} source={{ uri }} style={styles.previewImage} resizeMode="cover" /> : null;
                      })}
                    </View>
                  </View>
                ) : null}
              </ScrollView>

              <View style={styles.previewFooter}>
                {previewRecord.kind === "Incident" && previewRecord.status !== "Archived" ? (
                  <TouchableOpacity
                    style={styles.previewArchiveButton}
                    onPress={handleArchiveRecord}
                    activeOpacity={0.85}
                    disabled={archiving}
                    accessibilityRole="button"
                    accessibilityLabel="Move report to Archived"
                  >
                    <Ionicons name="archive-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.previewPrimaryButtonText}>{archiving ? "Archiving..." : "Move to Archived"}</Text>
                  </TouchableOpacity>
                ) : null}
                {["Incident", "Announcement", "Blotter"].includes(previewRecord.kind) ? (
                  <>
                    <TouchableOpacity
                      style={styles.previewSecondaryButton}
                      onPress={() => startEditing(previewRecord)}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel="Edit record"
                    >
                      <Ionicons name="create-outline" size={18} color="#294880" />
                      <Text style={styles.previewSecondaryButtonText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.previewDeleteButton}
                      onPress={() => openDeleteConfirm(previewRecord)}
                      activeOpacity={0.85}
                      disabled={deleting}
                      accessibilityRole="button"
                      accessibilityLabel="Delete record"
                    >
                      <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
                      <Text style={styles.previewPrimaryButtonText}>{deleting ? "Deleting..." : "Delete"}</Text>
                    </TouchableOpacity>
                  </>
                ) : null}
                <TouchableOpacity style={styles.previewPrimaryButton} onPress={handlePrintPreview} activeOpacity={0.85}>
                  <Ionicons name="document-text-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.previewPrimaryButtonText}>Export as PDF</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.previewSecondaryButton} onPress={() => setPreviewVisible(false)} activeOpacity={0.85}>
                  <Text style={styles.previewSecondaryButtonText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </>
      ) : null}

      <ConfirmModal
        visible={Boolean(deleteTarget)}
        onClose={() => {
          if (!deleting) setDeleteTarget(null);
        }}
        onConfirm={handleDeleteRecord}
        title="Delete Record"
        message={`This permanently removes "${deleteTarget?.title || deleteTarget?.id}" from ${deleteTarget?.kind || "this list"}. This cannot be undone.`}
        confirmLabel="Delete"
        icon="trash"
      />
    </Admin_Layout>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: "#F5F8FC" },
  container: { flex: 1, backgroundColor: "#F5F8FC" },
  scrollContent: { paddingTop: 0, paddingBottom: 36, paddingHorizontal: 0 },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 18 },
  statCard: { flex: 1, minWidth: 190, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D9E2F0", borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center" },
  statIcon: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", marginRight: 10 },
  statTextBox: { flex: 1, minWidth: 0 },
  statValue: { fontSize: 22, fontFamily: "PoppinsSemiBold", color: "#2F4267" },
  statTitle: { fontSize: 12, color: "#5D6F92", marginTop: 3, fontFamily: "PoppinsMedium" },
  filterCard: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D9E2F0", borderRadius: 16, padding: 18, marginBottom: 18, zIndex: 30 },
  filterTopRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14, marginBottom: 16 },
  filterHeaderTitleBox: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 240 },
  filterMainIconBox: { width: 42, height: 42, borderRadius: 13, backgroundColor: "#EAF2FF", alignItems: "center", justifyContent: "center" },
  filterTitleText: { flex: 1 },
  filterMainTitle: { fontSize: 16, fontFamily: "PoppinsSemiBold", color: "#294880" },
  filterMainSubtitle: { fontSize: 13, fontFamily: "PoppinsRegular", color: "#5D6F92", marginTop: 2 },
  exportButton: { minHeight: 42, paddingHorizontal: 16, borderRadius: 12, backgroundColor: "#25845C", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  primaryButton: { minHeight: 42, paddingHorizontal: 16, borderRadius: 12, backgroundColor: "#294880", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  secondaryButton: { minHeight: 42, paddingHorizontal: 16, borderRadius: 12, backgroundColor: "#294880", borderWidth: 1, borderColor: "#294880", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  buttonText: { fontSize: 13, fontFamily: "PoppinsSemiBold", color: "#FFFFFF" },
  secondaryButtonText: { fontSize: 13, fontFamily: "PoppinsSemiBold", color: "#FFFFFF" },
  previewOverlay: { position: "absolute", inset: 0, backgroundColor: "rgba(15, 30, 55, 0.25)", zIndex: 20 },
  previewModalOuter: { position: "absolute", inset: 0, justifyContent: "center", alignItems: "center", zIndex: 21, padding: 20 },
  previewModal: { width: "100%", maxWidth: 760, maxHeight: "85%", backgroundColor: "#FFFFFF", borderRadius: 18, borderWidth: 1, borderColor: "#D9E2F0", overflow: "hidden" },
  previewModalHidden: { opacity: 0, pointerEvents: "none" },
  previewHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#E7ECF3", backgroundColor: "#F7F9FD" },
  previewTitle: { fontSize: 18, fontFamily: "PoppinsSemiBold", color: "#294880" },
  previewSubtitle: { marginTop: 2, fontSize: 12, fontFamily: "PoppinsRegular", color: "#5D6F92" },
  previewScroll: { maxHeight: 560, paddingHorizontal: 18, paddingVertical: 16 },
  documentHeading: { paddingVertical: 14, paddingHorizontal: 15, marginBottom: 14, borderLeftWidth: 4, borderLeftColor: "#25845C", backgroundColor: "#F5F8FC" },
  documentEyebrow: { color: "#25845C", fontSize: 10, fontFamily: "PoppinsSemiBold", letterSpacing: 1 },
  documentTitle: { marginTop: 5, color: "#1F2A37", fontSize: 18, lineHeight: 25, fontFamily: "PoppinsSemiBold" },
  documentId: { marginTop: 4, color: "#5D6F92", fontSize: 11, fontFamily: "PoppinsRegular" },
  previewSection: { marginBottom: 14, backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E7ECF3", borderRadius: 12, padding: 14 },
  previewSectionTitle: { fontSize: 13, fontFamily: "PoppinsSemiBold", color: "#294880", marginBottom: 10 },
  previewPair: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8 },
  previewLabel: { flex: 1, fontSize: 12, color: "#5D6F92", fontFamily: "PoppinsMedium" },
  previewValue: { flex: 1.25, fontSize: 12, color: "#1F2A37", fontFamily: "PoppinsRegular", textAlign: "right" },
  previewImages: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  previewImage: { width: 150, height: 112, borderRadius: 8, backgroundColor: "#E7ECF3" },
  previewFooter: { flexDirection: "row", justifyContent: "flex-end", gap: 10, paddingHorizontal: 18, paddingVertical: 14, borderTopWidth: 1, borderTopColor: "#E7ECF3", backgroundColor: "#F7F9FD" },
  previewPrimaryButton: { minHeight: 42, paddingHorizontal: 16, borderRadius: 10, backgroundColor: "#294880", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  previewArchiveButton: { minHeight: 42, paddingHorizontal: 16, borderRadius: 10, backgroundColor: "#A34F25", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  previewPrimaryButtonText: { color: "#FFFFFF", fontFamily: "PoppinsSemiBold", fontSize: 13 },
  previewSecondaryButton: { minHeight: 42, paddingHorizontal: 16, borderRadius: 10, backgroundColor: "#EEF2F8", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  previewSecondaryButtonText: { color: "#294880", fontFamily: "PoppinsSemiBold", fontSize: 13 },
  previewDeleteButton: { minHeight: 42, paddingHorizontal: 16, borderRadius: 10, backgroundColor: "#B42318", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  batchFilterRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: 10, paddingBottom: 2, width: "100%" },
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
  viewMoreBtn: { alignSelf: "center", marginTop: 16, marginBottom: 18, paddingHorizontal: 30, paddingVertical: 12, borderRadius: 12, backgroundColor: "#294880" },
  viewMoreText: { color: "#FFFFFF", fontSize: 14, fontFamily: "PoppinsSemiBold" },
  scrollTopBtn: { position: "absolute", right: 26, bottom: 30, width: 44, height: 44, borderRadius: 22, backgroundColor: "#294880", alignItems: "center", justifyContent: "center", zIndex: 20, elevation: 6, shadowColor: "#000000", shadowOpacity: 0.22, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
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
  recordBottomRow: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", marginTop: 9 },
  recordAction: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 11, paddingVertical: 7, borderWidth: 1, borderColor: "#B9C9E6", borderRadius: 8, backgroundColor: "#EEF3FF" },
  recordActionText: { color: "#294880", fontFamily: "PoppinsSemiBold", fontSize: 12 },
  emptyState: { minHeight: 150, alignItems: "center", justifyContent: "center", gap: 8, padding: 28 },
  emptyTitle: { fontSize: 18, fontFamily: "PoppinsMedium", color: "#2F4267" },
  emptyText: { fontSize: 14, color: "#5D6F92", fontFamily: "PoppinsRegular", textAlign: "center" },
});
