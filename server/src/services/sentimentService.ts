import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { InferenceSession, Tensor } from "onnxruntime-node";
import { supabaseAdmin } from "../config/supabaseAdmin.js";
import { getActiveModelBundle } from "./sentimentModelRegistry.js";
import { supportingProposals } from "./supportingModelRegistry.js";
import { ranked, validRule, type Scores } from "./supportingModelRouting.js";
import { chooseRawConfidenceWinner, type ConfidenceCandidate, type SentimentDecision } from "./sentimentConfidenceRouting.js";
import {
  GeminiClientError,
  candidateModels,
  clearModelExhaustion,
  markModelExhausted,
} from "./geminiRotation.js";

export type SentimentLabel =
  | "positive"
  | "neutral"
  | "negative"
  | "mixed"
  | "unclear";

export type SentimentLanguage = "english" | "filipino" | "cebuano" | "unknown";
export type LocalModelLanguage = "english" | "filipino" | "cebuano";
export type SentimentSubjectType = "report" | "comment";
export type SentimentProvider = "local" | "gemini" | "ensemble" | "none";
export type SentimentStatus =
  | "pending"
  | "succeeded"
  | "failed"
  | "unavailable"
  | "skipped";

export interface SentimentAnalysis {
  subject_type: SentimentSubjectType;
  subject_id: string;
  label: SentimentLabel;
  confidence: number;
  language: SentimentLanguage;
  provider: SentimentProvider;
  model: string;
  status: SentimentStatus;
  input_hash: string;
  source_text: string;
  error_code: string;
  analyzed_at: string | null;
  decision?: SentimentDecision | null;
}

export interface SentimentPrediction {
  label: SentimentLabel;
  confidence: number;
  language: SentimentLanguage;
  provider: SentimentProvider;
  model: string;
  input_hash: string;
  source_text: string;
  decision?: SentimentDecision;
}

interface LocalSession {
  session: InferenceSession;
  labels: SentimentLabel[];
  version: string;
}

const LOCAL_LABELS: SentimentLabel[] = ["negative", "neutral", "positive"];
const PENDING_TIMEOUT_MS = 2 * 60 * 1000;
const MAX_CLAIM_ATTEMPTS = 3;
const VALID_LABELS = new Set<SentimentLabel>([
  "positive",
  "neutral",
  "negative",
  "mixed",
  "unclear",
]);
const VALID_LANGUAGES = new Set<SentimentLanguage>([
  "english",
  "filipino",
  "cebuano",
  "unknown",
]);
const resolveModelDirectory = (): string => {
  const fromEnv = process.env.SENTIMENT_MODEL_DIR?.trim();
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    fromEnv,
    join(here, "../../models"),
    join(here, "../../../datasets/models"),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (existsSync(join(candidate, "sentiment_english.onnx"))) {
      return resolve(candidate);
    }
  }
  return resolve(candidates[0] ?? join(here, "../../models"));
};

const modelDirectory = resolveModelDirectory();
const localSessions = new Map<SentimentLanguage, { version: string; session: Promise<LocalSession> }>();


const clamp = (value: number, minimum = 0, maximum = 1): number =>
  Math.min(maximum, Math.max(minimum, value));

const asErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const safeConfidence = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clamp(parsed, 0, 1) : 0;
};

const normalizeText = (text: string): string => text.replace(/\s+/g, " ").trim();

export const normalizeSentimentLabel = (value: unknown): SentimentLabel | null => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (VALID_LABELS.has(normalized as SentimentLabel)) {
    return normalized as SentimentLabel;
  }

  if (normalized === "concerned" || normalized === "anxious") return "negative";
  if (normalized === "mixed" || normalized === "no majority") return "mixed";
  if (normalized === "unclear" || normalized === "unknown") return "unclear";
  return null;
};

const LANGID_LABELS = ["cebuano", "english", "filipino"];
const LANGID_MIN_CONFIDENCE = 0.5;
let languageSession: Promise<InferenceSession> | null = null;
let languageVersion = "";

const loadLanguageSession = async (): Promise<InferenceSession> => {
  const bundle = await getActiveModelBundle(modelDirectory);
  if (languageSession && languageVersion === bundle.version) return languageSession;
  const previous = languageSession;
  const previousVersion = languageVersion;
  languageVersion = bundle.version;
  const loading = (async () => {
    const path = join(bundle.directory, "language_id.onnx");
    if (!existsSync(path)) {
      throw new Error(`Language id model is missing: ${path}`);
    }
    return InferenceSession.create(path);
  })().catch((error) => {
    if (languageSession === loading) {
      languageSession = previous;
      languageVersion = previousVersion;
    }
    if (previous) return previous;
    throw error;
  });
  languageSession = loading;
  return loading;
};

