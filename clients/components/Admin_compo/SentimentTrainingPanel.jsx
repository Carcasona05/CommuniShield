import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import apiClient from "../../services/apiClient";
import { getCache } from "../../services/dataStore";
import useAutoRefresh from "../../hooks/useAutoRefresh";
import ConfirmModal from "../modals/ConfirmModal";
import { useToast } from "../Toast";
import { Ionicons } from "@expo/vector-icons";
import { Disclosure, EmptyState, StatusBadge } from "./SentimentUi";
import SupportingModelsPanel from "./SupportingModelsPanel";
import TrainingEvaluation from "./TrainingEvaluation";
import TrainingProgressBar from "./TrainingProgressBar";
import SentimentActionButton from "./SentimentActionButton";
import { trainingProgress } from "../../services/trainingProgress";

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
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    let mounted = true;
    const refresh = async ({ force = false } = {}) => {
      const request = ++sequence.current;
      try {
        const { data } = await apiClient.get("/sentiment/training", force ? { cacheMode: "network" } : {});
        if (mounted && request === sequence.current) { setStatus(data); setError(""); }
      } catch (err) {
        if (mounted && request === sequence.current) setError(err.response?.data?.error || "Could not load training status.");
      }
    };
    refreshRef.current = refresh;
    refresh();
    return () => { mounted = false; sequence.current++; };
  }, [refreshKey]);

  const trainingActive = status?.jobs?.some((job) => ["queued", "training", "evaluating"].includes(job.status));
  useAutoRefresh(() => refreshRef.current?.({ force: Boolean(trainingActive) }), trainingActive ? 10000 : 60000, { minimumInterval: 10000 });
  // Independent of HTTP completion: a hung/offline status request must not keep
  // an old "Training" label alive while heartbeats have already gone missing.
  useAutoRefresh(() => setNow(Date.now()), trainingActive ? 10000 : 60000, { minimumInterval: 10000 });

  const act = async ({ action, jobId, generation, mode = "continue", datasetIds, retryJobId }) => {
    setBusy(true); setError("");
    try {
      await apiClient.post("/sentiment/training", { action, jobId, generation, mode, ...(datasetIds?.length ? {datasetIds} : {}), ...(retryJobId ? { retryJobId } : {}) });
      toast?.success(mode === "fresh" ? "Fresh challenger queued. Built-in models are unchanged." : "Supporting-model training queued. Built-in models are unchanged.");
      setSelectedDatasetIds([]);
      await refreshRef.current?.({ force: true });
    } catch (err) {
      const message = err.response?.data?.error || "Training action failed. The current model is unchanged.";
      setError(message); toast?.error(message);
    } finally { setBusy(false); }
  };
  const button = (label, onPress, disabled = false, primary = false, icon) => <SentimentActionButton title={label} disabled={disabled || busy} onPress={onPress} variant={primary ? "primary" : "secondary"} icon={icon} />;
  const state = status?.state;
  const independent = status?.independentAdmission;
  const summary = status?.poolSummary;
  const setupReady = independent && status?.languageScopedTraining && status?.supportingPool && status?.registryEnabled;
  const confirm = (action, jobId, mode = "continue") => setConfirmation({ action, jobId, generation: state?.generation, mode, datasetIds:selectedDatasetIds });
  const jobs = status?.jobs || [];
  const focus = jobs.find((job) => ["training", "evaluating"].includes(job.status) && !trainingProgress(job, now).interrupted)
    || jobs.find((job) => job.status === "queued");
  const hasReadyData = summary?.queueSummaryVersion === 1 &&
    (summary.readyToQueueExamples > 0 || summary.readyToQueueDatasets > 0);
  const showCurrentTraining = Boolean(focus || hasReadyData);
  const queueDisabled = !setupReady || !hasReadyData || Boolean(focus);
  const latestJob = jobs[0];
  const canRetry = setupReady && !focus && !hasReadyData && summary?.approvedExamples > 0 && latestJob &&
    (latestJob.status === "failed" || trainingProgress(latestJob, now).interrupted) &&
    latestJob.data_revision === state?.data_revision;
  const otherJobs = jobs.filter((job) => job.id !== focus?.id);

  const renderJob = (job, compact = false) => {
    const worker = trainingProgress(job, now);
    const expired = worker.interrupted;
    const stage = { queued: 0, training: 1, evaluating: 2, ready: 3 }[job.status] ?? -1;
    const canActivate = job.status === "ready" && !active;
    return <View style={s.job} key={job.id}>
      <View style={s.between}><Text style={s.label}>Training run</Text><StatusBadge status={expired ? "failed" : worker.disconnected ? "outdated" : job.status} label={expired ? "Interrupted" : worker.disconnected ? "Worker disconnected" : undefined} /></View>
      <Text style={s.note}>{new Date(job.created_at).toLocaleString()}</Text>
      {Array.isArray(job.training_languages) ? <Text style={s.note}>Languages in this run: {job.training_languages.join(', ')}</Text> : null}
      {!compact ? <TrainingProgressBar job={job} now={now} /> : null}
      {!compact && stage >= 0 && !worker.stopped && !worker.disconnected ? <View style={s.progress}>
        {STAGES.map((label, index) => <View key={label} style={s.stage}>
          <View style={[s.stageCircle, index <= stage && s.stageReached]}>{index < stage || active ? <Ionicons name="checkmark" size={12} color="#FFFFFF" /> : <Text style={[s.stageNumber, index <= stage && { color: "#FFFFFF" }]}>{index + 1}</Text>}</View>
          <Text style={[s.stageLabel, index <= stage && { color: "#294880" }]}>{label}</Text>
        </View>)}
      </View> : null}
      {!compact && !(job.metrics?.admission === "independent-v1" && job.metrics?.passed === false) ? <Text style={s.message}>{expired ? "Training was interrupted." : worker.disconnected ? "Worker heartbeat missing. Training is not confirmed active; the worker or network may be offline." : job.status === "ready" ? "Candidate registered. Review its quality results and serving status in Supporting models." : job.status === "queued" ? "Waiting to start." : job.status === "training" ? "Training a supporting candidate without modifying built-in models…" : job.status === "evaluating" ? "Checking held-out candidate quality and support thresholds…" : job.metrics?.passed === false ? "Training finished, but the candidate did not pass all required quality checks. Nothing was enabled." : "This run could not be completed."}</Text> : null}
      {expired ? <Text style={s.warning}>Training interrupted. Restart the worker, then queue a retry if needed.</Text> : null}
      {job.status === "failed" && job.error && !(job.metrics?.admission === "independent-v1" && job.metrics?.languages) ? <Text style={s.error}>{job.error}</Text> : null}
      {job.metrics?.languages && !compact ? <TrainingEvaluation metrics={job.metrics} /> : null}
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
    <View style={s.between}><View style={s.headerText}><Text style={s.eyebrow}>SENTIMENT WORKSPACE</Text><Text style={s.title}>Train, evaluate & review</Text><Text style={s.note}>Track real worker progress and review quality before enabling a candidate.</Text></View><SentimentActionButton title={loading ? "Refreshing…" : "Refresh"} accessibilityLabel="Refresh" icon="refresh-outline" disabled={busy || loading} onPress={() => { setPoolRefreshKey((value) => value + 1); refreshRef.current?.({ force: true }); }} /></View>
    {error ? <View style={s.errorCard}><Text accessibilityRole="alert" style={s.error}>{status ? "Could not refresh training." : "Training is unavailable."}</Text><Disclosure title="Setup details"><Text style={s.note}>{error}</Text></Disclosure></View> : null}
    {busy ? <ActivityIndicator color="#294880" /> : null}
    {state ? <>
      <View style={s.introCard}><Text style={s.label}>Supporting-model workspace</Text><Text style={s.note}>Collect approved examples, train a candidate, inspect its held-out results, then enable it explicitly. The built-in always stays primary.</Text><View style={s.row}>{["1  Collect", "2  Train", "3  Evaluate", "4  Review & enable"].map((step) => <Text key={step} style={s.stepPill}>{step}</Text>)}</View></View>
      {independent && summary ? <View style={s.readiness} testID="ready-to-queue-pool">
        <View style={s.between}><Text style={s.label}>Ready to queue training</Text><Text style={s.note}>New approvals only</Text></View>
        {summary.queueSummaryVersion === 1 ? <>
          <View style={s.row}>{[[summary.readyToQueueExamples, "new approved examples"], [summary.readyToQueueDatasets, "approved datasets ready"]].map(([value, label]) => <View key={label} style={s.statCard}><Text style={s.statValue}>{value ?? 0}</Text><Text style={s.note}>{label}</Text></View>)}</View>
          {summary.readyToQueueExamples > 0 ? <>
            <View style={s.row}>{["cebuano", "english", "filipino"].filter((language) => summary.languages?.[language]?.total > 0).map((language) => { const counts = summary.languages[language]; return <View key={language} style={s.languageCard}><Text style={[s.label, { textTransform: "capitalize" }]}>{language}</Text><Text style={s.note}>{counts.total} new · {counts.negative} negative / {counts.neutral} neutral / {counts.positive} positive</Text></View>; })}</View>
            {status.languageScopedTraining ? <Text style={s.note}>Optional: select datasets to choose the training languages. With none selected, newly approved dataset versions determine the scope. Earlier approved examples remain available within those languages.</Text> : null}
            {summary.readyDatasets?.map((dataset) => <View key={`${dataset.id}-${dataset.version}`} style={s.approvedDataset}>
              {status.languageScopedTraining && isSuperAdmin ? <Pressable accessibilityRole="checkbox" accessibilityLabel={`Train languages from ${dataset.name}`} aria-checked={selectedDatasetIds.includes(dataset.id)} accessibilityState={{checked:selectedDatasetIds.includes(dataset.id)}} disabled={busy} onPress={() => setSelectedDatasetIds((ids) => ids.includes(dataset.id) ? ids.filter(id => id !== dataset.id) : [...ids,dataset.id])} style={s.row}><Ionicons name={selectedDatasetIds.includes(dataset.id) ? 'checkbox' : 'square-outline'} size={20} color="#294880" /><Text style={s.label}>{dataset.name}</Text></Pressable> : <Text style={s.label}>{dataset.name}</Text>}
              <Text style={s.note}>{dataset.exampleCount} new examples · approved by {dataset.approvedBy} · {new Date(dataset.approvedAt).toLocaleDateString()}</Text></View>)}
            {summary.readyToQueueDatasets > (summary.readyDatasets?.length || 0) ? <Text style={s.note}>Showing the {summary.readyDatasets?.length || 0} most recent approvals. Counts include all datasets ready to queue.</Text> : null}
          </> : <Text style={s.note}>No newly approved datasets are waiting for training.</Text>}
          <Text style={s.note}>Already-trained examples and datasets in a running job are not counted here. Earlier approved examples remain available in the full training data, including when you retry training.</Text>
          {status.languageScopedTraining && !summary.readyToQueueExamples ? <Text style={s.note}>With no new approvals, queueing again keeps the last run’s language scope. New approvals or explicit dataset choices can change it.</Text> : null}
        </> : <Text style={s.warning}>Apply sentiment_pending_training_summary.sql to show only newly approved examples. Cumulative totals are hidden to avoid counting already-trained data as new.</Text>}
      </View> : null}
      <View testID="current-model-section" style={s.currentModel}>
        <View style={s.activeCard}><View style={s.activeIcon}><Ionicons name="shield-checkmark-outline" size={22} color="#16794B" /></View><View style={{ flex: 1 }}><Text style={s.note}>Permanent primary</Text><Text style={s.label}>Built-in model</Text></View><StatusBadge status="active" /></View>
        {isSuperAdmin ? <View testID="current-model-controls" style={s.modelControls}>
          {button("Queue retraining", () => confirm("queue"), queueDisabled, false, "refresh-outline")}
          {status.freshCandidates ? button("Queue fresh challenger", () => confirm("queue", null, "fresh"), queueDisabled, true, "flash-outline") : null}
        </View> : null}
        {isSuperAdmin && !hasReadyData ? <Text style={s.note}>Queueing requires approved, untrained datasets. Previously trained data does not enable these buttons.</Text> : null}
        {isSuperAdmin && canRetry ? <View style={s.modelControls}>{button("Retry training", () => setConfirmation({ action: "queue", mode: latestJob.training_mode || "continue", generation: state?.generation, retryJobId: latestJob.id }), false, true, "refresh-outline")}</View> : null}
      </View>
      {!status.registryEnabled ? <Text style={s.warning}>SENTIMENT_MODEL_REGISTRY_ENABLED is off, so supporting candidates cannot be registered. Built-in models continue serving.</Text> : null}
      {!status.supportingPool ? <Text style={s.warning}>Apply sentiment_supporting_pool.sql and restart the backend/worker. Legacy registry models cannot replace the permanent primary.</Text> : null}
      {!independent ? <Text style={s.warning}>Apply sentiment_independent_admission.sql to enable independent quality checks. Approval and new training are paused until setup is complete; existing report results stay unchanged.</Text> : null}
      {independent && !status.languageScopedTraining ? <Text style={s.warning}>Apply sentiment_language_scoped_training.sql for language-specific training. Until then, the existing all-language requirements still apply.</Text> : null}
      {showCurrentTraining ? <View style={s.currentTraining} testID="current-training-section">
        <View style={s.sectionHeader}><Text style={s.sectionTitle}>Current training</Text><Text style={s.note}>{focus ? "Live updates while this page is active" : "Approved data is ready — training has not started"}</Text></View>
        {focus ? renderJob(focus) : <EmptyState icon="pulse-outline" title="Ready to start a training run" message={isSuperAdmin ? "Choose the datasets above, then queue retraining or a fresh challenger." : "A super admin can queue the approved datasets above for training."} />}
        {focus && !status.progressSupported ? <Text style={s.warning}>Percentage telemetry is unavailable. Apply sentiment_training_progress.sql and restart the worker. Stage reporting still works.</Text> : null}
      </View> : null}
      {status.supportingPool ? <SupportingModelsPanel isSuperAdmin={isSuperAdmin} servingEnabled={status.supportingServingEnabled} refreshKey={`${refreshKey}:${poolRefreshKey}`} /> : null}
      {otherJobs.length ? <Disclosure title={`Previous runs (${otherJobs.length})`}>{otherJobs.map((job) => renderJob(job, true))}</Disclosure> : null}
      {isSuperAdmin ? <Disclosure title="Model controls">
        <View style={s.row}>{button("Queue retraining", () => confirm("queue"), false, false, "refresh-outline")}{state.active_job_id ? button("Roll back model", () => confirm("rollback"), !status.registryEnabled || running) : null}</View>
        <Text style={s.note}>Use these controls to retry training or restore the previous model.</Text>
      </Disclosure> : null}
      <Disclosure title="How training works">
        <Text style={s.note}>Approval adds examples to the reviewed pool. Queue retraining continues existing weights with replay data; Queue fresh challenger learns a new vocabulary from the full training snapshot. Neither approach overwrites built-in files.</Text>
        <Text style={s.note}>With language-scoped training installed, dataset language columns select the languages to train. Each is checked separately; failed languages do not block passing ones and are never enabled. Other languages continue using the built-in. Quality requirements remain unchanged, and passing languages stay disabled for manual review.</Text>
        <Text style={s.note}>No improvement over the built-in is required or claimed by independent qualification alone. Strong built-in predictions stay protected. Qualified support may correct uncertain predictions; weak or conflicting supports return unclear. Existing report results stay unchanged until reanalysis.</Text>
        {!status.registryEnabled ? <Text style={s.note}>Enable SENTIMENT_MODEL_REGISTRY_ENABLED on the backend to register supporting candidates. It can never replace the built-in primary.</Text> : null}
        <Text style={s.note}>Model generation: {state.generation}. Active runs update every 10 seconds; idle checks are less frequent. A completed run still requires quality review and manual activation.</Text>
      </Disclosure>
    </> : null}
    {confirmation ? <ConfirmModal visible title={confirmation.retryJobId ? "Retry interrupted or failed training?" : confirmation.mode === "fresh" ? "Queue fresh challenger training?" : "Queue supporting-model training?"} message={confirmation.retryJobId ? "Queue a new attempt using the original approved dataset versions and training mode? The server rechecks eligibility. Quality checks still apply; nothing is enabled automatically." : confirmation.mode === "fresh"
      ? "Train a separate candidate from scratch on the full training snapshot? Independent held-out quality checks apply. A passing candidate stays disabled for super-admin review. The built-in is never replaced."
      : "Continue training a separate candidate using approved examples and replay data? Independent held-out quality checks apply. A passing candidate stays disabled until a super-admin enables it."} confirmLabel="Confirm" onClose={() => setConfirmation(null)} onConfirm={() => act(confirmation)} /> : null}
  </View>;
}

