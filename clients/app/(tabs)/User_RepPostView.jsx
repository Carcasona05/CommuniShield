import React, { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import apiClient from "../../services/apiClient";
import User_RepPostView_Layout from "../../components/User_compo/User_RepPostView_Layout";
import ToastProvider from "../../components/Toast";
import { mergeReportDetails } from "../../services/reportPresentation";
import { patchCachedReports } from "../../services/dataStore";

const User_RepPostViewInner = () => {
  const { post } = useLocalSearchParams();

  let parsedPost = null;

  try {
    parsedPost = post ? JSON.parse(post) : null;
  } catch (error) {
    console.error("Error parsing post:", error);
    parsedPost = null;
  }

  const [freshPost, setFreshPost] = useState(parsedPost);

  const refresh = useCallback(async (isCurrent) => {
    if (!parsedPost?.id) return;
    try {
      const token = await AsyncStorage.getItem("access_token");
      const res = await apiClient.get(`/reports/${parsedPost.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const report = res.data?.report;
      if (report && token === await AsyncStorage.getItem("access_token") && isCurrent() && String(report.id) === String(parsedPost.id)) {
        setFreshPost(previous => mergeReportDetails(previous, report));
        patchCachedReports(report.id, previous => ({ ...previous, status: report.status, is_verified: report.is_verified }));
      }
    } catch {
      // keep serialized fallback
    }
  }, [parsedPost?.id]);

  useEffect(() => {
    let active = true;
    refresh(() => active);
    return () => { active = false; };
  }, [refresh]);

  return <User_RepPostView_Layout key={freshPost?.id} post={freshPost} />;
};

const User_RepPostView = () => {
  const { post } = useLocalSearchParams();
  return (
  <ToastProvider>
    <User_RepPostViewInner key={String(post || "")} />
  </ToastProvider>
);
};

export default User_RepPostView;
