import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import apiClient from "../../services/apiClient";
import ConfirmModal from "../modals/ConfirmModal";
import { useToast } from "../Toast";
import { Ionicons } from "@expo/vector-icons";
import { Disclosure, EmptyState, StatusBadge } from "./SentimentUi";

const percentage = (value) => value != null && Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(1)}%` : "—";
const shortId = (id) => id ? id.slice(0, 8) : "Built-in model";
const STAGES = ["Queued", "Training", "Checking", "Ready"];

export default function SentimentTrainingPanel({ isSuperAdmin, refreshKey = 0 }) {
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const sequence = useRef(0);
  const refreshRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      const request = ++sequence.current;
      try {
        const { data } = await apiClient.get("/sentiment/training");
        if (mounted && request === sequence.current) { setStatus(data); setError(""); }
      } catch (err) {
        if (mounted && request === sequence.current) setError(err.response?.data?.error || "Could not load training status.");
      }
    };
    refreshRef.current = refresh;
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => { mounted = false; sequence.current++; clearInterval(timer); };
  }, [refreshKey]);

  const act = async ({ action, jobId, generation }) => {
    setBusy(true); setError("");
    try {
      await apiClient.post("/sentiment/training", { action, jobId, generation });
      toast?.success(action === "queue" ? "Training queued." : action === "activate" ? "Model activated." : "Previous model restored.");
      await refreshRef.current?.();
    } catch (err) {
      const message = err.response?.data?.error || "Training action failed. The current model is unchanged.";
      setError(message); toast?.error(message);
    } finally { setBusy(false); }
  };
  const button = (label, onPress, disabled = false, primary = false, icon) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled || busy} onPress={onPress} style={[s.button, primary && s.primaryButton, (disabled || busy) && s.disabled]}>{icon ? <Ionicons name={icon} size={16} color={primary ? "#FFFFFF" : "#294880"} /> : null}<Text style={[s.buttonText, primary && { color: "#FFFFFF" }]}>{label}</Text></Pressable>;
  const state = status?.state;
  const running = status?.jobs?.some((job) => ["training", "evaluating"].includes(job.status) && Date.parse(job.lease_until) > Date.now());
  const confirm = (action, jobId) => setConfirmation({ action, jobId, generation: state?.generation });
  const jobs = status?.jobs || [];
  const staleJob = (job) => Number(job.data_revision) !== Number(state?.data_revision) || Number(job.base_generation) !== Number(state?.generation);
  const focus = jobs.find((job) => ["training", "evaluating"].includes(job.status)) || jobs.find((job) => job.status === "queued") || jobs.find((job) => job.status === "ready" && job.id !== state?.active_job_id && !staleJob(job)) || jobs[0];
  const otherJobs = jobs.filter((job) => job.id !== focus?.id);

  const renderJob = (job, compact = false) => {
    const active = state?.active_job_id === job.id;
    const stale = !active && job.status === "ready" && staleJob(job);
    const expired = ["training", "evaluating"].includes(job.status) && Date.parse(job.lease_until) <= Date.now();
    const stage = { queued: 0, training: 1, evaluating: 2, ready: 3 }[job.status] ?? -1;
    const canActivate = job.status === "ready" && !active;
    return <View style={s.job} key={job.id}>
      <View style={s.between}><Text style={s.label}>Training run</Text><StatusBadge status={active ? "active" : expired ? "failed" : stale ? "outdated" : job.status} label={expired ? "Interrupted" : undefined} /></View>
      <Text style={s.note}>{new Date(job.created_at).toLocaleString()}</Text>
      {!compact && stage >= 0 ? <View style={s.progress}>
        {STAGES.map((label, index) => <View key={label} style={s.stage}>
          <View style={[s.stageCircle, index <= stage && s.stageReached]}>{index < stage || active ? <Ionicons name="checkmark" size={12} color="#FFFFFF" /> : <Text style={[s.stageNumber, index <= stage && { color: "#FFFFFF" }]}>{index + 1}</Text>}</View>
          <Text style={[s.stageLabel, index <= stage && { color: "#294880" }]}>{label}</Text>
        </View>)}
      </View> : null}
      {!compact ? <Text style={s.message}>{active ? "This model is in use." : expired ? "Training was interrupted." : stale ? "Newer data or a model update is available." : job.status === "ready" ? isSuperAdmin ? "Training complete. Ready to activate." : "Training complete. Awaiting activation." : job.status === "queued" ? "Waiting to start." : job.status === "training" ? "Learning from approved examples…" : job.status === "evaluating" ? "Checking the new model…" : "This run could not be completed."}</Text> : null}
      {expired ? <Text style={s.warning}>Training interrupted. Restart the worker and try again.</Text> : null}
      {job.status === "failed" && job.error ? <Text numberOfLines={2} style={s.error}>{job.error}</Text> : null}
      {job.metrics?.languages && !compact ? <View style={s.scoreTable}>
        <View style={s.scoreRow}><Text style={[s.note, s.language]}>Evaluation score (F1)</Text><Text style={s.scoreHeading}>Before</Text><Text style={s.scoreHeading}>New</Text></View>
        {Object.entries(job.metrics.languages).map(([language, result]) => <View style={s.scoreRow} key={language}>
          <Text style={[s.note, s.language, { textTransform: "capitalize" }]}>{language}</Text><Text style={s.score}>{percentage(result.baseline?.macro_f1)}</Text><Text style={[s.score, { color: Number(result.candidate?.macro_f1) >= Number(result.baseline?.macro_f1) ? "#16794B" : "#946212" }]}>{percentage(result.candidate?.macro_f1)}</Text>
        </View>)}
      </View> : null}
      {isSuperAdmin && canActivate ? button("Activate candidate", () => confirm("activate", job.id), !status.registryEnabled || stale || running || !job.metrics?.passed, true, "checkmark-circle-outline") : null}
      <Disclosure title="Run details">
        <Text selectable style={s.note}>Run {job.id}</Text>
        {Array.isArray(job.datasets) ? <Text style={s.note}>{job.datasets.length} approved dataset versions included.</Text> : null}
        {job.status === "queued" ? <Text style={s.note}>The Python worker starts this job after a short batching window. If it stays queued, check that the worker is running.</Text> : null}
        {job.error ? <Text style={s.error}>{job.error}</Text> : null}
        {stale ? <Text style={s.warning}>Queue fresh training before activating this candidate.</Text> : null}
        {compact && job.metrics?.languages ? Object.entries(job.metrics.languages).map(([language, result]) => <Text style={s.note} key={language}>{language}: {percentage(result.baseline?.macro_f1)} → {percentage(result.candidate?.macro_f1)}</Text>) : null}
        {job.metrics?.data ? <Text style={s.note}>{job.metrics.data.accepted} examples added · {job.metrics.data.duplicates} duplicates skipped · {job.metrics.data.held_out} held-out examples excluded.</Text> : null}
        {job.metrics?.data?.baseline_train_holdout_excluded ? <Text style={s.note}>{job.metrics.data.baseline_train_holdout_excluded} training/holdout overlaps excluded from this snapshot.</Text> : null}
        {job.metrics?.data?.heldout_conflicting_keys ? <Text style={s.warning}>{job.metrics.data.heldout_conflicting_keys} holdout phrases have conflicting labels. Review the benchmark quality.</Text> : null}
        {(job.metrics?.reasons || []).map((reason, index) => <Text style={s.error} key={`${index}-${reason}`}>{reason}</Text>)}
      </Disclosure>
    </View>;
  };

  return <View style={s.panel} testID="sentiment-training-jobs">
    <View style={s.between}><Text style={s.title}>Model status</Text><Pressable accessibilityRole="button" accessibilityLabel="Refresh training" disabled={busy} onPress={() => refreshRef.current?.()} style={s.iconButton}><Ionicons name="refresh-outline" size={18} color="#294880" /></Pressable></View>
    {error ? <View style={s.errorCard}><Text accessibilityRole="alert" style={s.error}>{status ? "Could not refresh training." : "Training is unavailable."}</Text><Disclosure title="Setup details"><Text style={s.note}>{error}</Text></Disclosure></View> : null}
    {busy ? <ActivityIndicator color="#294880" /> : null}
    {state ? <>
      <View style={s.activeCard}><View style={s.activeIcon}><Ionicons name="shield-checkmark-outline" size={22} color="#16794B" /></View><View style={{ flex: 1 }}><Text style={s.note}>Currently in use</Text><Text style={s.label}>{shortId(state.active_job_id)}</Text></View><StatusBadge status="active" /></View>
      {!status.registryEnabled ? <Text style={s.warning}>Model activation is disabled.</Text> : null}
      {focus ? renderJob(focus) : <EmptyState icon="pulse-outline" title="No training runs yet" message={isSuperAdmin ? "Approve a dataset to start training." : "Training starts after a dataset is approved."} />}
      {otherJobs.length ? <Disclosure title={`Previous runs (${otherJobs.length})`}>{otherJobs.map((job) => renderJob(job, true))}</Disclosure> : null}
      {isSuperAdmin ? <Disclosure title="Model controls">
        <View style={s.row}>{button("Queue retraining", () => confirm("queue"), false, false, "refresh-outline")}{state.active_job_id ? button("Roll back model", () => confirm("rollback"), !status.registryEnabled || running) : null}</View>
        <Text style={s.note}>Use these controls to retry training or restore the previous model.</Text>
      </Disclosure> : null}
      <Disclosure title="How training works">
        <Text style={s.note}>Approval queues training. Once quality checks pass, a super admin activates the model. Existing report results stay unchanged.</Text>
        {!status.registryEnabled ? <Text style={s.note}>Enable SENTIMENT_MODEL_REGISTRY_ENABLED on the backend to activate models.</Text> : null}
        <Text style={s.note}>Model generation: {state.generation}. Status updates every 10 seconds.</Text>
      </Disclosure>
    </> : null}
    {confirmation ? <ConfirmModal visible title={confirmation.action === "queue" ? "Queue retraining?" : confirmation.action === "activate" ? "Activate candidate?" : "Restore the previous model?"} message={confirmation.action === "queue" ? "Train a new candidate using approved data? The active model stays unchanged." : confirmation.action === "activate" ? "Use this model for new analyses? The update takes up to 30 seconds." : "Restore the previous model? It may not include the latest approved data."} confirmLabel="Confirm" onClose={() => setConfirmation(null)} onConfirm={() => act(confirmation)} /> : null}
  </View>;
}

const s = StyleSheet.create({
  panel: { gap: 16 },
  title: { fontFamily: "PoppinsSemiBold", fontSize: 14, color: "#294880" },
  label: { fontFamily: "PoppinsMedium", fontSize: 13, color: "#294880" },
  note: { fontFamily: "PoppinsRegular", fontSize: 11, lineHeight: 18, color: "#64748B" },
  warning: { color: "#946212", fontSize: 11, lineHeight: 18 },
  error: { color: "#B93838", fontSize: 12, lineHeight: 18 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: { backgroundColor: "#EEF2F8", padding: 12, borderRadius: 9, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
  primaryButton: { backgroundColor: "#294880" },
  buttonText: { fontFamily: "PoppinsMedium", fontSize: 11, color: "#294880" },
  disabled: { opacity: 0.45 },
  job: { borderWidth: 1, borderColor: "#E5ECF5", borderRadius: 12, padding: 16, gap: 10, backgroundColor: "#FFFFFF" },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  iconButton: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#F0F4FA", alignItems: "center", justifyContent: "center" },
  activeCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderWidth: 1, borderColor: "#DCEEE3", backgroundColor: "#F4FAF6", borderRadius: 12 },
  activeIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: "#E6F3EA", alignItems: "center", justifyContent: "center" },
  errorCard: { padding: 12, backgroundColor: "#FFF7F4", borderRadius: 10, gap: 8 },
  message: { fontFamily: "PoppinsMedium", fontSize: 12, color: "#506583", lineHeight: 19 },
  progress: { flexDirection: "row", paddingVertical: 8, backgroundColor: "#F7F9FD", borderRadius: 10 },
  stage: { flex: 1, alignItems: "center", gap: 6 },
  stageCircle: { width: 23, height: 23, borderRadius: 12, backgroundColor: "#E5EBF4", alignItems: "center", justifyContent: "center" },
  stageReached: { backgroundColor: "#294880" },
  stageNumber: { fontSize: 10, color: "#8A9AB3", fontFamily: "PoppinsMedium" },
  stageLabel: { fontSize: 9, color: "#8A9AB3", fontFamily: "PoppinsMedium" },
  scoreTable: { backgroundColor: "#F8FAFD", padding: 10, borderRadius: 9, gap: 8 },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  language: { flex: 1, minWidth: 0 },
  scoreHeading: { width: 48, textAlign: "right", fontSize: 10, color: "#8A9AB3" },
  score: { width: 48, textAlign: "right", fontFamily: "PoppinsMedium", fontSize: 11, color: "#64748B" },
});
