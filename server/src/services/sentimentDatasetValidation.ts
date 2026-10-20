import { createHash } from "node:crypto";

export const DATASET_LIMITS = { bytes: 2 * 1024 * 1024, rows: 1000, text: 2000 };
export const DATASET_LANGUAGES = ["english", "filipino", "cebuano"];
export const DATASET_LABELS = ["positive", "neutral", "negative"];
export type TrainingSample = { text: string; language: string; label: string; text_key: string };
export type PreviewRow = TrainingSample & { row: number; status: "valid" | "invalid" | "duplicate" | "conflict"; message: string };
export class DatasetInputError extends Error {}

export function parseDatasetCsv(csv: string): Record<string, string>[] {
  if (Buffer.byteLength(csv, "utf8") > DATASET_LIMITS.bytes) throw new DatasetInputError("CSV must be at most 2 MB.");
  const source = csv.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const records: string[][] = [];
  let record: string[] = [], field = "", quoted = false, closed = false;
  const finishField = () => { record.push(field); field = ""; closed = false; };
  const finishRecord = () => {
    finishField();
    if (record.some((value) => value.trim())) records.push(record);
    record = [];
    if (records.length > DATASET_LIMITS.rows + 1) throw new DatasetInputError("A dataset can contain at most 1,000 rows.");
  };
  for (let i = 0; i < source.length; i++) {
    const char = source[i]!;
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else field += char;
    } else if (char === ",") finishField();
    else if (char === "\n") finishRecord();
    else if (char === '"' && !field && !closed) quoted = true;
    else if (closed || char === '"') throw new DatasetInputError("Malformed CSV quoting. Use double quotes around fields containing commas or newlines.");
    else field += char;
  }
  if (quoted) throw new DatasetInputError("CSV has an unclosed quoted field.");
  if (field || record.length || closed) finishRecord();
  const headers = records.shift()?.map((value) => value.trim().toLowerCase()) || [];
  if (headers.length !== 3 || new Set(headers).size !== 3 || !["text", "language", "label"].every((name) => headers.includes(name))) {
    throw new DatasetInputError("CSV headers must be text, language, label (in any order).");
  }
  return records.map((values, index) => {
    if (values.length !== 3) throw new DatasetInputError(`CSV record ${index + 2} has ${values.length} columns; expected 3.`);
    return Object.fromEntries(headers.map((name, i) => [name, values[i]!]));
  });
}

export function readDatasetInput(body: unknown): unknown[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new DatasetInputError("Provide CSV content or sample rows.");
  const input = body as Record<string, unknown>;
  if (typeof input.csv === "string" && input.rows !== undefined) throw new DatasetInputError("Provide CSV or rows, not both.");
  const rows = typeof input.csv === "string" ? parseDatasetCsv(input.csv) : input.rows;
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > DATASET_LIMITS.rows) throw new DatasetInputError("Provide between 1 and 1,000 examples.");
  if (Buffer.byteLength(JSON.stringify(rows), "utf8") > DATASET_LIMITS.bytes) throw new DatasetInputError("Dataset content must be at most 2 MB.");
  return rows;
}

export function validateDatasetRows(rows: unknown[], existing: { text_key: string; label: string }[] = []): PreviewRow[] {
  const result = rows.map((raw, index): PreviewRow => {
    const item = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const text = typeof item.text === "string" ? item.text.normalize("NFKC").trim().replace(/\s+/g, " ") : "";
    const language = typeof item.language === "string" ? item.language.trim().toLowerCase() : "";
    const label = typeof item.label === "string" ? item.label.trim().toLowerCase() : "";
    const errors = [];
    if (!text || text.length > DATASET_LIMITS.text) errors.push("Text must contain 1–2,000 characters.");
    if (/\p{Cc}/u.test(text)) errors.push("Text contains unsupported control characters.");
    if (!DATASET_LANGUAGES.includes(language)) errors.push("Choose english, filipino, or cebuano.");
    if (!DATASET_LABELS.includes(label)) errors.push("Choose positive, neutral, or negative.");
    if (Object.keys(item).some((key) => !["text", "language", "label"].includes(key))) errors.push("Unsupported fields; provide only text, language, and label.");
    const text_key = createHash("sha256").update(`${language}\0${text.toLowerCase()}`).digest("hex");
    return { row: index + 1, text, language, label, text_key, status: errors.length ? "invalid" : "valid", message: errors.join(" ") };
  });
  const labels = new Map<string, Set<string>>();
  for (const row of result.filter((item) => item.status === "valid")) {
    if (!labels.has(row.text_key)) labels.set(row.text_key, new Set());
    labels.get(row.text_key)!.add(row.label);
  }
  const saved = new Map(existing.map((row) => [row.text_key, row.label]));
  const seen = new Set<string>();
  for (const row of result) {
    if (row.status !== "valid") continue;
    const prior = saved.get(row.text_key);
    if (labels.get(row.text_key)!.size > 1 || (prior && prior !== row.label)) {
      row.status = "conflict"; row.message = "This language/text has conflicting sentiment labels. Resolve the conflict before submission.";
    } else if (prior || seen.has(row.text_key)) {
      row.status = "duplicate"; row.message = "This example already exists in this upload or an active dataset.";
    }
    seen.add(row.text_key);
  }
  return result;
}

export function samplesToCsv(rows: { text: string; language: string; label: string }[]): string {
  // Always quote cells and neutralize spreadsheet formulas on export.
  const cell = (value: string) => `"${(/^[\s]*[=+@-]/.test(value) ? "'" + value : value).replace(/"/g, '""')}"`;
  return "text,language,label\r\n" + rows.map((row) => [row.text, row.language, row.label].map(cell).join(",")).join("\r\n");
}
