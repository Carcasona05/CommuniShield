export const MANUAL_DATASET_LIMIT = 1000;
const fields = row => ({ text: row.text, language: row.language, label: row.label });
export const emptyManualEntry = (language = "") => ({ text: "", language, label: "" });
export const createManualDraft = () => ({ rows: [], entry: emptyManualEntry(), editingId: null });
export const manualEntryComplete = entry => Boolean(entry.text.trim() && entry.language && entry.label);
export const manualRowsPayload = rows => rows.map(fields);

export function manualEntryChanged(draft) {
  const original = draft.rows.find(row => row.draftId === draft.editingId);
  return original ? ["text", "language", "label"].some(key => original[key] !== draft.entry[key])
    : Boolean(draft.entry.text.trim() || draft.entry.label);
}

export function clearManualEntry(draft) {
  return { ...draft, entry: emptyManualEntry(draft.entry.language), editingId: null };
}

export function stageManualEntry(draft, draftId) {
  if (!manualEntryComplete(draft.entry)) return draft;
  const editing = draft.rows.some(row => row.draftId === draft.editingId);
  if (!editing && draft.rows.length >= MANUAL_DATASET_LIMIT) return draft;
  const row = { ...fields(draft.entry), draftId: editing ? draft.editingId : draftId };
  const rows = editing ? draft.rows.map(existing => existing.draftId === row.draftId ? row : existing) : [...draft.rows, row];
  return { rows, entry: emptyManualEntry(draft.entry.language), editingId: null };
}

export function editManualEntry(draft, draftId) {
  if (manualEntryChanged(draft)) return draft;
  const row = draft.rows.find(item => item.draftId === draftId);
  return row ? { ...draft, entry: fields(row), editingId: draftId } : draft;
}

export function removeManualEntry(draft, draftId) {
  if (draftId === draft.editingId && manualEntryChanged(draft)) return draft;
  const next = { ...draft, rows: draft.rows.filter(row => row.draftId !== draftId) };
  return draftId === draft.editingId ? clearManualEntry(next) : next;
}

export function finishManualSubmission(draft) {
  // Previewing staged rows only must not discard the unadded entry or edited copy.
  return { rows: [], entry: manualEntryChanged(draft) ? draft.entry : emptyManualEntry(draft.entry.language), editingId: null };
}
