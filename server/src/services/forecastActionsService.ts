import { supabaseAdmin } from "../config/supabaseAdmin.js";
import {
  GeminiClientError,
  candidateModels,
  clearModelExhaustion,
  markModelExhausted,
} from "./geminiRotation.js";

export type ForecastActionFacts = {
  riskLevel: string;
  probability: number;
  zones: Array<{ location: string; count: number }>;
  timeWindow: string;
  trendPct: number;
  crimeTypes: Array<{ label: string; value: string }>;
  activeHighCritical: number;
  activeTotal: number;
};

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 50;

const cache = new Map<string, { actions: string[]; expiresAt: number }>();
const inflight = new Map<string, Promise<string[]>>();

export const ruleBasedActions = (facts: ForecastActionFacts): string[] => {
  if (facts.activeTotal <= 0) {
    return ["Not enough report data to recommend actions yet"];
  }

  const primaryZone = facts.zones[0]?.location || "";
  const actions: string[] = [];

  if (facts.riskLevel === "HIGH" && primaryZone && facts.timeWindow) {
    actions.push(`Increase patrol in ${primaryZone} around ${facts.timeWindow}`);
  } else if (facts.riskLevel === "MEDIUM" && primaryZone && facts.timeWindow) {
    actions.push(`Monitor ${primaryZone} closely during ${facts.timeWindow}`);
  } else {
    actions.push("Maintain routine patrol schedules");
  }

  if (facts.riskLevel !== "LOW") {
    actions.push("Notify nearest response units and prepare standby");
  }

  const topType = facts.crimeTypes[0]?.label;
  if (topType) {
    actions.push(
      `Watch for ${topType} incidents - most common high-severity type`
    );
  }

  if (facts.trendPct > 0) {
    actions.push(
      `Reports are up ${facts.trendPct}% vs the previous period - review incoming reports promptly`
    );
  }

  if (facts.activeHighCritical > 0) {
    actions.push("Prioritize verified high-severity reports for resolution");
  }

  return actions.slice(0, 5);
};

export const actionsFingerprint = (facts: ForecastActionFacts): string =>
  [
    facts.riskLevel,
    facts.probability,
    facts.timeWindow,
    facts.trendPct,
    facts.activeHighCritical,
    facts.activeTotal,
    facts.zones.map((z) => `${z.location}:${z.count}`).join("|"),
    facts.crimeTypes.map((c) => `${c.label}:${c.value}`).join("|"),
  ].join("::");

export const buildActionsPrompt = (facts: ForecastActionFacts): string => {
  const zonesLine = facts.zones.length
    ? facts.zones
        .map(
          (z, i) => `${i + 1}. ${z.location} (${z.count} high-severity reports)`
        )
        .join("\n")
    : "None identified";
  const typesLine = facts.crimeTypes.length
    ? facts.crimeTypes.map((c) => `${c.label} ${c.value}`).join(", ")
    : "None identified";

  return [
    "You write recommended actions for police and barangay safety staff based on a statistical crime forecast. The forecast numbers below are computed by the system - treat them as the only source of truth.",
    "Rules:",
    "- Return 3 to 5 short actions as a JSON array of strings.",
    "- Each action must be at most 160 characters, imperative, and actionable.",
    "- Use only the facts below. Never invent locations, times, percentages, or crime types.",
    "- Mention the zone, time window, top crime type, or trend when relevant to the action.",
    "- No markdown, no numbering, no text outside the JSON array.",
    "Facts:",
    `- Risk level: ${facts.riskLevel} (probability ${facts.probability}% in the peak hour)`,
    `- Possible high-risk zones:\n${zonesLine}`,
    `- Estimated peak time window: ${facts.timeWindow || "unknown"}`,
    `- Trend: ${facts.trendPct >= 0 ? "+" : ""}${facts.trendPct}% reports vs previous 7 days`,
    `- Top incident types: ${typesLine}`,
    `- Active high/critical reports: ${facts.activeHighCritical} of ${facts.activeTotal} active reports`,
  ].join("\n");
};

export const parseActionsResponse = (raw: string): string[] | null => {
  try {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();
    const parsed = JSON.parse(cleaned) as unknown;
    const list = Array.isArray(parsed)
      ? parsed
      : ((parsed as { actions?: unknown } | null)?.actions ?? null);
    if (!Array.isArray(list)) return null;

    const actions = list
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim().replace(/^(?:[-•*]|\d+[.)])\s*/, ""))
      .filter((item) => item.length > 0)
      .map((item) => (item.length > 180 ? item.slice(0, 180) : item))
      .slice(0, 5);

    if (actions.length < 3) return null;
    return actions;
  } catch {
    return null;
  }
};

const loadActionSettings = async (): Promise<Record<string, string>> => {
  const { data } = await supabaseAdmin
    .from("system_settings")
    .select("key, value")
    .in("key", ["ai_model_name", "ai_temperature", "ai_timeout"]);
  return Object.fromEntries(
    (data || []).map((row) => [row.key, row.value]) as Array<[string, string]>
  );
};

const settings = (() => {
  let values = new Map<string, string>();
  let loadedAt = 0;
  return async (): Promise<Record<string, string>> => {
    if (Date.now() - loadedAt < 30_000) return Object.fromEntries(values);
    try {
      values = new Map(Object.entries(await loadActionSettings()));
      loadedAt = Date.now();
    } catch {
      return Object.fromEntries(values);
    }
    return Object.fromEntries(values);
  };
})();

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

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

const callGeminiActions = async (
  prompt: string,
  config: Record<string, string>
): Promise<string[]> => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("Gemini API key is not configured");

  const primaryModel = (
    config.ai_model_name || process.env.GEMINI_ACTIONS_MODEL || "gemini-2.5-flash"
  ).replace(/^models\//, "");
  const timeoutMs = parseIntSetting(config.ai_timeout, 15000, 1000, 120000);
  const temperature = parseFloatSetting(config.ai_temperature, 0.2, 0, 1);
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
              temperature,
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT",
                properties: {
                  actions: { type: "ARRAY", items: { type: "STRING" } },
                },
                required: ["actions"],
              },
            },
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          const message = `Gemini actions request failed with ${response.status} on ${model}${
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
        if (!raw) throw new Error("Gemini actions response was empty");
        const actions = parseActionsResponse(raw);
        if (!actions) throw new Error("Gemini returned invalid actions JSON");
        clearModelExhaustion(model);
        return actions;
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
  throw new Error("Gemini actions request failed");
};

const rememberActions = (key: string, actions: string[], ttlMs: number) => {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { actions, expiresAt: Date.now() + ttlMs });
};

export const getRecommendedActions = async (
  facts: ForecastActionFacts
): Promise<string[]> => {
  const fallback = ruleBasedActions(facts);

  if (!process.env.GEMINI_API_KEY?.trim()) return fallback;

  const key = actionsFingerprint(facts);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.actions;

  const pending = inflight.get(key);
  if (pending) return pending;

  const task = (async (): Promise<string[]> => {
    try {
      const config = await settings();
      const actions = await callGeminiActions(buildActionsPrompt(facts), config);
      rememberActions(key, actions, CACHE_TTL_MS);
      return actions;
    } catch {
      rememberActions(key, fallback, NEGATIVE_TTL_MS);
      return fallback;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
};

export const __testing = {
  ruleBasedActions,
  actionsFingerprint,
  buildActionsPrompt,
  parseActionsResponse,
};
