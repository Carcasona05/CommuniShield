import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import BrowserSessionGate from "../components/BrowserSessionGate";
import useSessionEpoch from "../hooks/useSessionEpoch";
import apiClient from "../services/apiClient";

const percent = value => typeof value === "number" ? `${(value * 100).toFixed(2)}%` : "Unavailable";
const title = value => value ? value.charAt(0).toUpperCase() + value.slice(1) : "Unclear";
const tones = { positive: "#16734B", negative: "#B43C3C", neutral: "#294880", mixed: "#815A15", unclear: "#667085" };

export default function SentimentTest() {
  return <BrowserSessionGate><SentimentTestInner /></BrowserSessionGate>;
}

function SentimentTestInner() {
  const router = useRouter();
  const epoch = useSessionEpoch();
  const [access, setAccess] = useState("checking");
  const [text, setText] = useState("");
  const [models, setModels] = useState([]);
  const [statusWarning, setStatusWarning] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const request = useRef(0);
  const pending = useRef(false);

  useEffect(() => {
    let mounted = true;
    request.current++;
    setAccess("checking"); setResult(null); setText(""); setModels([]); setError(""); setBusy(false);
    apiClient.get("/sentiment/test", { cacheMode: "network" }).then(({ data }) => {
      if (mounted) { setAccess("allowed"); setModels(data.models || []); setStatusWarning(data.warning || ""); }
    }).catch(err => {
      if (!mounted) return;
      setAccess([401, 403].includes(err.response?.status) ? "denied" : "offline");
    });
    return () => { mounted = false; request.current++; };
  }, [epoch]);

  const run = async () => {
    if (pending.current || !text.trim() || access !== "allowed") return;
    pending.current = true;
    const sequence = ++request.current;
    setBusy(true); setError(""); setResult(null);
    try {
      const { data } = await apiClient.post("/sentiment/test", { text: text.trim() }, { timeout: 180000 });
      if (sequence === request.current) setResult({ ...data.prediction, testedText: text.trim() });
    } catch (err) {
      if (sequence === request.current) {
        if ([401, 403].includes(err.response?.status)) { setAccess("denied"); setText(""); setModels([]); }
        setError(err.response?.data?.error || "Could not complete the test. Check your connection and try again.");
      }
    } finally {
      pending.current = false;
      if (sequence === request.current) setBusy(false);
    }
  };

  if (access !== "allowed") return <View style={s.gate}>
    {access === "checking" ? <ActivityIndicator color="#294880" /> : <>
      <Text style={s.heading}>{access === "denied" ? "Restricted workspace" : "Connection unavailable"}</Text>
      <Text style={s.muted}>{access === "denied" ? "Sign in as an Admin or Super Admin to test sentiment." : "We could not verify access. Check your connection and reload this page."}</Text>
      <Pressable accessibilityRole="button" onPress={() => router.replace("/")} style={s.button}><Text style={s.buttonText}>Back to application</Text></Pressable>
    </>}
  </View>;

  const candidates = result?.decision?.candidates || [];
  return <ScrollView style={s.page} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
    <View style={s.container}>
      <View style={s.top}><Text style={s.brand}>COMMUNISHIELD / INTERNAL TOOLS</Text><Pressable accessibilityRole="button" onPress={() => router.replace("/")}><Text style={s.back}>Back to app ↗</Text></Pressable></View>
      <Text accessibilityRole="header" style={s.heading}>Sentiment test</Text>
      <Text style={s.subtitle}>Compare model predictions without publishing a post or comment.</Text>
      <View style={s.card}>
        <View style={s.row}><Text accessibilityRole="header" style={s.sectionTitle}>Model status</Text><Text style={s.counter}>Configuration at page load</Text></View>
        <Text style={s.muted}>Macro-F1 measures performance across a held-out dataset. It is not the confidence of an individual prediction.</Text>
        {models.map(model => <View key={model.id} style={s.statusCard}>
          <View style={s.row}><View style={s.statusName}><Text style={s.modelTitle}>{model.source === "builtin" ? "Built-in" : model.source === "gemini" ? "Gemini" : "Supporting model"}</Text><Text selectable style={s.modelId}>{model.name}</Text></View>
            <Text style={[s.statusBadge, model.status === "active" ? s.activeBadge : s.inactiveBadge]}>{title(model.status)}</Text></View>
          <View style={s.metrics}>{model.metrics?.length ? model.metrics.map(metric => <View key={metric.language} style={s.metric}>
            <Text style={s.modelTitle}>{title(metric.language)} · Test metrics</Text>
            {[["macroF1", "Macro-F1"], ["accuracy", "Accuracy"], ["precision", "Macro-precision"], ["recall", "Macro-recall"]].map(([key, label]) => <View key={key} style={s.metricLine}><Text style={s.metricLabel}>{label}</Text><Text style={s.metricScore}>{typeof metric[key] === "number" ? percent(metric[key]) : "Not available"}</Text></View>)}
          </View>) : <Text style={s.muted}>Test evaluation metrics: Not available</Text>}</View>
          <Text style={s.footnote}>{model.note}</Text>
        </View>)}
        {statusWarning ? <Text accessibilityRole="alert" style={s.error}>{statusWarning}</Text> : null}
      </View>
      <View style={s.card}>
        <View style={s.row}><Text style={s.label}>Text to analyse</Text><Text style={s.counter}>{text.length}/2,000</Text></View>
        <TextInput accessibilityLabel="Text to analyse" style={[s.input, s.textarea]} multiline maxLength={2000} value={text} onChangeText={setText} editable={!busy} placeholder="Enter a sentence in Cebuano, Filipino, or English…" placeholderTextColor="#7B8494" textAlignVertical="top" />
        <View style={s.actions}><Text style={s.notice}>Nothing is saved. Gemini tests send this text to Google and use API quota.</Text>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || !text.trim(), busy }} disabled={busy || !text.trim()} onPress={run} style={[s.button, (busy || !text.trim()) && s.disabled]}>
            {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}<Text style={s.buttonText}>{busy ? "Analysing…" : "Test sentiment"}</Text>
          </Pressable>
        </View>
        {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      </View>
      {result ? <View accessibilityLiveRegion="polite" style={s.card}>
        <View style={s.row}><Text style={s.label}>Final result</Text><Text style={s.pill}>RAW CONFIDENCE WINNER</Text></View>
        <View style={s.resultLine}><Text style={[s.verdict, { color: tones[result.label] || tones.unclear }]}>{title(result.label)}</Text><Text style={s.score}>{percent(result.confidence)}</Text></View>
        <Text style={s.muted}>{title(result.language)} · {result.decision?.winnerId ? `Winner: ${candidates.find(item => item.id === result.decision.winnerId)?.source || result.provider}` : result.decision?.reason === "conflicting_top_tie" ? "Conflicting predictions share the highest score." : "No eligible prediction reached 45%."}</Text>
        <Text selectable style={s.tested}>“{result.testedText}”</Text>
        <View style={s.separator} />
        <Text style={s.label}>Model comparison</Text>
        {candidates.map((item, index) => <View key={`${item.id}-${index}`} style={s.modelRow}>
          <View style={s.modelInfo}><Text style={s.modelTitle}>{item.source === "supporting" ? `Supporting model ${candidates.slice(0, index + 1).filter(c => c.source === "supporting").length}` : item.source === "gemini" ? "Gemini" : "Built-in"}{result.decision.winnerId === item.id ? " · Winner" : ""}</Text><Text selectable style={s.modelId}>{item.model}</Text></View>
          <View style={s.modelValue}><Text style={[s.modelTitle, { color: tones[item.label] || tones.unclear }]}>{title(item.label)} · {percent(item.confidence)}</Text><Text style={s.counter}>{title(item.band)}{!item.eligible ? " · Excluded" : ""}</Text></View>
        </View>)}
        <Text style={s.footnote}>Only available, enabled models appear. Missing sources may be disabled, unqualified, unavailable, or not configured. Below 45% is excluded; 85%+ is high. Scores are raw estimates—not guaranteed accuracy.</Text>
      </View> : null}
    </View>
  </ScrollView>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F4F6FA" },
  scroll: { flexGrow: 1, padding: 16, paddingTop: 28, paddingBottom: 48 },
  container: { width: "100%", maxWidth: 960, alignSelf: "center", gap: 18 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 },
  brand: { fontSize: 12, lineHeight: 20, fontWeight: "700", letterSpacing: 1, color: "#526176", flexShrink: 1 },
  back: { color: "#294880", fontSize: 13, fontWeight: "600", paddingVertical: 10 },
  heading: { color: "#172B4D", fontSize: 28, fontWeight: "700" },
  subtitle: { color: "#667085", fontSize: 14, lineHeight: 22, marginBottom: 8 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 14, borderWidth: 1, borderColor: "#E3E8EF", padding: 18, gap: 14, minWidth: 0 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 },
  label: { color: "#26364E", fontSize: 14, lineHeight: 22, fontWeight: "600" },
  counter: { color: "#526176", fontSize: 12, lineHeight: 20, flexShrink: 1 },
  input: { borderWidth: 1, borderColor: "#CBD3E0", borderRadius: 8, padding: 12, fontSize: 14, lineHeight: 22, color: "#172B4D", backgroundColor: "#FFFFFF" },
  textarea: { minHeight: 140 },
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginTop: 4 },
  notice: { color: "#526176", fontSize: 12, lineHeight: 20, flexGrow: 1, flexShrink: 1, flexBasis: 240 },
  button: { backgroundColor: "#294880", borderRadius: 8, minHeight: 44, paddingHorizontal: 20, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  buttonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" }, disabled: { opacity: 0.5 },
  error: { color: "#B42318", fontSize: 13, lineHeight: 20 },
  pill: { color: "#405775", backgroundColor: "#EEF2F8", fontSize: 11, lineHeight: 18, fontWeight: "700", letterSpacing: 0.4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 5, flexShrink: 1 },
  resultLine: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: 12 },
  verdict: { fontSize: 26, fontWeight: "700" }, score: { color: "#26364E", fontSize: 20, fontWeight: "600" },
  muted: { fontSize: 13, lineHeight: 21, color: "#667085" },
  tested: { color: "#475467", fontSize: 13, lineHeight: 22, marginTop: 2 },
  separator: { height: 1, backgroundColor: "#E9EDF3", marginVertical: 6 },
  modelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#EEF1F5" },
  modelInfo: { flexGrow: 1, flexShrink: 1, flexBasis: 230, minWidth: 0 }, modelValue: { gap: 3, flexShrink: 1, maxWidth: "100%" },
  modelTitle: { color: "#26364E", fontSize: 14, fontWeight: "600", lineHeight: 23, flexShrink: 1 },
  modelId: { color: "#526176", fontSize: 12, lineHeight: 20, flexShrink: 1, ...(typeof document !== "undefined" ? { overflowWrap: "anywhere" } : {}) },
  footnote: { color: "#526176", fontSize: 12, lineHeight: 20, marginTop: 4 },
  sectionTitle: { color: "#172B4D", fontSize: 17, fontWeight: "600", lineHeight: 26 },
  statusCard: { padding: 14, borderWidth: 1, borderColor: "#E3E8EF", borderRadius: 10, gap: 10, backgroundColor: "#FAFBFD", minWidth: 0 },
  statusName: { flexGrow: 1, flexShrink: 1, flexBasis: 200, minWidth: 0 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, fontSize: 12, fontWeight: "600", lineHeight: 20, borderRadius: 6 },
  activeBadge: { backgroundColor: "#E8F5ED", color: "#166343" }, inactiveBadge: { backgroundColor: "#E9EDF3", color: "#475467" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  metric: { flexBasis: 240, flexGrow: 1, minWidth: 0, padding: 12, borderRadius: 8, backgroundColor: "#FFFFFF", gap: 8 },
  metricLine: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: 6 },
  metricLabel: { fontSize: 13, lineHeight: 22, color: "#526176" },
  metricScore: { fontSize: 14, fontWeight: "600", lineHeight: 22, color: "#172B4D" },
  gate: { flex: 1, padding: 32, alignItems: "center", justifyContent: "center", gap: 18, backgroundColor: "#F4F6FA" },
});
