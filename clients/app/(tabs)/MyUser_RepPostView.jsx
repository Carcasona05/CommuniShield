import React, { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import apiClient from "../../services/apiClient";
import { smartBack } from "../../services/navigation";
import ToastProvider, { useToast } from "../../components/Toast";
import ConfirmModal from "../../components/modals/ConfirmModal";
import MyUser_RepPostView_Layout from "../../components/User_compo/MyUser_RepPostView_Layout";
import { removeCachedReport, patchCachedReports } from "../../services/dataStore";
import { mergeReportDetails } from "../../services/reportPresentation";

const MyUser_RepPostView = () => {
  const { report } = useLocalSearchParams();
  return (
  <ToastProvider>
    <MyUser_RepPostViewInner key={String(report || "")} />
  </ToastProvider>
);
};

const MyUser_RepPostViewInner = () => {
  const router = useRouter();
  const params = useLocalSearchParams();
  const toast = useToast();

  let parsedReport = null;

  try {
    const reportParam = Array.isArray(params.report)
      ? params.report[0]
      : params.report;

    parsedReport = reportParam ? JSON.parse(reportParam) : null;
  } catch (error) {
    console.log("Failed to parse report data:", error);
    parsedReport = null;
  }

  const [freshReport, setFreshReport] = useState(parsedReport);
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);

  const refresh = useCallback(async (isCurrent) => {
    if (!parsedReport?.id) return;
    try {
      const token = await AsyncStorage.getItem("access_token");
      const res = await apiClient.get(`/reports/${parsedReport.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const report = res.data?.report;
      if (report && token === await AsyncStorage.getItem("access_token") && isCurrent() && String(report.id) === String(parsedReport.id)) {
        setFreshReport(previous => mergeReportDetails(previous, report));
        patchCachedReports(report.id, previous => ({ ...previous, status: report.status, is_verified: report.is_verified }));
      }
    } catch {
      // keep serialized fallback
    }
  }, [parsedReport?.id]);

  useEffect(() => {
    let active = true;
    refresh(() => active);
    return () => { active = false; };
  }, [refresh]);

  const handleEdit = () => {
    router.push({
      pathname: "/MyUser_RepPostView_Edit",
      params: {
        report: JSON.stringify(freshReport || parsedReport),
      },
    });
  };

  const handleDelete = () => {
    setConfirmDeleteVisible(true);
  };

  const confirmDelete = async () => {
    if (!(freshReport?.id || parsedReport?.id)) return;
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;

      await apiClient.delete(
        `/reports/${freshReport?.id || parsedReport.id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      removeCachedReport(freshReport?.id || parsedReport.id);

      toast.success("Report deleted successfully.");
      smartBack("/(tabs)/User_MyReports");
    } catch (error) {
      toast.error(error.response?.data?.error || "Could not delete the report.");
    }
  };

  return (
    <>
      <MyUser_RepPostView_Layout
        key={(freshReport || parsedReport)?.id}
        report={freshReport || parsedReport}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
      <ConfirmModal
        visible={confirmDeleteVisible}
        onClose={() => setConfirmDeleteVisible(false)}
        onConfirm={confirmDelete}
        title="Delete Report"
        message="Are you sure you want to delete this report?"
        confirmLabel="Delete"
      />
    </>
  );
};

export default MyUser_RepPostView;