export const detectLanguage = async (
  text: string
): Promise<SentimentLanguage> => {
  const normalized = normalizeText(text);
  if (!normalized) return "unknown";
  try {
    const session = await loadLanguageSession();
    const input = new Tensor("string", [normalized], [1, 1]);
    const output = await session.run({ text: input });
    const probabilities = output.probabilities?.data;
    if (!probabilities || probabilities.length < LANGID_LABELS.length) {
      throw new Error("Language id model returned invalid probabilities");
    }
    let bestIndex = 0;
    for (let index = 1; index < LANGID_LABELS.length; index += 1) {
      if (Number(probabilities[index]) > Number(probabilities[bestIndex])) {
        bestIndex = index;
      }
    }
    if (Number(probabilities[bestIndex]) < LANGID_MIN_CONFIDENCE) {
      return "unknown";
    }
    return (LANGID_LABELS[bestIndex] as SentimentLanguage) ?? "unknown";
  } catch {
    return "unknown";
  }
};

export const sentimentInputHash = (text: string): string =>
  createHash("sha256").update(normalizeText(text), "utf8").digest("hex");

const loadLocalSession = async (
  language: LocalModelLanguage
): Promise<LocalSession> => {
  const bundle = await getActiveModelBundle(modelDirectory);
  const existing = localSessions.get(language);
  if (existing?.version === bundle.version) return existing.session;

  const loading = (async (): Promise<LocalSession> => {
    const path = join(bundle.directory, `sentiment_${language}.onnx`);
    if (!existsSync(path)) {
      throw new Error(`Local sentiment model is missing: ${path}`);
    }
    const session = await InferenceSession.create(path);
    return { session, labels: [...LOCAL_LABELS], version: bundle.version };
  })().catch((error) => {
    if (localSessions.get(language)?.session === loading) {
      if (existing) localSessions.set(language, existing);
      else localSessions.delete(language);
    }
    if (existing) return existing.session;
    throw error;
  });
  localSessions.set(language, { version: bundle.version, session: loading });
  return loading;
};

const localPredictionDependencies = {
  supportingProposals,
  async recordSupportUsage(ids: string[]) {
    const { error } = await supabaseAdmin.rpc("record_sentiment_support_usage", { p_ids: ids });
    if (error) throw new Error("Could not record supporting model usage");
  },
};

const selectRawPrediction = (
  template: SentimentPrediction,
  candidates: ConfidenceCandidate[]
): SentimentPrediction => {
  const result = chooseRawConfidenceWinner(candidates);
  return {
    ...template,
    label: result.label,
    confidence: result.confidence,
    provider: result.winner?.source === "gemini" ? "gemini"
      : result.winner?.source === "supporting" ? "ensemble"
      : result.winner ? "local" : candidates.length > 1 ? "ensemble" : template.provider,
    model: result.winner?.model ?? `raw-confidence-v1:${result.decision.reason}`,
    decision: result.decision,
  };
};

const predictionCandidates = (prediction: SentimentPrediction): ConfidenceCandidate[] =>
  prediction.decision?.candidates ?? [{
    id: `${prediction.provider}:${prediction.model}`,
    source: prediction.provider === "gemini" ? "gemini" : "builtin",
    model: prediction.model,
    label: prediction.label,
    confidence: prediction.confidence,
  }];

const applyRawPolicy = (prediction: SentimentPrediction): SentimentPrediction =>
  selectRawPrediction(prediction, predictionCandidates(prediction));

const scoreCandidate = (id: string, source: "builtin" | "supporting", model: string, scores: Scores): ConfidenceCandidate => {
  const top = ranked(scores);
  // An exact within-model class tie is an abstention, not an arbitrary label.
  const tied = Object.values(scores).filter(value => value === top.score).length > 1;
  return { id, source, model, scores, label: tied ? "unclear" : top.label, confidence: top.score };
};

