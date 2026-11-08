import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import apiClient from "../../services/apiClient";
import { getCache, getCachedPage } from "../../services/dataStore";
import { useToast } from "../Toast";
import ConfirmModal from "../modals/ConfirmModal";
import { Ionicons } from "@expo/vector-icons";
import SentimentTrainingPanel from "./SentimentTrainingPanel";
import { Disclosure, EmptyState, SectionTabs, StatusBadge } from "./SentimentUi";
import SentimentActionButton from "./SentimentActionButton";
import SentimentManualTable from "./SentimentManualTable";
import { MANUAL_DATASET_LIMIT as MAX_MANUAL_SAMPLES, createManualDraft, manualEntryComplete, manualEntryChanged, clearManualEntry, stageManualEntry, editManualEntry, removeManualEntry, finishManualSubmission, manualRowsPayload } from "../../services/manualDatasetDraft";

const LANGUAGES = ["english", "filipino", "cebuano"];
const LABELS = ["positive", "neutral", "negative"];
const errorText = (error) => error.response?.data?.error || error.message || "Request failed. Please try again.";
const dateText = (value) => new Date(value).toLocaleString();

function Button({ title, onPress, disabled, secondary = false, icon, danger = false }) {
  return <SentimentActionButton title={title} onPress={onPress} disabled={disabled}
    variant={danger ? "danger" : secondary ? "secondary" : "primary"} icon={icon} />;
}
function InlineDropdown({ options, selectedValue, placeholder, accessibilityLabel = placeholder, displayPlaceholder, disabled, open, onToggle, onClose, onChange }) {
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
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ expanded: open, disabled }} disabled={disabled} onPress={onToggle} style={[s.selectTrigger, open && s.selectTriggerOpen, disabled && s.disabled]}>
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
function SampleFields({ sample, onChange, disabled, exampleNumber, variant }) {
  const [openField, setOpenField] = useState(null);
  const [fieldWidth, setFieldWidth] = useState(0);
  const [textFocused, setTextFocused] = useState(false);
  const closeDropdown = useCallback(() => setOpenField(null), []);
  if (variant === "manual") return <View onLayout={event => setFieldWidth(event.nativeEvent.layout.width)} style={[s.manualFields, fieldWidth < 700 && s.manualFieldsCompact]}>
    <View style={[s.manualTextColumn, fieldWidth < 700 && s.manualTextColumnCompact]}>
      <View style={s.between}><Text style={s.manualFieldLabel}>Text or phrase</Text><Text style={s.manualCounter}>{sample.text.length.toLocaleString()} / 2,000</Text></View>
      <TextInput accessibilityLabel="Training example text" multiline maxLength={2000} editable={!disabled} value={sample.text}
        onFocus={() => { closeDropdown(); setTextFocused(true); }} onBlur={() => setTextFocused(false)}
        onChangeText={text => onChange({ ...sample, text })} placeholder="e.g. Salamat sa mabilis na tulong ng barangay."
        placeholderTextColor="#8793A5" style={[s.manualTextInput, textFocused && s.manualTextInputFocused, disabled && s.disabled]} />
      <Text style={s.manualHint}>Use the wording as written. Leave out names and other personal information.</Text>
    </View>
    <View style={[s.manualMetadata, fieldWidth < 700 && s.manualMetadataCompact]}>
      <View style={s.stack}>
        <Text style={s.manualFieldLabel}>Language</Text>
        <InlineDropdown options={LANGUAGES.map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }))}
          selectedValue={sample.language} placeholder="Select language" disabled={disabled} open={openField === "language" && !disabled}
          onToggle={() => setOpenField(openField === "language" ? null : "language")} onClose={closeDropdown} onChange={language => onChange({ ...sample, language })} />
      </View>
      <View style={s.stack}>
        <Text style={s.manualFieldLabel}>Sentiment</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="Sentiment label" style={s.sentimentChoices}>
          {LABELS.map(label => {
            const selected = sample.label === label;
            return <Pressable key={label} accessibilityRole="radio" accessibilityLabel={label[0].toUpperCase() + label.slice(1)} accessibilityState={{ checked: selected, disabled }}
              disabled={disabled} onPress={() => { closeDropdown(); onChange({ ...sample, label }); }}
              style={[s.sentimentChoice, selected && s.sentimentChoiceSelected, disabled && s.disabled]}>
              <Ionicons name={selected ? "checkmark-circle" : "ellipse-outline"} size={15} color={selected ? "#294880" : "#8793A5"} />
              <Text style={[s.sentimentChoiceText, selected && s.sentimentChoiceTextSelected]}>{label}</Text>
            </Pressable>;
          })}
        </View>
        <Text style={s.manualHint}>Choose the emotion expressed, not how serious the incident is.</Text>
      </View>
    </View>
  </View>;
  return <View style={s.stack}>
    <View style={s.between}><Text style={s.label}>Text / phrase</Text><Text style={s.counter}>{sample.text.length}/2000</Text></View>
    <TextInput accessibilityLabel={exampleNumber ? `Example ${exampleNumber} text` : "Training example text"} multiline maxLength={2000} editable={!disabled} value={sample.text} onFocus={closeDropdown} onChangeText={(text) => onChange({ ...sample, text })} placeholder="Enter a real word, phrase, or sentence" style={[s.input, s.multiline]} />
    <View style={s.fieldRow}>
      <View style={s.fieldColumn}><Text style={s.label}>Language</Text>
        <InlineDropdown options={LANGUAGES.map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} selectedValue={sample.language} placeholder="Select language" accessibilityLabel={exampleNumber ? `Example ${exampleNumber} language` : "Select language"} displayPlaceholder="Select" disabled={disabled} open={openField === "language" && !disabled} onToggle={() => setOpenField(openField === "language" ? null : "language")} onClose={closeDropdown} onChange={(language) => onChange({ ...sample, language })} />
      </View>
      <View style={s.fieldColumn}><Text style={s.label}>Sentiment label</Text>
        <InlineDropdown options={LABELS.map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} selectedValue={sample.label} placeholder="Select sentiment label" accessibilityLabel={exampleNumber ? `Example ${exampleNumber} sentiment label` : "Select sentiment label"} displayPlaceholder="Select" disabled={disabled} open={openField === "label" && !disabled} onToggle={() => setOpenField(openField === "label" ? null : "label")} onClose={closeDropdown} onChange={(label) => onChange({ ...sample, label })} />
      </View>
    </View>
  </View>;
}
function Sheet({ title, children, onClose, busy, footer }) {
  return <Modal transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
    <View style={s.overlay}><View style={s.sheet}>
      <View style={s.heading}><Text style={s.title}>{title}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close modal" accessibilityState={{ disabled: busy }} disabled={busy} onPress={onClose} style={[s.closeButton, busy && s.disabled]}>
          <Ionicons name="close" size={24} color="#4B5D7A" />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={s.sheetContent} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      {footer ? <View style={s.sheetFooter}>{footer}</View> : null}
    </View></View>
  </Modal>;
}

