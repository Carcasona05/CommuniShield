import React, { useEffect, useRef, useSyncExternalStore } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { reportPosting } from "../services/reportPosting";
import { postingIsActive } from "../services/reportPostingState";
import ToastProvider, { useToast } from "./Toast";

export default function ReportPostingStatus() {
  return <ToastProvider><PostingText /></ToastProvider>;
}

function PostingText() {
  const job = useSyncExternalStore(reportPosting.subscribe, reportPosting.snapshot, reportPosting.snapshot);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { success, error } = useToast();
  const notified = useRef(null);
  useEffect(() => {
    if (job.status === "success") {
      success("Report submitted successfully. It is now pending review.");
      reportPosting.dismiss();
    } else if (["failed", "uncertain"].includes(job.status)) {
      const key = `${job.status}:${job.error}`;
      if (notified.current !== key) { error(job.error); notified.current = key; }
    } else { notified.current = null; }
  }, [job.status, job.error, success, error]);
  if (["idle", "editing", "success"].includes(job.status)) return null;
  const active = postingIsActive(job.status);
  const navHeight = width < 340 ? 62 : width < 390 ? 66 : 70;
  const bottomSpace = Platform.OS === "ios" ? Math.max(insets.bottom, 10) + 6 : Math.max(insets.bottom, 8) + 8;
  const plusSize = width < 340 ? 48 : width < 390 ? 52 : 56;
  return <View pointerEvents="box-none" style={[styles.floating, { bottom: bottomSpace + navHeight + plusSize + 18 }]}>
    <View style={[styles.textRow, { width: Math.min(width - 32, 430) }]} accessibilityLiveRegion="polite">
      {active ? <Text style={styles.text}>Uploading your post…</Text> : <>
        <Text style={styles.failure}>{job.status === "uncertain" ? "Submission not confirmed." : "Post failed."}</Text>
        {job.status === "failed" ? <>
          <TouchableOpacity onPress={reportPosting.retry} accessibilityRole="button"><Text style={styles.link}>Retry</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={() => { if (reportPosting.edit()) router.push("/User_PostReport"); }}><Text style={styles.link}>Edit draft</Text></TouchableOpacity>
        </> : <>
          <TouchableOpacity accessibilityRole="button" onPress={() => router.push("/User_MyReports")}><Text style={styles.link}>Check My Reports</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={reportPosting.dismiss}><Text style={styles.link}>Dismiss</Text></TouchableOpacity>
        </>}
      </>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  floating: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 1001 },
  textRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: 10 },
  text: { width: "100%", textAlign: "center", color: "#173765", fontWeight: "800", fontSize: 18, lineHeight: 26, textShadowColor: "#FFFFFF", textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  failure: { color: "#B45309", fontWeight: "600", fontSize: 13 },
  link: { color: "#294880", textDecorationLine: "underline", fontWeight: "600", fontSize: 13, paddingVertical: 5 },
});