const runLocalPrediction = async (
  language: LocalModelLanguage,
  text: string,
  recordUsage = true
): Promise<SentimentPrediction> => {
  const { session, labels, version } = await loadLocalSession(language);
  const input = new Tensor("string", [text], [1, 1]);
  const output = await session.run({ text: input });
  const probabilities = output.probabilities?.data;
  if (!probabilities || probabilities.length < labels.length) {
    throw new Error("Local sentiment model returned invalid probabilities");
  }

  let bestIndex = 0;
  for (let index = 1; index < labels.length; index += 1) {
    if (Number(probabilities[index]) > Number(probabilities[bestIndex])) {
      bestIndex = index;
    }
  }
  const label = labels[bestIndex];
  if (!label) throw new Error("Local sentiment model returned an invalid label");

  const builtin: SentimentPrediction = {
    label,
    confidence: clamp(Number(probabilities[bestIndex])),
    language,
    provider: "local",
    model: `word-character-tfidf-logistic-regression-${language}@${version}`,
    input_hash: sentimentInputHash(text),
    source_text: text,
  };
  const scores: Scores = {
    negative: Number(probabilities[0]), neutral: Number(probabilities[1]), positive: Number(probabilities[2]),
  };
  const candidates = [scoreCandidate(`builtin:${language}@${version}`, "builtin", builtin.model, scores)];
  // Supports still require the immutable built-in bundle and registry checks.
  if (version !== "bundled") return selectRawPrediction(builtin, candidates);
  try {
    const proposals = await localPredictionDependencies.supportingProposals(modelDirectory, language, text, scores);
    for (const proposal of proposals) {
      if (!validRule(proposal.rule)) continue;
      try {
        candidates.push(scoreCandidate(`supporting:${proposal.id}`, "supporting",
          `supporting:${proposal.id}@${proposal.version}`, proposal.scores));
      } catch { /* A malformed support cannot discard valid model predictions. */ }
    }
    if (recordUsage && proposals.length) {
      // Telemetry must not turn a successful prediction into a failed analysis.
      await localPredictionDependencies.recordSupportUsage([...new Set(proposals.map(proposal => proposal.id))])
        .catch(error => console.error("[Sentiment support usage]", asErrorMessage(error)));
    }
    return selectRawPrediction(builtin, candidates);
  } catch (error) {
    console.error("[Sentiment supporting fallback]", asErrorMessage(error));
    return selectRawPrediction(builtin, candidates);
  }
};

const loadSentimentSettings = async (): Promise<Record<string, string>> => {
  const keys = [
    "sentiment_local_model_enabled",
    "sentiment_gemini_enabled",
    "sentiment_cebuano_mode",
    "ai_model_name",
    "ai_temperature",
    "ai_timeout",
  ];
  const { data } = await supabaseAdmin
    .from("system_settings")
    .select("key, value")
    .in("key", keys);
  return Object.fromEntries((data || []).map((row) => [row.key, row.value]));
};

const settings = (() => {
  let values = new Map<string, string>();
  let loadedAt = 0;
  return async (): Promise<Record<string, string>> => {
    if (Date.now() - loadedAt < 30_000) return Object.fromEntries(values);
    try {
      values = new Map(
        Object.entries(await loadSentimentSettings())
      );
      loadedAt = Date.now();
    } catch {
      return Object.fromEntries(values);
    }
    return Object.fromEntries(values);
  };
})();

const parseBooleanSetting = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  return value === "true" || value === "1";
};

const parseFloatSetting = (
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clamp(parsed, minimum, maximum) : fallback;
};

const parseIntSetting = (
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? clamp(parsed, minimum, maximum) : fallback;
};

