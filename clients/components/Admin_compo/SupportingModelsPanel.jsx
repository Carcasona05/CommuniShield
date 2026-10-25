import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import apiClient from "../../services/apiClient";
import ConfirmModal from "../modals/ConfirmModal";
import { Disclosure, StatusBadge } from "./SentimentUi";

const f1 = (value) => Number.isFinite(Number(value)) && value != null ? Number(value).toFixed(3) : "—";
export default function SupportingModelsPanel({ isSuperAdmin, servingEnabled, refreshKey = 0 }) {
  const [pool, setPool] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [page, setPage] = useState(1);
  const pages = useRef(1);
  const sequence = useRef(0);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const responses = await Promise.all(Array.from({ length: pages.current }, (_, i) => apiClient.get(`/sentiment/supporting-models?page=${i + 1}`)));
      if (!mounted.current || request !== sequence.current) return;
      const first = responses[0].data;
      if (responses.some(({ data }) => data.generation !== first.generation)) return;
      setPool({ ...first, models: responses.flatMap(({ data }) => data.models) }); setError("");
    } catch (e) { if (mounted.current && request === sequence.current) setError(e.response?.data?.error || "Could not refresh supporting models."); }
  }, []);
  useEffect(() => { mounted.current = true; refresh(); const timer = setInterval(refresh, 10000); return () => { mounted.current = false; sequence.current++; clearInterval(timer); }; }, [refresh, refreshKey]);
  const action = (kind, modelId = null, limit) => setConfirm({ action: kind, modelId, limit, generation: pool.generation });
  const execute = async () => {
    setBusy(true);
    try { await apiClient.post("/sentiment/supporting-models", confirm); await refresh(); }
    catch (e) { setError(e.response?.data?.error || "Pool action failed. Built-in models are unchanged."); }
    finally { setBusy(false); }
  };
  const more = async () => {
    const request = ++sequence.current;
    setBusy(true);
    try {
      const { data } = await apiClient.get(`/sentiment/supporting-models?page=${page + 1}`);
      if (!mounted.current || request !== sequence.current) return;
      if (data.generation !== pool.generation) { await refresh(); return; }
      setPool((prior) => ({ ...data, models: [...prior.models, ...data.models.filter((m) => !prior.models.some((p) => p.id === m.id))] }));
      pages.current = page + 1;
      setPage((value) => value + 1);
    } catch (e) { setError(e.response?.data?.error || "Could not load more models."); }
    finally { setBusy(false); }
  };
  const button = (label, onPress, disabled = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={busy || disabled} onPress={onPress} style={[s.button, (busy || disabled) && s.disabled]}><Text style={s.buttonText}>{label}</Text></Pressable>;
  const descriptions = {
    enable: "Enable only the qualified languages shown on this candidate? Failed or unincluded languages will not use it. Built-in-first routing remains; qualified disagreement returns unclear. This does not prove combined-system improvement.",
    disable: "Disable this supporting model? It will no longer participate in new predictions after the registry refreshes. The built-in remains available.",
    archive: "Archive this disabled model? It will not be used for predictions.",
    restore: "Restore this archived model to disabled? Enabling it still requires a valid evaluated combination.",
    delete: "Permanently remove this archived model from the pool? Audit records and private artifacts are retained for history and safe in-flight requests. Datasets and other models are not deleted.",
    set_limit: `Set the enabled supporting-model limit to ${confirm?.limit}? At most three models can be enabled.`,
  };
  return <View style={s.panel} testID="supporting-model-pool">
    <View style={s.between}><Text style={s.title}>Supporting models</Text><Text style={s.reviewPill}>Manual activation</Text></View>
    <Text style={s.note}>Review independent held-out results before enabling. Passing training never turns serving on automatically. Built-ins stay permanent; qualified disagreement returns unclear, without voting.</Text>
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
        <Disclosure title="Evaluation details">
          <Text style={s.note}>Held-out candidate results, not a built-in comparison. Macro-F1 target: 0.60; per-class precision / recall: 0.50. Scores are not prediction certainty.</Text>
          {Object.entries(model.metrics?.languages || {}).map(([language, result]) => <View key={language} style={s.evaluationRow}><Text style={s.title}>{language}</Text><Text style={s.note}>Candidate macro-F1: {f1(result.candidate?.macro_f1)} · target 0.600</Text>{Object.entries(result.candidate?.per_class || {}).map(([label, values]) => <Text key={label} style={s.note}>{label}: precision {f1(values.precision)} · recall {f1(values.recall)} · {values.support} test examples</Text>)}</View>)}
          {Object.entries(model.routing_policy?.independent_test?.languages || {}).map(([language, result]) => <Text key={language} style={s.note}>{language}: {result.passed ? `accepted precision ${f1(result.precision)} on ${result.support} test predictions` : (result.reasons || []).join("; ")}</Text>)}
          <Text style={s.note}>Independent eligibility does not prove that adding this model improves the combined system.</Text>
          {(model.datasets || []).map((dataset) => <Text key={`${dataset.id}-${dataset.version}`} style={s.note}>Dataset {dataset.id} · version {dataset.version}</Text>)}
        </Disclosure>
        {isSuperAdmin ? <View style={s.row}>
          {model.status === "enabled" ? button("Disable", () => action("disable", model.id)) : null}
          {model.status === "disabled" ? <>{button("Enable", () => action("enable", model.id), model.routing_policy?.version !== 2 || !model.routing_policy?.passed || !model.metrics?.passed || pool.enabledCount >= pool.maxEnabled)}{button("Archive", () => action("archive", model.id))}</> : null}
          {model.status === "archived" ? <>{button("Restore to disabled", () => action("restore", model.id))}{button("Delete from pool", () => action("delete", model.id))}</> : null}
        </View> : null}
      </View>)}
      {pool.models.length < pool.total ? button("View more supporting models", more) : null}
    </> : null}
    {confirm ? <ConfirmModal visible title="Update supporting model pool?" message={descriptions[confirm.action]} confirmLabel="Confirm" onClose={() => setConfirm(null)} onConfirm={execute} /> : null}
  </View>;
}
const s = StyleSheet.create({
  panel: { gap: 12 }, card: { gap: 9, padding: 14, borderWidth: 1, borderColor: "#DFE6EF", borderRadius: 12, backgroundColor: "#FFFFFF" },
  reviewPill: { fontFamily: "PoppinsMedium", fontSize: 10, color: "#294880", backgroundColor: "#EDF2FC", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
  qualityBanner: { padding: 10, backgroundColor: "#EDF8F1", borderRadius: 8 },
  qualityText: { color: "#16794B", fontSize: 11, fontFamily: "PoppinsMedium" },
  evaluationRow: { gap: 4, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#EDF1F7" },
  title: { fontSize: 13, color: "#294880", fontFamily: "PoppinsMedium" }, note: { fontSize: 11, lineHeight: 18, color: "#64748B" },
  warning: { fontSize: 11, lineHeight: 18, color: "#946212" }, row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  between: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
  button: { padding: 10, borderRadius: 8, backgroundColor: "#EEF2F8" }, buttonText: { fontSize: 11, color: "#294880", fontFamily: "PoppinsMedium" }, disabled: { opacity: 0.45 },
});