export default function SentimentDatasetManager({ embedded = false }) {
  const toast = useToast();
  const initialList = getCachedPage("/sentiment/datasets", { status: "current", page: 1 });
  const [manualDraft, setManualDraft] = useState(createManualDraft);
  const manualSamples = manualDraft.rows;
  const [manualPrompt, setManualPrompt] = useState(null);
  const nextManualId = useRef(1);
  const [datasets, setDatasets] = useState(() => initialList?.datasets || []);
  const [total, setTotal] = useState(() => initialList?.total || 0);
  const [datasetTab, setDatasetTab] = useState("current");
  const [pages, setPages] = useState({ current: 1, archived: 1 });
  const page = pages[datasetTab];
  const setPage = (value) => setPages((previous) => ({ ...previous, [datasetTab]: value }));
  const [currentStatus, setStatus] = useState("current");
  const status = datasetTab === "archived" ? "archived" : currentStatus;
  const [counts, setCounts] = useState(initialList?.counts || null);
  const [activeTab, setActiveTab] = useState(embedded ? "add" : "datasets");
  const [filterOpen, setFilterOpen] = useState(false);
  const [detailTab, setDetailTab] = useState("examples");
  const [fileName, setFileName] = useState("");
  const [identity, setIdentity] = useState(() => {
    const profile = getCache("api:/profile");
    return profile && initialList ? { ...profile, id: initialList.viewerId } : null;
  });
  const [loading, setLoading] = useState(() => !initialList);
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

  const load = useCallback(async ({ force = false } = {}) => {
    const request = ++listRequest.current;
    const cached = getCachedPage("/sentiment/datasets", { status, page });
    setLoading(!cached);
    if (cached && !force) { setDatasets(cached.datasets || []); setTotal(cached.total || 0); setCounts(cached.counts || null); }
    else { setLoading(true); setDatasets([]); }
    try {
      const [list, profile] = await Promise.all([
        apiClient.get("/sentiment/datasets", { params: { status, page }, ...(force ? { cacheMode: "network" } : {}) }), apiClient.get("/profile"),
      ]);
      if (request !== listRequest.current) return;
      setDatasets(list.data.datasets || []); setTotal(list.data.total || 0);
      setCounts(list.data.counts || null);
      if (page > 1 && !(list.data.datasets || []).length) {
        setPages((previous) => ({ ...previous, [status === "archived" ? "archived" : "current"]: Math.max(1, Math.ceil((list.data.total || 0) / 10)) }));
      }
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
  const addManualSample = () => {
    if (busy) return null;
    const updated = stageManualEntry(manualDraft, nextManualId.current++);
    if (updated === manualDraft) {
      setError(manualSamples.length >= MAX_MANUAL_SAMPLES && manualDraft.editingId === null ? "A dataset can contain at most 1,000 examples." : "Complete the text, language and sentiment before adding this example.");
      return null;
    }
    setManualDraft(updated); setError(""); resetPreview();
    return updated.rows;
  };
  const updateManualSample = (entry) => {
    if (busy) return;
    setManualDraft((previous) => ({ ...previous, entry }));
    resetPreview();
  };
  const editAddedSample = (draftId) => {
    if (busy) return;
    if (manualEntryChanged(manualDraft)) { setError("Add or save the current example, or clear the form, before editing another row."); return; }
    setManualDraft(previous => editManualEntry(previous, draftId)); setError(""); resetPreview();
  };
  const removeManualSample = (draftId) => {
    if (busy) return;
    if (manualDraft.editingId === draftId && manualEntryChanged(manualDraft)) { setError("Save or cancel this row's edits before removing it."); return; }
    setManualDraft(previous => removeManualEntry(previous, draftId)); setError(""); resetPreview();
  };
  const clearManualForm = () => {
    if (busy) return;
    if (manualEntryChanged(manualDraft)) { setManualPrompt("clear"); return; }
    setManualDraft(previous => clearManualEntry(previous)); setError(""); resetPreview();
  };
  const requestManualPreview = () => {
    if (busy || !manualSamples.length) return;
    if (manualEntryChanged(manualDraft)) { setManualPrompt("preview"); return; }
    setManualDraft(previous => clearManualEntry(previous));
    makePreview(true);
  };
  const addAndPreview = () => {
    const rows = addManualSample();
    if (!rows) return;
    setManualPrompt(null); makePreview(true, rows);
  };
  const openImport = () => {
    setError(""); setNotice(""); setCsv(""); setFileName(""); setName(""); setSource("csv"); resetPreview(); setMode("import");
  };
  const makePreview = async (manual = false, manualRows = manualSamples) => {
    setError(""); setBusy(true); resetPreview();
    if (manual) { setSource("manual"); setName(""); setMode("import"); }
    try {
      const { data } = await apiClient.post("/sentiment/datasets/preview", manual ? { rows: manualRowsPayload(manualRows) } : { csv });
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
      if (source === "manual") setManualDraft(previous => finishManualSubmission(previous));
      setMode(null); resetPreview(); setActiveTab("datasets"); setDatasetTab("current"); setStatus("current"); setPages({ current: 1, archived: 1 }); tell("Dataset submitted for review."); await load({ force: true });
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
      tell(action === "approve" ? "Dataset approved. Review the collected examples in Training." : action === "reject" ? "Dataset rejected." : action === "restore" ? "Dataset restored to Current Datasets for review. Training has not been queued." : "Dataset archived."); await openDetail(detail.dataset.id, detailPage); await load({ force: true });
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
  const canRestore = isSuperAdmin && batch?.status === "archived";
  const validCount = preview?.rows.filter((row) => row.status === "valid").length || 0;
  const manualFormComplete = manualEntryComplete(manualDraft.entry);
  const manualAtLimit = manualSamples.length >= MAX_MANUAL_SAMPLES && manualDraft.editingId === null;

  return <View style={[s.card, embedded && s.embeddedCard]}>
    <View style={s.managerHeading}>
      <View style={s.headingIcon}><Ionicons name="layers-outline" size={21} color="#294880" /></View>
      <View style={s.flex}><Text style={s.title}>Sentiment Training Data</Text><Text style={s.note}>Collect examples. Review labels. Train and approve supporting models.</Text></View>
    </View>
    <SectionTabs value={activeTab} disabled={busy} onChange={(tab) => { setActiveTab(tab); setNotice(""); setFilterOpen(false); }} options={embedded ? [
      { key: "add", label: "Add data" }, { key: "datasets", label: "Datasets" }, { key: "training", label: "Training" },
    ] : [
      { key: "datasets", label: "Datasets", icon: "folder-outline" }, { key: "training", label: "Training", icon: "pulse-outline" }, { key: "add", label: "Add data", icon: "add-circle-outline" },
    ]} />
    {!mode && error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    {notice ? <View style={s.successBanner}><Ionicons name="checkmark-circle" size={16} color="#16794B" /><Text style={s.success}>{notice}</Text></View> : null}
    {activeTab === "add" ? <View style={s.manualWorkspace}>
      <View style={s.manualWorkspaceHeading}>
        <View style={s.manualHeadingText}><Text style={s.manualWorkspaceTitle}>Build your dataset</Text><Text style={s.manualDescription}>Add labelled examples one at a time, then review them together.</Text></View>
        <Button title="Import CSV" icon="cloud-upload-outline" secondary onPress={openImport} disabled={busy} />
      </View>
      <View style={s.manualEntryCard}>
        <View style={s.manualEntryHeading}>
          <View style={s.manualStepHeading}><View style={s.manualStepBadge}><Text style={s.manualStepNumber}>01</Text></View><View style={s.manualHeadingText}><Text style={s.manualSectionTitle}>{manualDraft.editingId !== null ? "Edit your example" : "Write an example"}</Text><Text style={s.manualHint}>{manualDraft.editingId !== null ? "Save your changes to update the row below." : "Enter the text, choose a language and select its sentiment."}</Text></View></View>
          <Pressable accessibilityRole="button" accessibilityLabel={manualDraft.editingId !== null ? "Cancel edit" : "Clear form"}
            accessibilityState={{ disabled: busy || (!manualEntryChanged(manualDraft) && manualDraft.editingId === null) }}
            disabled={busy || (!manualEntryChanged(manualDraft) && manualDraft.editingId === null)} onPress={clearManualForm}
            style={[s.manualClear, (busy || (!manualEntryChanged(manualDraft) && manualDraft.editingId === null)) && s.disabled]}>
            <Text style={s.manualClearText}>{manualDraft.editingId !== null ? "Cancel edit" : "Clear form"}</Text>
          </Pressable>
        </View>
        <View style={s.manualEntryBody}><SampleFields sample={manualDraft.entry} onChange={updateManualSample} disabled={busy} variant="manual" /></View>
        <View style={s.manualActionBar}>
          <View style={s.row}>
            <Button title={manualDraft.editingId !== null ? "Save row changes" : "Add to dataset"} icon={manualDraft.editingId !== null ? "checkmark-outline" : "add-outline"} disabled={busy || !manualFormComplete || manualAtLimit} onPress={addManualSample} />
            <Button title="Preview dataset" icon="arrow-forward-outline" secondary disabled={busy || !manualSamples.length} onPress={requestManualPreview} />
          </View>
          <View style={s.manualFooterHint}><Ionicons name="information-circle-outline" size={15} color="#64748B" /><Text style={s.manualHint}>Language stays selected for the next example. Adding does not submit.</Text></View>
        </View>
      </View>
      <View style={s.manualReviewSection}>
        <View style={s.manualStepHeading}><View style={s.manualStepBadge}><Text style={s.manualStepNumber}>02</Text></View><View style={s.manualHeadingText}><Text style={s.manualSectionTitle}>Review your examples</Text><Text style={s.manualHint}>Edit or remove rows before previewing your dataset.</Text></View></View>
        <SentimentManualTable rows={manualSamples} editingId={manualDraft.editingId} busy={busy} onEdit={editAddedSample} onRemove={removeManualSample} />
      </View>
    </View> : null}
    {activeTab === "datasets" ? <View style={s.stack}>
      <View style={s.guideCard}>
        <View style={s.row}><Ionicons name="folder-open-outline" size={20} color="#294880" /><Text style={s.subtitle}>Your reviewed data library</Text></View>
        <Text style={s.note}>Open a dataset to inspect labels and review history. Only approved examples enter training. The permanent built-in model is never replaced.</Text>
        <View style={s.flowSteps}>
          {[{ n: "1", title: "Collect" }, { n: "2", title: "Review" }, { n: "3", title: "Train" }, { n: "4", title: "Enable manually" }].map((step) => (
            <View key={step.n} accessible accessibilityLabel={`Step ${step.n}: ${step.title}`} style={s.flowStep}>
              <View style={s.flowBadge}><Text style={s.flowNumber}>{step.n}</Text></View>
              <Text style={s.flowLabel}>{step.title}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={s.between}><Text style={s.subtitle}>{total} dataset{total === 1 ? "" : "s"}</Text><Button title="Refresh" icon="refresh-outline" secondary onPress={() => load({ force: true })} disabled={loading || busy} /></View>
      <SectionTabs value={datasetTab} disabled={busy} onChange={(value) => { setDatasetTab(value); setFilterOpen(false); }} options={[
        { key: "current", label: `Current Datasets${counts ? ` (${counts.current})` : ""}`, icon: "folder-open-outline" },
        { key: "archived", label: `Archived Datasets${counts ? ` (${counts.archived})` : ""}`, icon: "archive-outline" },
      ]} />
      {datasetTab === "current" ? <InlineDropdown placeholder="Filter current datasets" options={[{ value: "current", label: "All current datasets" }, { value: "pending", label: "Pending review" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }]} selectedValue={status} disabled={busy} open={filterOpen} onToggle={() => setFilterOpen(!filterOpen)} onClose={() => setFilterOpen(false)} onChange={(value) => { setStatus(value); setPage(1); }} /> : <Text style={s.note}>Archived examples stay out of training. A Super Admin can restore a dataset for review without losing its examples or history.</Text>}
      {loading ? <ActivityIndicator color="#294880" style={{ padding: 16 }} /> : null}
      {!loading && datasets.length === 0 ? <EmptyState title={status === "archived" ? "No archived datasets" : status === "pending" ? "Nothing to review" : "No datasets here yet"} message={status === "archived" ? "Archived datasets will appear here with their examples and history." : status === "pending" ? "New submissions will appear here." : "Add an example or import a CSV to get started."} /> : null}
      {datasets.map((item) => <Pressable accessibilityRole="button" key={item.id} disabled={busy} onPress={() => openDetail(item.id)} style={({ pressed }) => [s.datasetRow, pressed && { backgroundColor: "#EDF2FC" }]}>
        <View style={s.datasetIcon}><Ionicons name={item.source === "csv" ? "document-text-outline" : "create-outline"} size={20} color="#6A82A8" /></View>
        <View style={s.flex}>
          <View style={s.between}><Text numberOfLines={2} style={[s.subtitle, s.flex]}>{item.name}</Text><Ionicons name="chevron-forward" size={16} color="#9AAAC0" /></View>
          <Text style={s.note}>{item.sentiment_training_samples?.[0]?.count || 0} example{item.sentiment_training_samples?.[0]?.count === 1 ? "" : "s"} · {new Date(item.created_at).toLocaleDateString()}</Text>
          <StatusBadge status={item.status} />
          {item.status === "archived" ? <Text style={s.note}>Archived {dateText(item.updated_at)}</Text> : null}
        </View>
      </Pressable>)}
      {total > 10 ? <View style={s.between}><Button title="Prev" secondary disabled={page === 1 || loading || busy} onPress={() => setPage(page - 1)} /><Text style={s.note}>{page} / {Math.max(1, Math.ceil(total / 10))}</Text><Button title="Next" secondary disabled={page * 10 >= total || loading || busy} onPress={() => setPage(page + 1)} /></View> : null}
    </View> : null}
    {activeTab === "training" ? <SentimentTrainingPanel isSuperAdmin={isSuperAdmin} refreshKey={trainingRefreshKey} /> : null}

    {manualPrompt ? <Sheet title={manualPrompt === "clear" ? "Discard form changes?" : "There is an unadded example"} busy={busy} onClose={() => setManualPrompt(null)}>
      <Text style={s.body}>{manualPrompt === "clear" ? "Only the current form will be cleared. Examples already in the table are kept." : "The current form has not been added or saved to the table. Add it before previewing, or preview the added rows only. Your unadded input will be kept if you preview added rows only."}</Text>
      {manualPrompt === "clear" ? <Button title="Clear form" danger onPress={() => { setManualDraft(previous => clearManualEntry(previous)); resetPreview(); setError(""); setManualPrompt(null); }} /> : <>
        <Button title={manualDraft.editingId !== null ? "Save changes & preview" : "Add & preview"} disabled={busy || !manualFormComplete || manualAtLimit} onPress={addAndPreview} />
        {!manualFormComplete ? <Text style={s.note}>Complete the text, language and sentiment to include this entry.</Text> : null}
        <Button title="Preview added rows only" secondary disabled={busy} onPress={() => { setManualPrompt(null); makePreview(true); }} />
      </>}
      <Button title="Keep editing" secondary disabled={busy} onPress={() => setManualPrompt(null)} />
    </Sheet> : null}
    {mode === "import" ? <Sheet title={source === "manual" ? "Preview dataset" : "Import datasets"} busy={busy} onClose={close} footer={preview ? <Button title="Submit for review" icon="checkmark-outline" disabled={busy || !validCount || !name.trim() || !privateChecked} onPress={save} /> : null}>
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
        {canRestore ? <View style={s.stack}><Text style={s.note}>Restore returns this dataset to Pending review. Its examples remain excluded from training until approved again.</Text><Button title="Restore dataset" icon="refresh-outline" disabled={busy} onPress={() => setConfirmation("restore")} /></View> : null}
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
    {confirmation ? <ConfirmModal visible onClose={() => setConfirmation(null)} onConfirm={() => { const action = confirmation; setConfirmation(null); return review(action); }} title={`${confirmation[0].toUpperCase() + confirmation.slice(1)} dataset?`} message={confirmation === "approve" ? "Approve these labels for the reviewed training pool? You can collect more examples before queueing training. The built-in model stays permanent." : confirmation === "reject" ? "Reject this submission with your review note?" : confirmation === "restore" ? "Return this dataset to Current Datasets as Pending review? Examples and history are preserved. Approval and training are not automatic." : "Archive this dataset? Its history will be kept."} confirmLabel="Confirm" /> : null}
  </View>;
}

const s = StyleSheet.create({
  card: { backgroundColor: "#FFFFFF", padding: 22, borderRadius: 14, borderWidth: 1, borderColor: "#D9E2F0", gap: 20 },
  embeddedCard: { borderWidth: 0, borderRadius: 0, padding: 16, gap: 16 },
  flex: { flex: 1, minWidth: 0 },
  between: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 },
  managerHeading: { flexDirection: "row", alignItems: "center", gap: 14, padding: 18, borderRadius: 14, backgroundColor: "#EDF3FC", borderWidth: 1, borderColor: "#C9D8ED" },
  headingIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: "#EDF2FC", alignItems: "center", justifyContent: "center" },
  datasetIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: "#EDF2F9", alignItems: "center", justifyContent: "center" },
  datasetRow: { flexDirection: "row", alignItems: "flex-start", backgroundColor: "#FAFBFE", padding: 14, gap: 12, borderWidth: 1, borderColor: "#E6ECF5", borderRadius: 12 },
  guideCard: { backgroundColor: "#F7FAFF", borderWidth: 1, borderColor: "#E0E8F4", borderRadius: 12, padding: 16, gap: 12 },
  flowSteps: { flexDirection: "row", flexWrap: "wrap", columnGap: 24, rowGap: 10, borderTopWidth: 1, borderTopColor: "#E0E8F4", paddingTop: 12 },
  flowStep: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  flowBadge: { flexShrink: 0 },
  flowNumber: { fontFamily: "PoppinsSemiBold", fontSize: 12, lineHeight: 18, color: "#8595AC" },
  flowLabel: { fontFamily: "PoppinsRegular", fontSize: 12, lineHeight: 18, color: "#52647C", flexShrink: 1 },
  formWidth: { width: "100%", maxWidth: 680, alignSelf: "center" },
  counter: { fontSize: 10, color: "#9AA8BD", fontFamily: "PoppinsRegular" },
  successBanner: { backgroundColor: "#EDF8F1", borderRadius: 9, flexDirection: "row", alignItems: "center", gap: 8, padding: 10 },
  previewSummary: { backgroundColor: "#F0F7F3", padding: 14, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  uploadZone: { padding: 24, borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: "#B4C5E0", backgroundColor: "#F7FAFF", alignItems: "center", gap: 8 },
  reviewNote: { backgroundColor: "#F6F8FC", padding: 12, borderRadius: 10, gap: 5 },
  timelineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#9AAED0" },
  title: { fontFamily: "PoppinsSemiBold", fontSize: 20, color: "#203B66", flexShrink: 1 },
  subtitle: { fontFamily: "PoppinsSemiBold", fontSize: 14, color: "#294880" },
  label: { fontFamily: "PoppinsMedium", fontSize: 12, color: "#334155" },
  body: { fontFamily: "PoppinsRegular", fontSize: 13, color: "#334155" },
  note: { fontFamily: "PoppinsRegular", fontSize: 12, color: "#52647C", lineHeight: 19 },
  error: { color: "#B93838", fontSize: 12, lineHeight: 18 },
  success: { color: "#16794B", fontSize: 12 },
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  stack: { gap: 12 },
  manualWorkspace: { width: "100%", maxWidth: 1100, alignSelf: "center", gap: 26 },
  manualWorkspaceHeading: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14 },
  manualHeadingText: { flex: 1, minWidth: 0, gap: 3 },
  manualWorkspaceTitle: { fontFamily: "PoppinsSemiBold", fontSize: 18, lineHeight: 27, color: "#203B66" },
  manualDescription: { fontFamily: "PoppinsRegular", fontSize: 13, lineHeight: 21, color: "#52647C" },
  manualEntryCard: { borderWidth: 1, borderColor: "#D9E2EF", borderRadius: 12, backgroundColor: "#FFFFFF", overflow: "hidden" },
  manualEntryHeading: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 20, paddingTop: 18 },
  manualStepHeading: { flexGrow: 1, flexShrink: 1, flexBasis: "auto", minWidth: 180, flexDirection: "row", alignItems: "flex-start", gap: 12 },
  manualStepBadge: { width: 32, height: 32, borderRadius: 9, backgroundColor: "#EDF2F8", alignItems: "center", justifyContent: "center" },
  manualStepNumber: { fontFamily: "PoppinsSemiBold", fontSize: 11, color: "#526B8C" },
  manualSectionTitle: { fontFamily: "PoppinsSemiBold", fontSize: 14, lineHeight: 22, color: "#203B66" },
  manualClear: { minHeight: 40, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
  manualClearText: { fontFamily: "PoppinsMedium", fontSize: 12, color: "#52647C" },
  manualEntryBody: { padding: 20 },
  manualFields: { flexDirection: "row", gap: 28 }, manualFieldsCompact: { flexDirection: "column", gap: 20 },
  manualTextColumn: { flex: 1, minWidth: 0, gap: 9 },
  manualTextColumnCompact: { flexGrow: 0, flexShrink: 0, flexBasis: "auto", width: "100%" },
  manualMetadata: { width: 300, gap: 22 }, manualMetadataCompact: { width: "100%" },
  manualFieldLabel: { fontFamily: "PoppinsMedium", fontSize: 13, lineHeight: 21, color: "#334155" },
  manualCounter: { fontFamily: "PoppinsRegular", fontSize: 11, color: "#718096" },
  manualTextInput: { minHeight: 158, textAlignVertical: "top", padding: 14, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 9, backgroundColor: "#FCFDFE", fontFamily: "PoppinsRegular", fontSize: 14, lineHeight: 23, color: "#26364D" },
  manualTextInputFocused: { borderColor: "#294880", backgroundColor: "#FFFFFF" },
  manualHint: { fontFamily: "PoppinsRegular", fontSize: 12, lineHeight: 20, color: "#64748B", flexShrink: 1 },
  sentimentChoices: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  sentimentChoice: { flex: 1, minWidth: 88, minHeight: 43, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 9, borderWidth: 1, borderColor: "#DCE4EF", borderRadius: 8, backgroundColor: "#FFFFFF" },
  sentimentChoiceSelected: { borderColor: "#496B9C", backgroundColor: "#EDF3FC" },
  sentimentChoiceText: { fontFamily: "PoppinsRegular", fontSize: 12, lineHeight: 20, color: "#52647C", textTransform: "capitalize" },
  sentimentChoiceTextSelected: { fontFamily: "PoppinsSemiBold", color: "#294880" },
  manualActionBar: { padding: 16, paddingHorizontal: 20, gap: 10, backgroundColor: "#F8FAFC", borderTopWidth: 1, borderTopColor: "#E8EDF4" },
  manualFooterHint: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  manualReviewSection: { gap: 15 },
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
  closeButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, flexShrink: 0 },
  sheetContent: { padding: 22, gap: 16 },
  sheetFooter: { padding: 18, borderTopWidth: 1, borderTopColor: "#E9EEF5", backgroundColor: "#FFFFFF", flexShrink: 0 },
});