const configuredModelName = (config: Record<string, string>): string => {
  const model = config.ai_model_name || process.env.GEMINI_SENTIMENT_MODEL || "gemini-2.5-flash";
  return model.replace(/^models\//, "");
};

const geminiConfigured = (): boolean => Boolean(process.env.GEMINI_API_KEY?.trim());

const buildGeminiSentimentPrompt = (
  text: string,
  language: SentimentLanguage,
  context?: string
): string => {
  const contextLine = context
    ? `\nSurrounding post that this text replies to (use it to judge sarcasm): ${JSON.stringify(context)}\n`
    : "";
  return `Classify the sentiment of this community safety text. Respond with JSON only: {"label":"positive|neutral|negative|mixed|unclear","confidence":0,"language":"english|filipino|cebuano|unknown"}. The detected language is ${language}. Do not infer credibility or severity.
Sarcasm rules: label the writer's actual attitude toward the situation, not the literal words. Treat praise as sarcastic (so negative) only when mocking cues are present: praise in quotation marks; exaggerated reassurance such as grabe ka solid, safe kaayo, peace of mind, salamat kaayo used while or right after describing a problem, or matching a bad situation in the surrounding post; laughter (hahaha, lol, emoji) mocking the situation rather than expressing joy. Example: a reply saying Hahahaha safe kaayo bitaw on a post about recurring crime is negative. Standalone praise, thanks, or relief with no mocking cues (Solid kaayo!, Salamat kaayo boss) is genuinely positive.${contextLine}Text: ${JSON.stringify(text)}`;
};

const callGeminiSentiment = async (
  text: string,
  language: SentimentLanguage,
  config: Record<string, string>,
  context?: string
): Promise<SentimentPrediction> => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("Gemini API key is not configured");
  const primaryModel = configuredModelName(config);
  const timeoutMs = parseIntSetting(config.ai_timeout, 15000, 1000, 120000);
  const prompt = buildGeminiSentimentPrompt(text, language, context);
  const maxPasses = 2;
  let lastError: unknown;

  for (let pass = 1; pass <= maxPasses; pass++) {
    for (const model of candidateModels(primaryModel)) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: parseFloatSetting(config.ai_temperature, 0.1, 0, 1),
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT",
                properties: {
                  label: { type: "STRING", enum: ["positive", "neutral", "negative", "mixed", "unclear"] },
                  confidence: { type: "NUMBER" },
                  language: { type: "STRING", enum: ["english", "filipino", "cebuano", "unknown"] },
                },
                required: ["label", "confidence", "language"],
              },
            },
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          const message = `Gemini sentiment request failed with ${response.status} on ${model}${
            detail ? `: ${detail.slice(0, 300)}` : ""
          }`;
          if (response.status === 429 || response.status >= 500) {
            if (response.status === 429) markModelExhausted(model);
            throw new Error(message);
          }
          throw new GeminiClientError(message);
        }
        const payload = (await response.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const raw = payload.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!raw) throw new Error("Gemini sentiment response was empty");
        const parsed = JSON.parse(raw) as {
          label?: unknown;
          confidence?: unknown;
          language?: unknown;
        };
        const label = normalizeSentimentLabel(parsed.label);
        if (!label) throw new Error("Gemini returned an unsupported sentiment label");
        if (typeof parsed.confidence !== "number" || !Number.isFinite(parsed.confidence) || parsed.confidence < 0 || parsed.confidence > 1) {
          throw new Error("Gemini returned an invalid confidence score");
        }
        clearModelExhaustion(model);
        return {
          label,
          confidence: parsed.confidence,
          language,
          provider: "gemini",
          model,
          input_hash: sentimentInputHash(text),
          source_text: text,
        };
      } catch (err) {
        if (err instanceof GeminiClientError) throw err;
        lastError = err;
      } finally {
        clearTimeout(timeoutId);
      }
    }
    if (pass < maxPasses) {
      await new Promise((resolve) => setTimeout(resolve, pass * 1000));
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error("Gemini sentiment request failed");
};

const unavailableResult = (
  text: string,
  language: SentimentLanguage,
  errorCode: string,
  provider: SentimentProvider = "none"
): SentimentPrediction => ({
  label: "unclear",
  confidence: 0,
  language,
  provider,
  model: "none",
  input_hash: sentimentInputHash(text),
  source_text: text,
});

const fuseLocalWithGeminiAssist = (
  local: SentimentPrediction,
  gemini: SentimentPrediction
): { prediction: SentimentPrediction; errorCode: string } => {
  return {
    // Flatten source evidence, NOT a pre-collapsed local winner: otherwise a
    // local conflicting tie could be lost before comparison with Gemini.
    prediction: selectRawPrediction(local, [...predictionCandidates(local), ...predictionCandidates(gemini)]),
    errorCode: "",
  };
};

type AssistAttempt<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const attempt = async <T>(fn: () => Promise<T>): Promise<AssistAttempt<T>> => {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return { ok: false, error: asErrorMessage(error) };
  }
};

const predictionDependencies = { settings, detectLanguage, runLocalPrediction, callGeminiSentiment };

