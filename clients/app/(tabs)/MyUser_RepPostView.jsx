import React from "react";
import { Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import apiClient from "../../services/apiClient";
import { smartBack } from "../../services/navigation";
import ToastProvider, { useToast } from "../../components/Toast";
import MyUser_RepPostView_Layout from "../../components/User_compo/MyUser_RepPostView_Layout";

const MyUser_RepPostView = () => {
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

  const handleEdit = () => {
    router.push({
      pathname: "/MyUser_RepPostView_Edit",
      params: {
        report: JSON.stringify(parsedReport),
      },
    });
  };

  const handleDelete = () => {
    Alert.alert("Delete Report", "Are you sure you want to delete this report?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (!parsedReport?.id) return;
          try {
            const token = await AsyncStorage.getItem("access_token");
            if (!token) return;

            await apiClient.delete(`/reports/${parsedReport.id}`, {
              headers: { Authorization: `Bearer ${token}` },
            });

            toast.success("Report deleted successfully.");
            smartBack("/(tabs)/User_MyReports");
          } catch (error) {
            toast.error(error.response?.data?.error || "Could not delete the report.");
          }
        },
      },
    ]);
  };

  return (
    <ToastProvider>
      <MyUser_RepPostView_Layout
        report={parsedReport}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    </ToastProvider>
  );
};

export default MyUser_RepPostView;