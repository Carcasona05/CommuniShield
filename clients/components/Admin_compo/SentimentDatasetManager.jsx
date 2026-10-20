import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import apiClient from "../../services/apiClient";
import { useToast } from "../Toast";
import ConfirmModal from "../modals/ConfirmModal";
import { Ionicons } from "@expo/vector-icons";
import SentimentTrainingPanel from "./SentimentTrainingPanel";
import { Disclosure, EmptyState, SectionTabs, StatusBadge } from "./SentimentUi";

const LANGUAGES = ["english", "filipino", "cebuano"];
const LABELS = ["positive", "neutral", "negative"];
const INITIAL_SAMPLE = { text: "", language: "", label: "" };
const errorText = (error) => error.response?.data?.error || error.message || "Request failed. Please try again.";
const dateText = (value) => new Date(value).toLocaleString();

function Button({ title, onPress, disabled, secondary = false, icon, danger = false }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} style={[s.button, secondary && s.secondary, danger && s.dangerButton, disabled && s.disabled]}>
    {icon ? <Ionicons name={icon} size={16} color={danger ? "#B93838" : secondary ? "#294880" : "#FFFFFF"} /> : null}
    <Text style={[s.buttonText, secondary && s.secondaryText, danger && s.dangerText]}>{title}</Text>
  </Pressable>;
}
function InlineDropdown({ options, selectedValue, placeholder, displayPlaceholder, disabled, open, onToggle, onClose, onChange }) {
  const container = useRef(null);
  useEffect(() => {
    if (Platform.OS !== "web" || !open) return;
    const dismissOutside = (event) => {
      if (!container.current?.contains(event.target)) onClose();
    };
    const dismissEscape = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissEscape);
    };
  }, [open, onClose]);
  const selected = options.find((item) => item.value === selectedValue);
  return <View ref={container} style={s.selectContainer}>
    <Pressable accessibilityRole="button" accessibilityLabel={placeholder} accessibilityState={{ expanded: open, disabled }} disabled={disabled} onPress={onToggle} style={[s.selectTrigger, open && s.selectTriggerOpen, disabled && s.disabled]}>
      <Text style={[s.selectText, !selected && s.selectPlaceholder]}>{selected?.label || displayPlaceholder || placeholder}</Text>
      <Ionicons name={open ? "chevron-up" : "chevron-down"} size={17} color="#294880" />
    </Pressable>
    {open && !disabled ? <View style={s.selectMenu}>
      {options.map((item) => <Pressable key={item.value} accessibilityRole="button" accessibilityState={{ selected: item.value === selectedValue }} onPress={() => { onChange(item.value); onClose(); }} style={[s.selectOption, item.value === selectedValue && s.selectOptionSelected]}>
        <Text style={s.selectText}>{item.label}</Text>
        {item.value === selectedValue ? <Ionicons name="checkmark" size={17} color="#294880" /> : null}
      </Pressable>)}
    </View> : null}
  </View>;
}
function SampleFields({ sample, onChange, disabled }) {
  const [openField, setOpenField] = useState(null);
  const closeDropdown = useCallback(() => setOpenField(null), []);
  return <View style={s.stack}>
    <View style={s.between}><Text style={s.label}>Text / phrase</Text><Text style={s.counter}>{sample.text.length}/2000</Text></View>
    <TextInput accessibilityLabel="Training example text" multiline maxLength={2000} editable={!disabled} value={sample.text} onFocus={closeDropdown} onChangeText={(text) => onChange({ ...sample, text })} placeholder="Enter a real word, phrase, or sentence" style={[s.input, s.multiline]} />
    <View style={s.fieldRow}>
      <View style={s.fieldColumn}><Text style={s.label}>Language</Text>
        <InlineDropdown options={LANGUAGES.map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} selectedValue={sample.language} placeholder="Select language" displayPlaceholder="Select" disabled={disabled} open={openField === "language" && !disabled} onToggle={() => setOpenField(openField === "language" ? null : "language")} onClose={closeDropdown} onChange={(language) => onChange({ ...sample, language })} />
      </View>
      <View style={s.fieldColumn}><Text style={s.label}>Sentiment label</Text>
        <InlineDropdown options={LABELS.map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} selectedValue={sample.label} placeholder="Select sentiment label" displayPlaceholder="Select" disabled={disabled} open={openField === "label" && !disabled} onToggle={() => setOpenField(openField === "label" ? null : "label")} onClose={closeDropdown} onChange={(label) => onChange({ ...sample, label })} />
      </View>
    </View>
  </View>;
}
function Sheet({ title, children, onClose, busy, footer }) {
  return <Modal transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
    <View style={s.overlay}><View style={s.sheet}>
      <View style={s.heading}><Text style={s.title}>{title}</Text><Button title="Close" secondary disabled={busy} onPress={onClose} /></View>
      <ScrollView contentContainerStyle={s.sheetContent} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      {footer ? <View style={s.sheetFooter}>{footer}</View> : null}
    </View></View>
  </Modal>;
}