const predict = async (
  textValue: string,
  context?: string,
  localOnly = false,
  recordUsage = true
): Promise<{ prediction: SentimentPrediction; errorCode: string }> => {
  const text = normalizeText(textValue);
  if (!text) {
    return {
      prediction: unavailableResult(text, "unknown", "empty_input"),
      errorCode: "empty_input",
    };
  }

  const config = await predictionDependencies.settings();
  const detectedLanguage = await predictionDependencies.detectLanguage(text);
  const localEnabled = parseBooleanSetting(config.sentiment_local_model_enabled, true);
  const geminiEnabled = parseBooleanSetting(config.sentiment_gemini_enabled, false);
  const cebuanoMode = config.sentiment_cebuano_mode || "local";
  const localLanguage =
    detectedLanguage === "english" ||
    detectedLanguage === "filipino" ||
    (detectedLanguage === "cebuano" && cebuanoMode === "local");
  const shouldUseLocal = localEnabled && localLanguage;
  let shouldUseGemini = !localOnly && geminiEnabled && geminiConfigured();

  if (detectedLanguage === "cebuano") {
    if (cebuanoMode === "disabled") {
      shouldUseGemini = false;
    } else {
      shouldUseGemini = !localOnly && geminiEnabled && geminiConfigured();
    }
  }

  if (shouldUseLocal && localLanguage) {
    const [localResult, geminiResult] = await Promise.all([
      attempt(() => predictionDependencies.runLocalPrediction(detectedLanguage, text, recordUsage)),
      shouldUseGemini
        ? attempt(() => predictionDependencies.callGeminiSentiment(text, detectedLanguage, config, context))
        : Promise.resolve(null),
    ]);

    if (localResult.ok) {
      if (!geminiResult || !geminiResult.ok) {
        if (shouldUseGemini) {
          console.error(
            "[Sentiment assist] Gemini attempt failed; using local only:",
            geminiResult && !geminiResult.ok ? geminiResult.error : "skipped"
          );
        }
        return { prediction: applyRawPolicy(localResult.value), errorCode: "" };
      }
      return fuseLocalWithGeminiAssist(localResult.value, geminiResult.value);
    }

    if (geminiResult?.ok) {
      return { prediction: applyRawPolicy(geminiResult.value), errorCode: "" };
    }

    if (!shouldUseGemini) {
      return {
        prediction: unavailableResult(
          text,
          detectedLanguage,
          `local:${localResult.error}`,
          "local"
        ),
        errorCode: `local:${localResult.error}`,
      };
    }

    const geminiError = !geminiResult
      ? "gemini_disabled"
      : geminiResult.error;
    return {
      prediction: unavailableResult(
        text,
        detectedLanguage,
        `local:${localResult.error};gemini:${geminiError}`,
        "none"
      ),
      errorCode: `local:${localResult.error};gemini:${geminiError}`,
    };
  }

  if (shouldUseGemini) {
    try {
      return {
        prediction: applyRawPolicy(await predictionDependencies.callGeminiSentiment(text, detectedLanguage, config, context)),
        errorCode: "",
      };
    } catch (error) {
      return {
        prediction: unavailableResult(
          text,
          detectedLanguage,
          `gemini:${asErrorMessage(error)}`,
          "gemini"
        ),
        errorCode: `gemini:${asErrorMessage(error)}`,
      };
    }
  }

  if (detectedLanguage === "unknown" && localEnabled) {
    const fallbackLanguages: LocalModelLanguage[] = ["english", "filipino"];
    if (cebuanoMode !== "disabled") fallbackLanguages.push("cebuano");
    const fallbackResults = await Promise.all(
      fallbackLanguages.map((language) =>
        attempt(() => predictionDependencies.runLocalPrediction(language, text, recordUsage))
      )
    );
    const available = fallbackResults.filter((result): result is { ok: true; value: SentimentPrediction } => result.ok);
    if (available.length) {
      const candidates = available.flatMap(result => predictionCandidates(result.value));
      const prediction = selectRawPrediction(available[0]!.value, candidates);
      const winningPrediction = available.find(result => predictionCandidates(result.value).some(candidate => candidate.id === prediction.decision?.winnerId));
      prediction.language = winningPrediction?.value.language ?? "unknown";
      return { prediction, errorCode: "" };
    }
  }

  return {
    prediction: unavailableResult(
      text,
      detectedLanguage,
      shouldUseLocal ? "local_unavailable" : "gemini_unavailable"
    ),
    errorCode: shouldUseLocal ? "local_unavailable" : "gemini_unavailable",
  };
};

export const __testing = {
  runLocalPrediction,
  localPredictionDependencies,
  fuseLocalWithGeminiAssist,
  predict,
  predictionDependencies,
  buildGeminiSentimentPrompt,
};

type SentimentRequest = {
  force?: boolean;
  requestId?: string;
  /** Disable external Gemini calls for this request without changing settings. */
  localOnly?: boolean;
};

type StoredSentimentRow = {
  id?: string;
  subject_id: string;
  label: string;
  confidence: number | string | null;
  language: string;
  provider: string;
  model: string;
  status: string;
  input_hash: string;
  source_text: string;
  error_code: string;
  analyzed_at: string | null;
  request_id: string | null;
  updated_at?: string | null;
  decision?: SentimentDecision | null;
};

type ClaimResult = {
  claimed: boolean;
  current: StoredSentimentRow | null;
  claimId?: string | undefined;
};

const sentimentSelect =
  "id, subject_id, label, confidence, language, provider, model, status, input_hash, source_text, error_code, analyzed_at, request_id, updated_at, decision";

