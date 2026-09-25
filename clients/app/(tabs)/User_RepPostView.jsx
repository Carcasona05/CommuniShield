import React, { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import apiClient from "../../services/apiClient";
import User_RepPostView_Layout from "../../components/User_compo/User_RepPostView_Layout";

const User_RepPostView = () => {
  const { post } = useLocalSearchParams();

  let parsedPost = null;

  try {
    parsedPost = post ? JSON.parse(post) : null;
  } catch (error) {
    console.error("Error parsing post:", error);
    parsedPost = null;
  }

  const [freshPost, setFreshPost] = useState(parsedPost);

  const refresh = useCallback(async () => {
    if (!parsedPost?.id) return;
    try {
      const token = await AsyncStorage.getItem("access_token");
      const res = await apiClient.get(`/reports/${parsedPost.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const report = res.data?.report;
      if (report) setFreshPost(report);
    } catch {
      // keep serialized fallback
    }
  }, [parsedPost?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return <User_RepPostView_Layout post={freshPost} />;
};

export default User_RepPostView;