export default function SentimentDatasetManager({ embedded = false }) {
  const toast = useToast();
  const [sample, setSample] = useState(INITIAL_SAMPLE);
  const [datasets, setDatasets] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState(embedded ? "all" : "pending");
  const [activeTab, setActiveTab] = useState(embedded ? "add" : "datasets");
  const [filterOpen, setFilterOpen] = useState(false);
  const [detailTab, setDetailTab] = useState("examples");
  const [fileName, setFileName] = useState("");
  const [identity, setIdentity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState(null);
  const [csv, setCsv] = useState("");
  const [name, setName] = useState("");
  const [source, setSource] = useState("csv");
  const [preview, setPreview] = useState(null);
  const [previewPage, setPreviewPage] = useState(1);
  const [privateChecked, setPrivateChecked] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailPage, setDetailPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [reviewNote, setReviewNote] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [trainingRefreshKey, setTrainingRefreshKey] = useState(0);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const isSuperAdmin = identity?.role === "super_admin";

  const load = useCallback(async () => {
    const request = ++listRequest.current;
    setLoading(true);
    try {
      const [list, profile] = await Promise.all([
        apiClient.get("/sentiment/datasets", { params: { status, page } }), apiClient.get("/profile"),
      ]);
      if (request !== listRequest.current) return;
      setDatasets(list.data.datasets || []); setTotal(list.data.total || 0);
      // /profile returns the profile fields directly.
      setIdentity({ ...(profile.data.profile || profile.data), id: list.data.viewerId });
      setError("");
    } catch (err) { if (request === listRequest.current) setError(errorText(err)); }
    finally { if (request === listRequest.current) setLoading(false); }
  }, [page, status]);
  useEffect(() => { load(); return () => { listRequest.current++; }; }, [load]);

  const tell = (message) => { setNotice(message); toast?.success(message); };
  const fail = (err) => { const message = errorText(err); setError(message); toast?.error(message); };
  const resetPreview = () => { setPreview(null); setPrivateChecked(false); setPreviewPage(1); };
  const openImport = () => {
    setError(""); setNotice(""); setCsv(""); setFileName(""); setName(""); setSource("csv"); resetPreview(); setMode("import");
  };
  const makePreview = async (manual = false) => {
    setError(""); setBusy(true); resetPreview();
    if (manual) { setSource("manual"); setName(""); setMode("import"); }
    try {
      const { data } = await apiClient.post("/sentiment/datasets/preview", manual ? { rows: [sample] } : { csv });
      setPreview(data);
    } catch (err) { fail(err); }
    finally { setBusy(false); }
  };
  const chooseFile = () => {
    if (Platform.OS !== "web") return;
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".csv,text/csv";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!/\.csv$/i.test(file.name) || file.size > 2 * 1024 * 1024) { setError("Choose a .csv file no larger than 2 MB."); return; }
      try { setCsv(await file.text()); setFileName(file.name); resetPreview(); setError(""); }
      catch { setError("Could not read this CSV file."); }
    };
    input.click();
  };
  const save = async () => {
    setBusy(true); setError("");
    try {
      const rows = preview.rows.filter((row) => row.status === "valid").map(({ text, language, label }) => ({ text, language, label }));
      await apiClient.post("/sentiment/datasets", { name: name.trim(), source, rows, privacy_reviewed: privateChecked });
      setMode(null); setSample(INITIAL_SAMPLE); resetPreview(); setActiveTab("datasets"); setStatus("all"); setPage(1); tell("Dataset submitted for review."); await load();
    } catch (err) { fail(err); resetPreview(); }
    finally { setBusy(false); }
  };
  const openDetail = async (id, targetPage = 1) => {
    const request = ++detailRequest.current;
    setMode("detail"); setDetail(null); setDetailTab("examples"); setEditing(null); setReviewNote(""); setError(""); setBusy(true);
    try {
      const { data } = await apiClient.get(`/sentiment/datasets/${id}`, { params: { page: targetPage } });
      if (request === detailRequest.current) { setDetail(data); setDetailPage(targetPage); }
    } catch (err) { fail(err); }
    finally { if (request === detailRequest.current) setBusy(false); }
  };
  const editSample = async () => {
    setBusy(true); setError("");
    try {
      const { dataset } = detail;
      await apiClient.patch(`/sentiment/datasets/${dataset.id}/samples/${editing.id}`, { version: dataset.version, sample: { text: editing.text, language: editing.language, label: editing.label } });
      tell("Example updated.");
      await openDetail(dataset.id, detailPage); await load();
    } catch (err) { fail(err); }
    finally { setBusy(false); }
  };
  const review = async (action) => {
    setBusy(true); setError("");
    try {
      await apiClient.post(`/sentiment/datasets/${detail.dataset.id}/review`, { action, version: detail.dataset.version, note: reviewNote });
      setTrainingRefreshKey((value) => value + 1);
      tell(action === "approve" ? "Dataset approved. Training queued." : action === "reject" ? "Dataset rejected." : "Dataset archived."); await openDetail(detail.dataset.id, detailPage); await load();
    } catch (err) { fail(err); }
    finally { setBusy(false); }
  };
  const exportApproved = async (format) => {
    setBusy(true); setError("");
    try {
      const { data } = await apiClient.get(`/sentiment/datasets/${detail.dataset.id}/export`, { responseType: "text", params: { format } });
      if (Platform.OS === "web") {
        const url = URL.createObjectURL(new Blob([data], { type: format === "json" ? "application/json" : "text/csv;charset=utf-8" }));
        const link = document.createElement("a"); link.href = url; link.download = `sentiment-${detail.dataset.id}-v${detail.dataset.version}.${format}`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      tell("Export downloaded.");
    } catch (err) { fail(err); }
    finally { setBusy(false); }
  };
  const close = () => { detailRequest.current++; setMode(null); setError(""); setEditing(null); };
  const batch = detail?.dataset;
  const canEdit = batch?.status === "pending" && (isSuperAdmin || batch.created_by === identity?.id);
  const canArchive = batch && batch.status !== "archived" && (isSuperAdmin || canEdit);
  const validCount = preview?.rows.filter((row) => row.status === "valid").length || 0;

  return <View style={[s.card, embedded && s.embeddedCard]}>
    <View style={s.managerHeading}>
      <View style={s.headingIcon}><Ionicons name="layers-outline" size={21} color="#294880" /></View>
      <View style={s.flex}><Text style={s.title}>Sentiment Training Data</Text><Text style={s.note}>{embedded ? "Add examples and track their progress." : "Review datasets and manage model updates."}</Text></View>
    </View>
    <SectionTabs value={activeTab} disabled={busy} onChange={(tab) => { setActiveTab(tab); setNotice(""); setFilterOpen(false); }} options={embedded ? [
      { key: "add", label: "Add data" }, { key: "datasets", label: "Datasets" }, { key: "training", label: "Training" },
    ] : [
      { key: "datasets", label: "Datasets", icon: "folder-outline" }, { key: "training", label: "Training", icon: "pulse-outline" }, { key: "add", label: "Add data", icon: "add-circle-outline" },
    ]} />
    {!mode && error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    {notice ? <View style={s.successBanner}><Ionicons name="checkmark-circle" size={16} color="#16794B" /><Text style={s.success}>{notice}</Text></View> : null}
    {activeTab === "add" ? <View style={[s.stack, !embedded && s.formWidth]}>
      <View style={s.between}><Text style={s.subtitle}>New example</Text><Button title="Import datasets" icon="cloud-upload-outline" secondary onPress={openImport} disabled={busy} /></View>
      <SampleFields sample={sample} onChange={setSample} disabled={busy} />
      <Button title="Preview example" icon="arrow-forward-outline" disabled={busy || !sample.text.trim() || !sample.language || !sample.label} onPress={() => makePreview(true)} />
      <Disclosure title="Labeling tips"><Text style={s.note}>Label the emotion expressed, not the incident severity. Include enough context for slang or sarcasm.</Text></Disclosure>
    </View> : null}
    {activeTab === "datasets" ? <View style={s.stack}>
      <View style={s.between}><Text style={s.subtitle}>{total} dataset{total === 1 ? "" : "s"}</Text><Button title="Refresh" icon="refresh-outline" secondary onPress={load} disabled={loading || busy} /></View>
      <InlineDropdown placeholder="Filter datasets" options={[{ value: "all", label: "All datasets" }, { value: "pending", label: "Pending review" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }, { value: "archived", label: "Archived" }]} selectedValue={status} disabled={busy} open={filterOpen} onToggle={() => setFilterOpen(!filterOpen)} onClose={() => setFilterOpen(false)} onChange={(value) => { setStatus(value); setPage(1); }} />
      {loading ? <ActivityIndicator color="#294880" style={{ padding: 16 }} /> : null}
      {!loading && datasets.length === 0 ? <EmptyState title={status === "pending" ? "Nothing to review" : "No datasets here yet"} message={status === "pending" ? "New submissions will appear here." : "Add an example or import a CSV to get started."} /> : null}
      {datasets.map((item) => <Pressable accessibilityRole="button" key={item.id} disabled={busy} onPress={() => openDetail(item.id)} style={({ pressed }) => [s.datasetRow, pressed && { backgroundColor: "#EDF2FC" }]}>
        <View style={s.datasetIcon}><Ionicons name={item.source === "csv" ? "document-text-outline" : "create-outline"} size={20} color="#6A82A8" /></View>
        <View style={s.flex}>
          <View style={s.between}><Text numberOfLines={2} style={[s.subtitle, s.flex]}>{item.name}</Text><Ionicons name="chevron-forward" size={16} color="#9AAAC0" /></View>
          <Text style={s.note}>{item.sentiment_training_samples?.[0]?.count || 0} example{item.sentiment_training_samples?.[0]?.count === 1 ? "" : "s"} · {new Date(item.created_at).toLocaleDateString()}</Text>
          <StatusBadge status={item.status} />
        </View>
      </Pressable>)}
      {total > 10 ? <View style={s.between}><Button title="Prev" secondary disabled={page === 1 || loading || busy} onPress={() => setPage(page - 1)} /><Text style={s.note}>{page} / {Math.max(1, Math.ceil(total / 10))}</Text><Button title="Next" secondary disabled={page * 10 >= total || loading || busy} onPress={() => setPage(page + 1)} /></View> : null}
    </View> : null}
    {activeTab === "training" ? <SentimentTrainingPanel isSuperAdmin={isSuperAdmin} refreshKey={trainingRefreshKey} /> : null}

    {mode === "import" ? <Sheet title={source === "manual" ? "Review example" : "Import datasets"} busy={busy} onClose={close} footer={preview ? <Button title="Submit for review" icon="checkmark-outline" disabled={busy || !validCount || !name.trim() || !privateChecked} onPress={save} /> : null}>
      <Text style={s.label}>Dataset name</Text><TextInput accessibilityLabel="Dataset name" placeholder="Ex. Cebuano community feedback" placeholderTextColor="#8A94A6" maxLength={120} editable={!busy} value={name} onChangeText={setName} style={s.input} />
      {source === "csv" ? <>
        {Platform.OS === "web" ? <Pressable accessibilityRole="button" accessibilityLabel="Choose CSV file" disabled={busy} onPress={chooseFile} style={s.uploadZone}>
          <View style={s.headingIcon}><Ionicons name="cloud-upload-outline" size={24} color="#294880" /></View>
          <Text style={s.subtitle}>{fileName || "Choose CSV file"}</Text><Text style={s.note}>CSV · up to 2 MB · 1,000 examples</Text>
        </Pressable> : null}
        <Disclosure title="CSV format & example"><Text style={s.note}>Columns: text, language, label. Languages: english, filipino, cebuano. Labels: positive, neutral, negative.</Text><Text selectable style={s.code}>{'text,language,label\n"Maayo kaayo ang serbisyo",cebuano,positive'}</Text></Disclosure>
        <Text style={s.label}>CSV content</Text>
        <TextInput accessibilityLabel="CSV content" multiline editable={!busy} value={csv} onChangeText={(value) => { setCsv(value); setFileName(""); resetPreview(); }} placeholder="Or paste your CSV here…" style={[s.input, s.csv]} />
        <Button title="Validate & preview" disabled={busy || !csv.trim()} onPress={() => makePreview()} />
      </> : null}
      {busy ? <ActivityIndicator color="#294880" /> : null}
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      {preview ? <>
        <View style={s.previewSummary}><Ionicons name={validCount ? "checkmark-circle-outline" : "alert-circle-outline"} size={22} color={validCount ? "#16794B" : "#B93838"} /><View style={s.flex}><Text style={s.subtitle}>{validCount} valid / {preview.rows.length} total</Text>{validCount < preview.rows.length ? <Text style={s.note}>{preview.rows.length - validCount} rows will be skipped.</Text> : null}</View></View>
        {preview.rows.slice((previewPage - 1) * 20, previewPage * 20).map((item) => <View key={item.row} style={s.entry}>
          <View style={s.between}><Text style={s.note}>Row {item.row}</Text><StatusBadge status={item.status} /></View>
          <Text selectable style={s.body}>{item.text || "(empty text)"}</Text><View style={s.row}><Text style={s.note}>{item.language || "No language"}</Text>{item.label ? <StatusBadge status={item.label} /> : null}</View>
          {item.message ? <Text style={s.error}>{item.message}</Text> : null}
        </View>)}
        {preview.rows.length > 20 ? <View style={s.between}><Button title="Prev rows" secondary disabled={previewPage === 1} onPress={() => setPreviewPage(previewPage - 1)} /><Text style={s.note}>{previewPage}/{Math.ceil(preview.rows.length / 20)}</Text><Button title="Next rows" secondary disabled={previewPage * 20 >= preview.rows.length} onPress={() => setPreviewPage(previewPage + 1)} /></View> : null}
        <Pressable accessibilityRole="checkbox" accessibilityLabel="I reviewed these examples, removed personal/sensitive information, and have permission to use this data." accessibilityState={{ checked: privateChecked, disabled: busy }} disabled={busy} onPress={() => setPrivateChecked(!privateChecked)} style={[s.entry, s.checkboxRow, busy && s.disabled]}>
          <View style={[s.checkbox, privateChecked && s.checkboxChecked]}>
            {privateChecked ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
          </View>
          <Text style={[s.body, s.checkboxLabel]}>I have permission to use this data and removed personal information.</Text>
        </Pressable>
      </> : null}
    </Sheet> : null}

    {mode === "detail" ? <Sheet title={batch?.name || "Dataset details"} onClose={close} busy={busy} footer={isSuperAdmin && batch?.status === "pending" ? <View style={s.stack}>
      <TextInput accessibilityLabel="Dataset review note" placeholder="Review note — required to reject" editable={!busy} multiline maxLength={1000} value={reviewNote} onChangeText={setReviewNote} style={s.input} />
      <View style={s.row}><Button title="Approve dataset" icon="checkmark-outline" disabled={busy || !!editing} onPress={() => setConfirmation("approve")} /><Button title="Reject dataset" danger secondary disabled={busy || !!editing || !reviewNote.trim()} onPress={() => setConfirmation("reject")} /></View>
    </View> : null}>
      {busy ? <ActivityIndicator color="#294880" /> : null}
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      {batch ? <>
        <View style={s.between}><StatusBadge status={batch.status} /><Text style={s.note}>{detail.sampleCount} example{detail.sampleCount === 1 ? "" : "s"} · v{batch.version}</Text></View>
        <Text style={s.note}>{batch.created_by_name} · {dateText(batch.created_at)}</Text>
        {batch.review_note ? <View style={s.reviewNote}><Text style={s.label}>Review note</Text><Text style={s.body}>{batch.review_note}</Text></View> : null}
        {batch.status === "approved" ? <Button title="View training progress" icon="pulse-outline" secondary onPress={() => { close(); setActiveTab("training"); }} /> : null}
        <SectionTabs value={detailTab} disabled={busy} onChange={setDetailTab} options={[{ key: "examples", label: "Examples", icon: "list-outline" }, { key: "history", label: "History", icon: "time-outline" }]} />
        {detailTab === "examples" ? <>
        {editing ? <View style={s.entry}><Text style={s.subtitle}>Edit example</Text><SampleFields sample={editing} disabled={busy} onChange={setEditing} /><View style={s.row}><Button title="Save changes" disabled={busy || !editing.text.trim()} onPress={editSample} /><Button title="Cancel edit" secondary disabled={busy} onPress={() => setEditing(null)} /></View></View> : <>
        {detail.samples.map((item) => <View key={item.id} style={s.entry}>
          <Text selectable style={s.body}>{item.text}</Text><View style={s.row}><Text style={s.note}>{item.language}</Text><StatusBadge status={item.label} /></View>
          {canEdit ? <Button title="Edit pending example" secondary disabled={busy} onPress={() => { setEditing(item); setError(""); }} /> : null}
        </View>)}
        {detail.sampleCount > 25 ? <View style={s.between}><Button title="Prev examples" secondary disabled={busy || detailPage === 1} onPress={() => openDetail(batch.id, detailPage - 1)} /><Text style={s.note}>{detailPage}/{Math.max(1, Math.ceil(detail.sampleCount / 25))}</Text><Button title="Next examples" secondary disabled={busy || detailPage * 25 >= detail.sampleCount} onPress={() => openDetail(batch.id, detailPage + 1)} /></View> : null}
        </>}
        </> : null}
        {detailTab === "history" ? <>
        {!detail.events.length ? <EmptyState icon="time-outline" title="No history yet" /> : null}
        {detail.events.map((event) => <View key={event.id} style={s.entry}>
          <View style={s.row}><View style={s.timelineDot} /><Text style={s.label}>{event.action.replace(/_/g, " ")}</Text></View><Text style={s.note}>{event.actor_name} · {dateText(event.created_at)}</Text>
          {event.details?.note ? <Text style={s.body}>{event.details.note}</Text> : null}
          {event.details?.job_id ? <Text selectable style={s.note}>Training job: {event.details.job_id}</Text> : null}
          {event.details?.before ? <Text selectable style={s.note}>Before: {event.details.before.text} [{event.details.before.language} / {event.details.before.label}]{"\n"}After: {event.details.after.text} [{event.details.after.language} / {event.details.after.label}]</Text> : null}
        </View>)}
        </> : null}
        {(canArchive || (isSuperAdmin && batch.status === "approved")) ? <Disclosure title="More actions">
          {isSuperAdmin && batch.status === "approved" && Platform.OS === "web" ? <><View style={s.row}><Button title="Export training JSON" icon="download-outline" secondary disabled={busy} onPress={() => exportApproved("json")} /><Button title="Export safe CSV" secondary disabled={busy} onPress={() => exportApproved("csv")} /></View><Text style={s.note}>JSON preserves exact training text. CSV is for spreadsheet review.</Text></> : null}
          {canArchive ? <Button title={batch.status === "pending" ? "Withdraw / archive dataset" : "Archive dataset"} danger secondary disabled={busy} onPress={() => setConfirmation("archive")} /> : null}
        </Disclosure> : null}
      </> : null}
    </Sheet> : null}
    {confirmation ? <ConfirmModal visible onClose={() => setConfirmation(null)} onConfirm={() => review(confirmation)} title={`${confirmation[0].toUpperCase() + confirmation.slice(1)} dataset?`} message={confirmation === "approve" ? "Approve these examples and queue retraining? The active model will not change yet." : confirmation === "reject" ? "Reject this submission with your review note?" : "Archive this dataset? Its history will be kept."} confirmLabel="Confirm" /> : null}
  </View>;
}

const s = StyleSheet.create({
  card: { backgroundColor: "#FFFFFF", padding: 22, borderRadius: 14, borderWidth: 1, borderColor: "#D9E2F0", gap: 20 },
  embeddedCard: { borderWidth: 0, borderRadius: 0, padding: 16, gap: 16 },
  flex: { flex: 1, minWidth: 0 },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  managerHeading: { flexDirection: "row", alignItems: "center", gap: 12 },
  headingIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: "#EDF2FC", alignItems: "center", justifyContent: "center" },
  datasetIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: "#EDF2F9", alignItems: "center", justifyContent: "center" },
  datasetRow: { flexDirection: "row", alignItems: "flex-start", backgroundColor: "#FAFBFE", padding: 14, gap: 12, borderWidth: 1, borderColor: "#E6ECF5", borderRadius: 12 },
  formWidth: { width: "100%", maxWidth: 680, alignSelf: "center" },
  counter: { fontSize: 10, color: "#9AA8BD", fontFamily: "PoppinsRegular" },
  successBanner: { backgroundColor: "#EDF8F1", borderRadius: 9, flexDirection: "row", alignItems: "center", gap: 8, padding: 10 },
  previewSummary: { backgroundColor: "#F0F7F3", padding: 14, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  uploadZone: { padding: 24, borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: "#B4C5E0", backgroundColor: "#F7FAFF", alignItems: "center", gap: 8 },
  reviewNote: { backgroundColor: "#F6F8FC", padding: 12, borderRadius: 10, gap: 5 },
  timelineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#9AAED0" },
  title: { fontFamily: "PoppinsSemiBold", fontSize: 16, color: "#294880", flexShrink: 1 },
  subtitle: { fontFamily: "PoppinsSemiBold", fontSize: 13, color: "#294880" },
  label: { fontFamily: "PoppinsMedium", fontSize: 12, color: "#334155" },
  body: { fontFamily: "PoppinsRegular", fontSize: 13, color: "#334155" },
  note: { fontFamily: "PoppinsRegular", fontSize: 11, color: "#64748B", lineHeight: 18 },
  error: { color: "#B93838", fontSize: 12, lineHeight: 18 },
  success: { color: "#16794B", fontSize: 12 },
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  stack: { gap: 12 },
  fieldRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  fieldColumn: { flex: 1, minWidth: 0, gap: 8 },
  button: { backgroundColor: "#294880", borderRadius: 9, paddingHorizontal: 13, paddingVertical: 11, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 7, minHeight: 40 },
  secondary: { backgroundColor: "#EEF2F8" },
  buttonText: { color: "#FFFFFF", fontFamily: "PoppinsMedium", fontSize: 12 },
  secondaryText: { color: "#294880" },
  dangerButton: { backgroundColor: "#FDF0F0" },
  dangerText: { color: "#B93838" },
  disabled: { opacity: 0.45 },
  input: { borderWidth: 1, borderColor: "#DCE4EF", borderRadius: 9, padding: 12, fontSize: 13, color: "#334155", backgroundColor: "#FBFCFE", fontFamily: "PoppinsRegular" },
  selectContainer: { gap: 4 },
  selectTrigger: { minHeight: 44, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#FFFFFF" },
  selectTriggerOpen: { borderColor: "#294880" },
  selectText: { fontFamily: "PoppinsRegular", fontSize: 13, color: "#334155", flexShrink: 1 },
  selectPlaceholder: { color: "#8A94A6" },
  selectMenu: { borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, overflow: "hidden", backgroundColor: "#FFFFFF" },
  selectOption: { minHeight: 42, paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  selectOptionSelected: { backgroundColor: "#EAF2FF" },
  multiline: { minHeight: 85, textAlignVertical: "top" },
  csv: { minHeight: 150, textAlignVertical: "top" },
  code: { backgroundColor: "#F1F5F9", padding: 10, fontSize: 11, color: "#334155" },
  entry: { padding: 14, borderWidth: 1, borderColor: "#E6ECF5", borderRadius: 10, gap: 9 },
  checkboxRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48 },
  checkbox: { width: 22, height: 22, flexShrink: 0, borderWidth: 2, borderColor: "#9AAED0", borderRadius: 5, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  checkboxChecked: { backgroundColor: "#294880", borderColor: "#294880" },
  checkboxLabel: { flex: 1, lineHeight: 20 },
  overlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.5)", padding: 20, justifyContent: "center", alignItems: "center" },
  sheet: { width: "100%", maxWidth: 900, maxHeight: "92%", backgroundColor: "#FFFFFF", borderRadius: 14, overflow: "hidden" },
  heading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 18, gap: 12, borderBottomWidth: 1, borderBottomColor: "#E9EEF5", flexShrink: 0 },
  sheetContent: { padding: 22, gap: 16 },
  sheetFooter: { padding: 18, borderTopWidth: 1, borderTopColor: "#E9EEF5", backgroundColor: "#FFFFFF", flexShrink: 0 },
});