const toAnalysis = (
  subjectType: SentimentSubjectType,
  row: StoredSentimentRow
): SentimentAnalysis => ({
  subject_type: subjectType,
  subject_id: row.subject_id,
  label: normalizeSentimentLabel(row.label) || "unclear",
  confidence: safeConfidence(row.confidence),
  language: VALID_LANGUAGES.has(row.language as SentimentLanguage)
    ? (row.language as SentimentLanguage)
    : "unknown",
  provider: (["local", "gemini", "ensemble", "none"] as const).includes(
    row.provider as SentimentProvider
  )
    ? (row.provider as SentimentProvider)
    : "none",
  model: row.model || "none",
  status: (
    ["pending", "succeeded", "failed", "unavailable", "skipped"] as const
  ).includes(row.status as SentimentStatus)
    ? (row.status as SentimentStatus)
    : "unavailable",
  input_hash: row.input_hash || "",
  source_text: row.source_text || "",
  error_code: row.error_code || "",
  analyzed_at: row.analyzed_at ?? null,
  decision: row.decision ?? null,
});

const unavailableAnalysis = (
  subjectType: SentimentSubjectType,
  subjectId: string,
  errorCode: string,
  inputHash: string,
  sourceText: string
): SentimentAnalysis => ({
  subject_type: subjectType,
  subject_id: subjectId,
  label: "unclear",
  confidence: 0,
  language: "unknown",
  provider: "none",
  model: "none",
  status: "unavailable",
  input_hash: inputHash,
  source_text: sourceText,
  error_code: errorCode,
  analyzed_at: null,
});

const failedAnalysis = (
  subjectType: SentimentSubjectType,
  subjectId: string,
  errorCode: string,
  inputHash: string,
  sourceText: string
): SentimentAnalysis => ({
  subject_type: subjectType,
  subject_id: subjectId,
  label: "unclear",
  confidence: 0,
  language: "unknown",
  provider: "none",
  model: "none",
  status: "failed",
  input_hash: inputHash,
  source_text: sourceText,
  error_code: errorCode,
  analyzed_at: null,
});

const getExistingAnalysis = async (
  subjectType: SentimentSubjectType,
  subjectId: string
): Promise<StoredSentimentRow | null> => {
  const { data, error } = await supabaseAdmin
    .from("sentiment_analysis")
    .select(sentimentSelect)
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as StoredSentimentRow | null) ?? null;
};

const isPendingStale = (row: StoredSentimentRow | null): boolean => {
  if (!row || row.status !== "pending") return false;
  if (!row.updated_at) return true;
  const updatedAt = new Date(row.updated_at).getTime();
  return !Number.isFinite(updatedAt) || Date.now() - updatedAt >= PENDING_TIMEOUT_MS;
};

const claimPending = async (
  subjectType: SentimentSubjectType,
  subjectId: string,
  text: string,
  language: SentimentLanguage,
  inputHash: string,
  requestId: string,
  force: boolean
): Promise<ClaimResult> => {
  const pending = {
    subject_type: subjectType,
    subject_id: subjectId,
    label: "unclear",
    confidence: 0,
    language,
    provider: "none",
    model: "pending",
    status: "pending",
    input_hash: inputHash,
    source_text: text,
    error_code: "",
    analyzed_at: null,
    request_id: requestId,
    decision: null,
  };

  const insertResult = await supabaseAdmin
    .from("sentiment_analysis")
    .insert([pending])
    .select(sentimentSelect)
    .maybeSingle();

  if (!insertResult.error && insertResult.data) {
    const inserted = insertResult.data as StoredSentimentRow;
    return {
      claimed:
        inserted.request_id === requestId && inserted.input_hash === inputHash,
      current: inserted,
      claimId: inserted.id,
    };
  }
  if (insertResult.error && insertResult.error.code !== "23505") {
    throw new Error(insertResult.error.message);
  }

  const current = await getExistingAnalysis(subjectType, subjectId);
  if (!current) {
    return { claimed: false, current: null };
  }

  const currentIsActive = current.status === "pending" && !isPendingStale(current);
  if (currentIsActive && current.input_hash === inputHash) {
    if (current.request_id !== requestId) {
      return { claimed: false, current };
    }
    if (!force) {
      return { claimed: false, current };
    }
  }

  if (
    !force &&
    current.input_hash === inputHash &&
    (current.status === "succeeded" ||
      current.status === "unavailable" ||
      current.status === "skipped")
  ) {
    return { claimed: false, current };
  }

  if (!current.id) {
    return { claimed: false, current };
  }

  if (currentIsActive && current.input_hash !== inputHash) {
    return { claimed: false, current };
  }

  let updateQuery = supabaseAdmin
    .from("sentiment_analysis")
    .update(pending)
    .eq("id", current.id)
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .eq("input_hash", current.input_hash || "")
    .eq("status", current.status);

  if (current.request_id === null || current.request_id === undefined) {
    updateQuery = updateQuery.is("request_id", null);
  } else {
    updateQuery = updateQuery.eq("request_id", current.request_id);
  }
  if (current.updated_at === null || current.updated_at === undefined) {
    updateQuery = updateQuery.is("updated_at", null);
  } else {
    updateQuery = updateQuery.eq("updated_at", current.updated_at);
  }

  const updateResult = await updateQuery.select(sentimentSelect).maybeSingle();
  if (updateResult.error) throw new Error(updateResult.error.message);
  if (updateResult.data) {
    const updated = updateResult.data as StoredSentimentRow;
    return {
      claimed: updated.request_id === requestId && updated.input_hash === inputHash,
      current: updated,
      claimId: updated.id,
    };
  }

  const latest = await getExistingAnalysis(subjectType, subjectId);
  return {
    claimed: latest?.request_id === requestId && latest.input_hash === inputHash,
    current: latest,
    claimId: latest?.id,
  };
};

