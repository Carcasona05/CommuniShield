import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Admin_Layout from "../../components/Admin_compo/Admin_Layout";
import { ListSkeleton } from "../../components/PageSkeletons";
import Admin_ViewSimilarReportsModal from "../../components/Admin_compo/Admin_ViewSimilarReportsModal";
import {
  BatchDateRangeDropdown,
  BatchFilterDropdown,
} from "../../components/Admin_compo/AdminBatchFilters";
import apiClient from "../../services/apiClient";
import useAutoRefresh from "../../hooks/useAutoRefresh";
import { getCache, setCache } from "../../services/dataStore";
import ToastProvider, { useToast } from "../../components/Toast";
import { ARGAO_BARANGAYS } from "../../constants/argaoMapData";


const COMMUNISHIELD_BLUE = "#294880";

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

const mapValidationReports = (list) =>
  (list || []).map((r) => ({
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
    sentiment: r.sentiment ?? null,
    sentiment_status: r.sentiment_status ?? "unavailable",
    sentiment_error: r.sentiment_error ?? "",
    sentiment_confidence: r.sentiment_confidence ?? 0,
    sentiment_language: r.sentiment_language ?? "unknown",
    sentiment_provider: r.sentiment_provider ?? "none",
    sentiment_model: r.sentiment_model ?? "none",
    sentiment_analyzed_at: r.sentiment_analyzed_at ?? null,
    credibilityReview: r.credibility_review || "",
    submittedBy: r.reporter_name || r.poster_name || "Anonymous User",
    submittedRole: r.source === "Admin" ? "Admin" : "User",
    submittedAt: formatSubmittedAt(r.created_at),
    createdAt: r.created_at,
    verifiedBy: r.is_verified ? "System" : "",
    remarks: "",
    is_verified: r.is_verified,
    comments: Array.isArray(r.comments) ? r.comments : [],
    images: Array.isArray(r.images) ? r.images : [],
  }));