const s = StyleSheet.create({
  panel: { gap: 16 },
  currentTraining: { gap: 12 },
  introCard: { padding: 16, borderRadius: 12, backgroundColor: "#F3F6FC", gap: 10, borderWidth: 1, borderColor: "#DFE7F4" },
  readiness: { padding: 16, borderRadius: 12, gap: 12, borderWidth: 1, borderColor: "#E2EAF3", backgroundColor: "#FFFFFF" },
  stepPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: "#E5ECF8", color: "#294880", fontSize: 11, fontFamily: "PoppinsMedium" },
  statCard: { flex: 1, minWidth: 130, padding: 12, borderRadius: 10, backgroundColor: "#F5F8FC", gap: 3 },
  statValue: { fontFamily: "PoppinsSemiBold", fontSize: 24, color: "#294880" },
  languageCard: { flex: 1, minWidth: 160, padding: 10, borderWidth: 1, borderColor: "#E7EDF6", borderRadius: 9, gap: 4 },
  approvedDataset: { gap: 4, paddingVertical: 10, borderTopWidth: 1, borderTopColor: "#EDF1F6" },
  sectionHeader: { gap: 3 },
  title: { fontFamily: "PoppinsSemiBold", fontSize: 21, color: "#203B66" },
  headerText: { flex: 1, minWidth: 200, gap: 4 },
  eyebrow: { fontFamily: "PoppinsSemiBold", fontSize: 10, letterSpacing: 1.2, color: "#496792" },
  sectionTitle: { fontFamily: "PoppinsSemiBold", fontSize: 16, color: "#203B66" },
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