const discardClaim = async (
  subjectType: SentimentSubjectType,
  subjectId: string,
  claimId: string,
  inputHash: string,
  requestId: string
): Promise<void> => {
  const { error } = await supabaseAdmin
    .from("sentiment_analysis")
    .update({
      status: "unavailable",
      label: "unclear",
      confidence: 0,
      provider: "none",
      model: "none",
      error_code: "source_changed",
      decision: null,
      analyzed_at: null,
    })
    .eq("id", claimId)
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .eq("input_hash", inputHash)
    .eq("request_id", requestId)
    .in("status", [
      "pending",
      "succeeded",
      "failed",
      "unavailable",
      "skipped",
    ]);
  if (error) throw new Error(error.message);
};

const persistPrediction = async (
  subjectType: SentimentSubjectType,
  subjectId: string,
  claimId: string,
  prediction: SentimentPrediction,
  status: SentimentStatus,
  errorCode: string,
  requestId: string
): Promise<StoredSentimentRow | null> => {
  const analyzedAt = status === "succeeded" ? new Date().toISOString() : null;
  const { data, error } = await supabaseAdmin
    .from("sentiment_analysis")
    .update({
      label: prediction.label,
      confidence: safeConfidence(prediction.confidence),
      language: prediction.language,
      provider: prediction.provider,
      model: prediction.model,
      status,
      input_hash: prediction.input_hash,
      source_text: prediction.source_text,
      error_code: errorCode.slice(0, 500),
      analyzed_at: analyzedAt,
      request_id: requestId,
      decision: prediction.decision ?? null,
    })
    .eq("id", claimId)
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .eq("status", "pending")
    .eq("input_hash", prediction.input_hash)
    .eq("request_id", requestId)
    .select(sentimentSelect)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as StoredSentimentRow | null) ?? null;
};