const PAGE_SIZE = 10;
const INCIDENT_TYPES_BY_CATEGORY = {
  "Public Safety Incidents": ["Public Disturbance", "Harassment", "Loitering / Suspicious Presence", "Trespassing"],
  "Property-Related Incidents": ["Theft", "Lost Property", "Vandalism / Property Damage", "Shoplifting"],
  "Traffic and Road Incidents": ["Vehicular Accident", "Reckless Driving", "Illegal Parking", "Road Obstruction"],
  "Community and Environmental Concerns": ["Fire Incident", "Flooding", "Blocked Drainage", "Garbage / Sanitation Issues", "Streetlight Outage"],
  "Suspicious Activities": ["Suspicious Person", "Suspicious Vehicle", "Unattended / Abandoned Object", "Unusual Behavior", "Loitering / Suspicious Presence"],
  "Public Assistance / Community Reports": ["Missing Pet", "Lost Item", "Request for Assistance", "General Safety Concern"],
};
const BARANGAY_FILTER_OPTIONS = [
  { value: "All", label: "All Barangays" },
  ...ARGAO_BARANGAYS.map((barangay) => ({
    value: barangay.name,
    label: barangay.name,
  })),
];
const csvValue = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
const parseDateBoundary = (value, endOfDay = false) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
  const time = endOfDay ? "23:59:59.999" : "00:00:00.000";
  const date = new Date(`${value.trim()}T${time}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};
const VALIDATION_VIEW_STATUSES = {
  pending: "Pending Review",
  verified: "Resolved",
  rejected: "Rejected",
  suspicious: "Marked Fake",
};

export default function Admin_ValidationWrapper() {
  return (
    <ToastProvider>
      <Admin_Validation />
    </ToastProvider>
  );
}

function Admin_Validation() {
  const toast = useToast();
  const searchParams = useLocalSearchParams();
  const viewParam = Array.isArray(searchParams.view)
    ? searchParams.view[0]
    : searchParams.view;
  const viewStatus = VALIDATION_VIEW_STATUSES[viewParam];
  const [loading, setLoading] = useState(() => getCache("api:/admin/dashboard") === undefined);
  const [selectedStatus, setSelectedStatus] = useState(viewStatus || "All");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedIncidentType, setSelectedIncidentType] = useState("All");
  const [selectedBarangay, setSelectedBarangay] = useState("All");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedCompiledGroup, setSelectedCompiledGroup] = useState(null);
  const [viewVisible, setViewVisible] = useState(false);
  const [validating, setValidating] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const showScrollTopRef = useRef(false);
  const scrollRef = useRef(null);
  const loadedFiltersRef = useRef({
    status: selectedStatus,
    category: selectedCategory,
    barangay: "All",
    from: "",
    to: "",
  });

  useEffect(() => {
    setSelectedStatus(viewStatus || "All");
  }, [viewStatus]);

  const [fontsLoaded] = useFonts({
    PoppinsRegular: require("../../assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("../../assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("../../assets/fonts/Poppins-SemiBold.ttf"),
  });

  const [reports, setReports] = useState(() => {
    const cached = getCache("api:/admin/dashboard");
    return Array.isArray(cached?.reports) ? mapValidationReports(cached.reports) : [];
  });

  const loadValidation = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;

      const applyList = (list) => setReports(mapValidationReports(list));
      const params = {};
      if (selectedStatus !== "All") params.status = selectedStatus;
      if (selectedCategory !== "All") params.category = selectedCategory;
      if (selectedBarangay !== "All") params.barangay = selectedBarangay;

      const rangeStart = parseDateBoundary(fromDate);
      const rangeEnd = parseDateBoundary(toDate, true);
      if (rangeStart) params.from = rangeStart.toISOString();
      if (rangeEnd) params.to = rangeEnd.toISOString();

      const cached = getCache("api:/admin/dashboard");
      if (Object.keys(params).length === 0 && cached && Array.isArray(cached.reports)) {
        applyList(cached.reports);
      }

      const res = await apiClient.get("/admin/dashboard", {
        params,
        headers: { Authorization: `Bearer ${token}` },
      });

      if (Object.keys(params).length === 0) {
        setCache("api:/admin/dashboard", res.data ?? {});
      }
      applyList(res.data?.reports || []);
    } catch {
      // keep last loaded data on failure
    } finally {
      setLoading(false);
    }
  }, [fromDate, selectedBarangay, selectedCategory, selectedStatus, toDate]);

  useAutoRefresh(loadValidation, 60000);

  useEffect(() => {
    const currentFilters = {
      status: selectedStatus,
      category: selectedCategory,
      barangay: selectedBarangay,
      from: fromDate.trim(),
      to: toDate.trim(),
    };
    if (Object.keys(currentFilters).every(
      (key) => loadedFiltersRef.current[key] === currentFilters[key]
    )) {
      return;
    }
    loadedFiltersRef.current = currentFilters;
    loadValidation();
  }, [fromDate, loadValidation, selectedBarangay, selectedCategory, selectedStatus, toDate]);

  const statusFilters = ["All", "Pending Review", "Under Verification", "Resolved", "Rejected"];
  const incidentTypeOptions = selectedCategory === "All"
    ? [...new Set(Object.values(INCIDENT_TYPES_BY_CATEGORY).flat())]
    : INCIDENT_TYPES_BY_CATEGORY[selectedCategory] || [];

  useEffect(() => {
    if (
      selectedIncidentType !== "All" &&
      !incidentTypeOptions.includes(selectedIncidentType)
    ) {
      setSelectedIncidentType("All");
    }
  }, [incidentTypeOptions, selectedIncidentType]);

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

    const parseDate = (submittedAt) => {
      if (!submittedAt) return null;
      const datePart = submittedAt.split("•")?.[0]?.trim();
      const d = new Date(datePart);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    reportsList.forEach((report) => {
      const reportDate = parseDate(report.submittedAt);
      const baseKey = `${report.category}-${report.type}-${report.barangay}-${report.status}`.toLowerCase();

      let placed = false;

      const existingKeys = Object.keys(grouped).filter((k) => k.startsWith(baseKey));

      for (const key of existingKeys) {
        const group = grouped[key];
        const groupDate = group._earliestDate;
        if (groupDate && reportDate) {
          const diffMs = Math.abs(reportDate.getTime() - groupDate.getTime());
          if (diffMs <= 24 * 60 * 60 * 1000) {
            group.reports.push(report);
            group.aiScore = Math.max(group.aiScore, report.aiScore);
            group.severity = getHighestSeverity(group.severity, report.severity);
            placed = true;
            break;
          }
        }
      }

      if (!placed) {
        const groupKey = existingKeys.length > 0
          ? `${baseKey}-${existingKeys.length}`
          : baseKey;

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
          _earliestDate: reportDate,
          reports: [report],
        };
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
        _earliestDate: undefined,
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

  const filteredReports = useMemo(() => {
    const rangeStart = parseDateBoundary(fromDate);
    const rangeEnd = parseDateBoundary(toDate, true);

    return groupedReports.filter((group) => {
      if (viewParam === "clustered" && group.reportCount < 2) return false;
      if (
        viewParam === "credibility" &&
        !group.reports.some(
          (report) => report.aiScore > 0 || report.credibilityReview
        )
      ) {
        return false;
      }
      const matchesStatus =
        selectedStatus === "All" ||
        group.reports.some((report) => report.status === selectedStatus);

      const matchesCriteria = group.reports.some((report) => {
        const createdAt = report.createdAt ? new Date(report.createdAt) : null;
        const locationParts = [
          report.barangay,
          ...String(report.location || "").split(","),
        ].map((part) => String(part || "").trim().toLowerCase());
        return (
          (selectedCategory === "All" || report.category === selectedCategory) &&
          (selectedIncidentType === "All" || report.type === selectedIncidentType) &&
          (selectedBarangay === "All" ||
            locationParts.includes(selectedBarangay.toLowerCase())) &&
          (!rangeStart || (createdAt && createdAt >= rangeStart)) &&
          (!rangeEnd || (createdAt && createdAt <= rangeEnd))
        );
      });

      return matchesStatus && matchesCriteria;
    });
  }, [fromDate, groupedReports, selectedBarangay, selectedCategory, selectedIncidentType, selectedStatus, toDate, viewParam]);

  const visibleReports = filteredReports.slice(0, visibleCount);
  const exportValidationCsv = async () => {
    const columns = [
      "Report ID",
      "Incident Type",
      "Category",
      "Barangay",
      "Location",
      "Status",
      "Severity",
      "AI Score",
      "Submitted By",
      "Submitted At",
      "Details",
    ];
    const rows = filteredReports.flatMap((group) =>
      group.reports.map((report) => [
        report.id,
        report.type,
        report.category,
        report.barangay,
        report.location,
        report.status,
        report.severity,
        report.aiScore,
        report.submittedBy,
        report.createdAt || report.submittedAt,
        report.details,
      ])
    );
    const csv = [columns, ...rows]
      .map((row) => row.map(csvValue).join(","))
      .join("\r\n");

    if (Platform.OS === "web") {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "communishield-validation-reports.csv";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      return;
    }

    await Share.share({
      title: "CommuniShield validation reports CSV",
      message: csv,
    });
  };
  const validationViewTitle = {
    clustered: "Clustered Reports",
    pending: "Pending Reports",
    verified: "Verified Reports",
    rejected: "Rejected Reports",
    suspicious: "Suspicious Reports",
    credibility: "User Credibility",
  }[viewParam] || "Reports for Validation";

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [fromDate, selectedBarangay, selectedCategory, selectedIncidentType, selectedStatus, toDate, viewParam]);

  const handleScroll = (e) => {
    const next = e.nativeEvent.contentOffset.y > 300;
    if (next !== showScrollTopRef.current) {
      showScrollTopRef.current = next;
      setShowScrollTop(next);
    }
  };

  const openReportParam = searchParams?.openReport;
  const openReportNonce = searchParams?.notifNonce;
  const consumedOpenReport = useRef(null);

  useEffect(() => {
    const target = Array.isArray(openReportParam)
      ? openReportParam[0]
      : openReportParam;
    const nonce = Array.isArray(openReportNonce)
      ? openReportNonce[0]
      : openReportNonce;

    if (!target || loading) return;

    const consumeKey = nonce ? `${target}:${nonce}` : target;
    if (consumedOpenReport.current === consumeKey) return;

    const group = groupedReports.find((g) =>
      g.reports.some((report) => report.id === target)
    );

    if (!group) return;

    consumedOpenReport.current = consumeKey;
    setSelectedCompiledGroup(group);
    setViewVisible(true);
  }, [openReportParam, openReportNonce, groupedReports, loading]);

  if (!fontsLoaded) {
    return null;
  }

  if (loading) {
    return (
      <Admin_Layout>
        <ListSkeleton />
      </Admin_Layout>
    );
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
    if (!target || validating) return;

    setValidating(true);
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
      toast.success(`Report status updated to "${newStatus}".`);
      loadValidation();
    } catch (error) {
      toast.error(
        error?.response?.data?.error || "Could not update report status."
      );
    } finally {
      setValidating(false);
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

  const handleReanalyze = async (group) => {
    const targetReports = group?.reports || [];
    if (!targetReports.length || reanalyzing) return;
    setReanalyzing(true);

    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };

      const missingCommentIds = targetReports
        .flatMap((item) => item.comments || [])
        .filter(
          (comment) =>
            comment?.id && comment.sentiment_status !== "succeeded"
        )
        .map((comment) => comment.id);

      const calls = [];
      for (const item of targetReports) {
        calls.push(apiClient.post(`/ai/analyze/${item.id}`, {}, { headers }));
        calls.push(
          apiClient.post(
            `/ai/sentiment/reanalyze/report/${item.id}`,
            {},
            { headers }
          )
        );
      }

      if (missingCommentIds.length > 0) {
        calls.push(
          apiClient.post(
            "/ai/sentiment/reanalyze",
            { subject_type: "comment", ids: missingCommentIds },
            { headers }
          )
        );
      }

      const results = await Promise.allSettled(calls);
      const succeeded = results.filter(
        (result) => result.status === "fulfilled"
      ).length;

      loadValidation();

      if (succeeded === 0) {
        const failure = results.find(
          (result) => result.status === "rejected"
        );
        toast.error(
          failure?.reason?.response?.data?.error ||
            "Could not re-run AI analysis."
        );
      } else if (succeeded < results.length) {
        toast.success("AI re-analysis completed with partial results.");
      } else {
        toast.success(
          `AI re-analysis completed for ${targetReports.length} post(s).`
        );
      }
    } catch (error) {
      toast.error(
        error?.response?.data?.error ||
          error?.message ||
          "Could not re-run AI analysis."
      );
    } finally {
      setReanalyzing(false);
    }
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
          ref={scrollRef}
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
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
                    Filter incidents by location, category, type, status, and date
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.addReportButton, styles.exportCsvButton]}
                onPress={exportValidationCsv}
                activeOpacity={0.85}
              >
                <Ionicons name="download-outline" size={18} color="#FFFFFF" />
                <Text style={styles.addReportButtonText}>Export CSV</Text>
              </TouchableOpacity>








            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.batchFilterRow}
            >
              <BatchFilterDropdown
                label="Location"
                value={selectedBarangay}
                options={BARANGAY_FILTER_OPTIONS}
                onChange={setSelectedBarangay}
                width={190}
              />
              <BatchFilterDropdown
                label="Incident Category"
                value={selectedCategory}
                options={["All", ...Object.keys(INCIDENT_TYPES_BY_CATEGORY)].map((category) => ({
                  value: category,
                  label: category === "All" ? "All Categories" : category,
                }))}
                onChange={(category) => {
                  setSelectedCategory(category);
                  setSelectedIncidentType("All");
                }}
                width={250}
              />
              <BatchFilterDropdown
                label="Incident Type"
                value={selectedIncidentType}
                options={[
                  { value: "All", label: "All Incident Types" },
                  ...incidentTypeOptions.map((type) => ({ value: type, label: type })),
                ]}
                onChange={setSelectedIncidentType}
                width={230}
              />
              <BatchDateRangeDropdown
                from={fromDate}
                to={toDate}
                onChangeFrom={setFromDate}
                onChangeTo={setToDate}
                width={250}
              />
              <BatchFilterDropdown
                label="Status"
                value={selectedStatus}
                options={statusFilters}
                onChange={setSelectedStatus}
                width={190}
                chips
              />
            </ScrollView>
          </View>

          <View style={styles.reportsCard}>
            <View style={styles.listHeader}>
              <View style={styles.listHeaderTextBox}>
                <Text style={styles.sectionTitle}>{validationViewTitle}</Text>
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
                  Try changing the search text or report filters.
                </Text>
              </View>
            ) : (
              visibleReports.map((group, index) => {
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

            {filteredReports.length > visibleReports.length && (
              <TouchableOpacity
                style={styles.viewMoreBtn}
                onPress={() => setVisibleCount((count) => count + PAGE_SIZE)}
                activeOpacity={0.8}
              >
                <Text style={styles.viewMoreText}>View more</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>

        {showScrollTop && (
          <TouchableOpacity
            style={styles.scrollTopBtn}
            onPress={() =>
              scrollRef.current?.scrollTo({ y: 0, animated: true })
            }
            activeOpacity={0.8}
          >
            <Ionicons name="chevron-up" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        )}

        <Admin_ViewSimilarReportsModal
        visible={viewVisible}
        compiledGroup={selectedCompiledGroup}
        onClose={closeReport}
        onVerify={handleVerify}
        onReject={handleReject}
        onMapAndVerify={handleMapAndVerify}
        onMarkAsFake={handleMarkAsFake}
        onReanalyze={handleReanalyze}
        reanalyzing={reanalyzing}
        validating={validating}
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
    flexWrap: "wrap",
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

  exportCsvButton: {
    backgroundColor: "#25845C",
  },

  filterCriteriaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },

  batchFilterRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingBottom: 2,
  },

  criteriaInput: {
    flexGrow: 1,
    minWidth: 145,
    height: 42,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    color: "#2F4267",
    fontFamily: "PoppinsRegular",
    fontSize: 13,
  },

  searchCriteriaInput: {
    flexGrow: 2,
    minWidth: 220,
  },

  barangayFilter: {
    flexGrow: 1,
    minWidth: 220,
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