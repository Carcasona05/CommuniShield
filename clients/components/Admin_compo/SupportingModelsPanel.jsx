import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import apiClient from "../../services/apiClient";
import { getCachedPage } from "../../services/dataStore";
import useAutoRefresh from "../../hooks/useAutoRefresh";
import ConfirmModal from "../modals/ConfirmModal";
import { Disclosure, StatusBadge } from "./SentimentUi";
import SentimentActionButton from "./SentimentActionButton";
import SentimentClassMetrics from "./SentimentClassMetrics";
import { gateValue } from "../../services/trainingEvaluation";

export default function SupportingModelsPanel({ isSuperAdmin, servingEnabled, refreshKey = 0, onPoolChange }) {
  const [pool, setPool] = useState(() => getCachedPage("/sentiment/supporting-models", { page: 1 }) || null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [page, setPage] = useState(1);
  const pages = useRef(1);
  const sequence = useRef(0);
  const mounted = useRef(true);
  const previousRefreshKey = useRef(refreshKey);
  const refresh = useCallback(async ({ force = false } = {}) => {
    const request = ++sequence.current;
    try {
      const responses = [];
      for (let page = 1; page <= pages.current; page++) {
        responses.push(await apiClient.get("/sentiment/supporting-models", { params: { page }, ...(force ? { cacheMode: "network" } : {}) }));
        if (!mounted.current || request !== sequence.current) return;
      }
      if (!mounted.current || request !== sequence.current) return;
      const first = responses[0].data;
      if (responses.some(({ data }) => data.generation !== first.generation)) {
        if (!force) await refresh({ force: true });
        return;
      }
      setPool({ ...first, models: responses.flatMap(({ data }) => data.models) }); setError("");
    } catch (e) { if (mounted.current && request === sequence.current) setError(e.response?.data?.error || "Could not refresh supporting models."); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const force = previousRefreshKey.current !== refreshKey;
    previousRefreshKey.current = refreshKey;
    refresh({ force });
    return () => { mounted.current = false; sequence.current++; };
  }, [refresh, refreshKey]);
  useAutoRefresh(refresh, 60000);
  const action = async (kind, modelId = null, limit) => {
    if (kind !== "delete") { setConfirm({ action: kind, modelId, limit, generation: pool.generation }); return; }
    setBusy(true); setError("");
    try {
      const { data } = await apiClient.get(`/sentiment/supporting-models/${modelId}/delete-preview`, { cacheMode: "network" });
      if (mounted.current) setConfirm({ action: kind, modelId, generation: data.generation, datasets: data.datasets, archiveDatasets: [] });
    } catch (e) {
      // A failed preview never implies consent to archive any datasets.
      if (mounted.current) setConfirm({ action: kind, modelId, generation: pool.generation, datasets: [], archiveDatasets: [],
        previewError: "Linked datasets could not be verified. This will delete from the pool only; no datasets will be archived." });
    } finally { if (mounted.current) setBusy(false); }
  };
  const execute = async () => {
    setBusy(true);
    try {
      const { action, modelId, generation, limit, archiveDatasets } = confirm;
      await apiClient.post("/sentiment/supporting-models", { action, modelId, generation, limit, ...(archiveDatasets ? { archiveDatasets } : {}) });
      await refresh({ force: true }); await onPoolChange?.();
    }
    catch (e) { setError(e.response?.data?.error || "Pool action failed. Built-in models are unchanged."); }
    finally { setBusy(false); }
  };
  const more = async () => {
    const request = ++sequence.current;
    setBusy(true);
    try {
      const { data } = await apiClient.get("/sentiment/supporting-models", { params: { page: page + 1 } });
      if (!mounted.current || request !== sequence.current) return;
      if (data.generation !== pool.generation) { await refresh({ force: true }); return; }
      setPool((prior) => ({ ...data, models: [...prior.models, ...data.models.filter((m) => !prior.models.some((p) => p.id === m.id))] }));
      pages.current = page + 1;
      setPage((value) => value + 1);
    } catch (e) { setError(e.response?.data?.error || "Could not load more models."); }
    finally { setBusy(false); }
  };
  const button = (label, onPress, disabled = false) => <SentimentActionButton title={label} disabled={busy || disabled} onPress={onPress}
    variant={label === "Delete from pool" ? "danger" : label === "Enable" ? "primary" : "secondary"} />;
  const descriptions = {
    enable: "Enable only the qualified languages shown on this candidate? Failed or unincluded languages will not use it. Strong built-in predictions stay protected; qualified support may correct uncertain predictions. Weak or conflicting supporting predictions return unclear. Independent qualification alone does not prove combined-system improvement.",
    disable: "Disable this supporting model? It will no longer participate in new predictions after the registry refreshes. The built-in remains available.",
    restore: "Restore this archived model to disabled? Enabling it still requires a valid evaluated combination.",
    delete: "Permanently remove this model from the pool? History and private artifacts are retained. Optionally archive linked datasets below; nothing is selected automatically. Other models are unchanged.",
    set_limit: `Set the enabled supporting-model limit to ${confirm?.limit}? At most three models can be enabled.`,
  };
  return <View style={s.panel} testID="supporting-model-pool">
    <View style={s.between}><Text style={s.title}>Supporting models</Text><Text style={s.reviewPill}>Manual activation</Text></View>
    <Text style={s.note}>Review independent held-out results before enabling. Passing training never turns serving on automatically. Built-ins stay permanent; qualified support may correct an uncertain built-in result. Weak or conflicting supports return unclear, without voting.</Text>
    {!servingEnabled ? <Text style={s.warning}>Supporting inference is off. Enable SENTIMENT_SUPPORT_ENABLED=true on the backend only after setup and review.</Text> : null}
    {error ? <Text accessibilityRole="alert" style={s.warning}>{error}</Text> : null}
    {pool ? <>
      <Text style={s.note}>{pool.enabledCount} / {pool.maxEnabled} supporting models enabled</Text>
      {isSuperAdmin ? <View style={s.row}>{[1, 2, 3].map((limit) => <React.Fragment key={limit}>{button(`Limit ${limit}`, () => action("set_limit", null, limit), pool.maxEnabled === limit || pool.enabledCount > limit)}</React.Fragment>)}</View> : null}
      {!pool.models.length ? <Text style={s.note}>No supporting models registered yet.</Text> : null}
      {pool.models.map((model) => <View key={model.id} style={s.card} testID={`support-model-${model.id}`}>
        <View style={s.between}><Text style={s.title}>{model.name}</Text><StatusBadge status={model.status} label={model.status} /></View>
        <Text selectable style={s.note}>Version {model.id}</Text>
        <Text style={s.note}>Qualified languages: {Object.keys(model.routing_policy?.languages || {}).join(", ") || "None"}</Text>
        {model.metrics?.partial_pass ? <Text style={s.warning}>Partial result: only the qualified languages can serve. Other languages remain on their built-ins.</Text> : null}
        <Text style={s.note}>{model.use_count || 0} analyses using this model · {model.datasets?.length || 0} dataset versions</Text>
        {model.routing_policy?.version === 2 && model.routing_policy?.passed && model.metrics?.passed ? <View style={s.qualityBanner}><Text style={s.qualityText}>{model.metrics?.partial_pass ? 'Only the qualified languages passed · Manual review required' : model.status === "disabled" ? "Quality checks passed · Ready for super-admin review" : "Independent held-out quality checks passed"}</Text></View> : <Text style={s.warning}>{model.routing_policy?.version !== 2 ? "Legacy candidate: retrain under independent quality checks before enabling." : "Not eligible for enabling: independent quality checks must pass."}</Text>}
        <Disclosure title="Evaluation details" titleStyle={s.title}>
          <Text style={s.note}>Recorded candidate results, not a built-in comparison. Macro-F1 minimum: 60%; precision / recall minimum: 50% for each sentiment. Validation and test scores are labelled separately. Scores are not prediction certainty.</Text>
          <SentimentClassMetrics metrics={model.metrics} routingPolicy={model.routing_policy} />
          {Object.entries(model.routing_policy?.independent_test?.languages || {}).map(([language, result]) => <Text key={language} style={s.note}>{language}: {result.passed ? `accepted precision ${gateValue(result.precision)} on ${gateValue(result.support, true)} test predictions` : (result.reasons || []).join("; ")}</Text>)}
          <Text style={s.note}>Independent eligibility does not prove that adding this model improves the combined system.</Text>
          {(model.datasets || []).map((dataset) => <Text key={`${dataset.id}-${dataset.version}`} style={s.note}>Dataset {dataset.id} · version {dataset.version}</Text>)}
        </Disclosure>
        {isSuperAdmin ? <View style={s.row}>
          {model.status === "enabled" ? button("Disable", () => action("disable", model.id)) : null}
          {model.status === "disabled" ? <>{button("Enable", () => action("enable", model.id), model.routing_policy?.version !== 2 || !model.routing_policy?.passed || !model.metrics?.passed || pool.enabledCount >= pool.maxEnabled)}{button("Delete from pool", () => action("delete", model.id))}</> : null}
          {model.status === "archived" ? <>{button("Restore to disabled", () => action("restore", model.id))}{button("Delete from pool", () => action("delete", model.id))}</> : null}
        </View> : null}
      </View>)}
      {pool.models.length < pool.total ? button("View more supporting models", more) : null}
    </> : null}
    {confirm ? <ConfirmModal visible title={confirm.action === "delete" ? "Delete from pool?" : "Update supporting model pool?"} message={descriptions[confirm.action]} confirmLabel={confirm.action === "delete" ? (confirm.archiveDatasets?.length ? "Delete & archive" : "Delete from pool only") : "Confirm"} onClose={() => setConfirm(null)} onConfirm={execute}>
      {confirm.action === "delete" ? <View style={s.archiveOptions}>
        {confirm.previewError ? <Text accessibilityRole="alert" style={s.warning}>{confirm.previewError}</Text> : <>
          <Text style={s.title}>Also archive linked datasets (optional)</Text>
          <Text style={s.note}>Archiving excludes examples from future training. Shared, updated or already archived datasets cannot be selected. Existing results and models stay unchanged.</Text>
          {!confirm.datasets?.length ? <Text style={s.note}>No linked datasets found.</Text> : null}
          <ScrollView style={s.archiveList}>
            {(confirm.datasets || []).map((dataset) => {
              const blocked = dataset.shared || !dataset.unchanged || dataset.status === "archived";
              const checked = confirm.archiveDatasets.some((item) => item.id === dataset.id);
              return <Pressable key={dataset.id} accessibilityRole="checkbox" accessibilityLabel={`Archive ${dataset.name}`} accessibilityState={{ checked, disabled: blocked }} disabled={blocked} onPress={() => setConfirm((previous) => ({ ...previous,
                archiveDatasets: checked ? previous.archiveDatasets.filter((item) => item.id !== dataset.id) : [...previous.archiveDatasets, { id: dataset.id, version: dataset.version }],
              }))} style={[s.archiveRow, blocked && s.disabled]}>
                <Text style={s.title}>{checked ? "☑" : "☐"} {dataset.name}</Text>
                <Text style={s.note}>v{dataset.version} · {dataset.status}{dataset.shared ? " · Used by another model" : ""}{!dataset.unchanged ? " · Updated since training" : ""}</Text>
              </Pressable>;
            })}
          </ScrollView>
        </>}
      </View> : null}
    </ConfirmModal> : null}
  </View>;
}
const s = StyleSheet.create({
  archiveOptions: { width: "100%", gap: 8, marginBottom: 18 }, archiveList: { maxHeight: 180 },
  archiveRow: { paddingVertical: 10, gap: 4, borderBottomWidth: 1, borderBottomColor: "#EDF1F7" },
  panel: { gap: 12 }, card: { gap: 9, padding: 14, borderWidth: 1, borderColor: "#DFE6EF", borderRadius: 12, backgroundColor: "#FFFFFF" },
  reviewPill: { fontFamily: "PoppinsMedium", fontSize: 10, color: "#294880", backgroundColor: "#EDF2FC", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
  qualityBanner: { padding: 10, backgroundColor: "#EDF8F1", borderRadius: 8 },
  qualityText: { color: "#16794B", fontSize: 13, lineHeight: 21, fontFamily: "PoppinsMedium" },
  evaluationRow: { gap: 4, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#EDF1F7" },
  title: { fontSize: 14, lineHeight: 22, color: "#203B66", fontFamily: "PoppinsMedium" }, note: { fontSize: 13, lineHeight: 21, color: "#475569", fontFamily: "PoppinsRegular" },
  warning: { fontSize: 13, lineHeight: 21, color: "#80500C", fontFamily: "PoppinsRegular" }, row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  between: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
  button: { padding: 10, borderRadius: 8, backgroundColor: "#EEF2F8" }, buttonText: { fontSize: 11, color: "#294880", fontFamily: "PoppinsMedium" }, disabled: { opacity: 0.45 },
});