const loadSubjectText = async (
  subjectType: SentimentSubjectType,
  subjectId: string
): Promise<{ text: string; context?: string } | null> => {
  if (subjectType === "comment") {
    const { data, error } = await supabaseAdmin
      .from("report_comments")
      .select("id, content, reports(id, details)")
      .eq("id", subjectId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as {
      content?: string | null;
      reports?: { details?: string | null } | null;
    };
    const text = normalizeText(String(row.content ?? ""));
    const context = normalizeText(String(row.reports?.details ?? "")).slice(0, 600);
    return context ? { text, context } : { text };
  }
  const { data, error } = await supabaseAdmin
    .from("reports")
    .select("id, details")
    .eq("id", subjectId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { details?: string | null };
  const text = normalizeText(String(row.details ?? ""));
  return { text };
};

export const sentimentService = {
  // Diagnostic only: reuse serving policy without claims, persistence or usage writes.
  async testText(text: string, context?: string) {
    return predict(text, context, false, false);
  },
  async reanalyzeReportsWithComments(reportIds: string[]) {
    const ids = [...new Set(reportIds)];
    const commentIds = new Set<string>();
    // Read authoritative comments, not just unresolved comments visible in the UI.
    // Bound both URL size and database response size for large threads/groups.
    for (let offset = 0; offset < ids.length; offset += 100) {
      for (let from = 0; ; from += 500) {
        const { data, error } = await supabaseAdmin.from("report_comments").select("id")
          .in("report_id", ids.slice(offset, offset + 100)).order("id").range(from, from + 499);
        if (error) throw new Error("Could not load report comments for reanalysis.");
        for (const row of data || []) commentIds.add(row.id);
        if (!data || data.length < 500) break;
      }
    }
    const results = await this.analyzeMany("report", ids, { force: true });
    const commentResults = await this.analyzeMany("comment", [...commentIds], { force: true });
    return { results, commentResults, commentCount: commentIds.size };
  },

  async analyze(
    subjectType: SentimentSubjectType,
    subjectId: string,
    options: SentimentRequest = {}
  ): Promise<SentimentAnalysis> {
    const requestId = options.requestId || randomUUID();
    let lastInputHash = sentimentInputHash("");

    for (let attempt = 0; attempt < MAX_CLAIM_ATTEMPTS; attempt += 1) {
      const subject = await loadSubjectText(subjectType, subjectId);
      if (!subject) {
        return unavailableAnalysis(
          subjectType,
          subjectId,
          "subject_missing",
          sentimentInputHash(""),
          ""
        );
      }

      const language = await detectLanguage(subject.text);
      const inputHash = sentimentInputHash(subject.text);
      lastInputHash = inputHash;
      const existingRow = await getExistingAnalysis(subjectType, subjectId);

      if (!options.force && existingRow?.input_hash === inputHash) {
        if (
          existingRow.status === "succeeded" ||
          existingRow.status === "unavailable" ||
          existingRow.status === "skipped"
        ) {
          return toAnalysis(subjectType, existingRow);
        }
        if (
          existingRow.status === "pending" &&
          existingRow.request_id === requestId
        ) {
          return toAnalysis(subjectType, existingRow);
        }
      }

      const claim = await claimPending(
        subjectType,
        subjectId,
        subject.text,
        language,
        inputHash,
        requestId,
        options.force === true
      );

      if (!claim.claimed) {
        const current = claim.current;
        if (!current) continue;
        if (current.input_hash !== inputHash) continue;
        if (current.request_id === requestId) {
          if (current.status === "pending") {
            return toAnalysis(subjectType, current);
          }
          if (
            current.status === "succeeded" ||
            current.status === "unavailable" ||
            current.status === "skipped"
          ) {
            return toAnalysis(subjectType, current);
          }
          continue;
        }
        if (current.status === "pending") {
          return toAnalysis(subjectType, current);
        }
        continue;
      }

      const claimId = claim.claimId;
      if (!claimId) continue;

      const currentAfterPending = await loadSubjectText(subjectType, subjectId);
      if (
        !currentAfterPending ||
        sentimentInputHash(currentAfterPending.text) !== inputHash
      ) {
        await discardClaim(
          subjectType,
          subjectId,
          claimId,
          inputHash,
          requestId
        ).catch(() => {});
        if (!currentAfterPending) {
          return unavailableAnalysis(
            subjectType,
            subjectId,
            "subject_missing",
            sentimentInputHash(""),
            ""
          );
        }
        continue;
      }

      const { prediction, errorCode } = await predict(subject.text, subject.context, options.localOnly);
      const status: SentimentStatus = errorCode
        ? prediction.provider === "none"
          ? "unavailable"
          : "failed"
        : "succeeded";
      const persisted = await persistPrediction(
        subjectType,
        subjectId,
        claimId,
        prediction,
        status,
        errorCode,
        requestId
      );
      if (!persisted) {
        const latest = await getExistingAnalysis(subjectType, subjectId);
        if (latest?.input_hash === inputHash) {
          return toAnalysis(subjectType, latest);
        }
        continue;
      }

      const currentAfterPrediction = await loadSubjectText(
        subjectType,
        subjectId
      );
      if (
        !currentAfterPrediction ||
        sentimentInputHash(currentAfterPrediction.text) !== inputHash
      ) {
        await discardClaim(
          subjectType,
          subjectId,
          claimId,
          inputHash,
          requestId
        ).catch(() => {});
        if (!currentAfterPrediction) {
          return unavailableAnalysis(
            subjectType,
            subjectId,
            "subject_missing",
            sentimentInputHash(""),
            ""
          );
        }
        continue;
      }

      return toAnalysis(subjectType, persisted);
    }

    const latest = await getExistingAnalysis(subjectType, subjectId);
    if (
      latest &&
      latest.input_hash === lastInputHash &&
      (latest.status === "succeeded" ||
        latest.status === "unavailable" ||
        latest.status === "skipped" ||
        latest.status === "pending")
    ) {
      return toAnalysis(subjectType, latest);
    }
    return failedAnalysis(
      subjectType,
      subjectId,
      "claim_retry_exhausted",
      lastInputHash,
      ""
    );
  },

  async analyzeMany(
    subjectType: SentimentSubjectType,
    subjectIds: string[],
    options: { force?: boolean; requestId?: string } = {}
  ): Promise<Record<string, SentimentAnalysis>> {
    const results: Record<string, SentimentAnalysis> = {};
    for (const id of [...new Set(subjectIds)]) {
      try {
        results[id] = await this.analyze(subjectType, id, options);
      } catch (error) {
        results[id] = failedAnalysis(
          subjectType,
          id,
          asErrorMessage(error).slice(0, 500),
          sentimentInputHash(""),
          ""
        );
      }
    }
    return results;
  },
};
