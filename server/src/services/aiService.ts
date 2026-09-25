import { supabaseAdmin } from "../config/supabaseAdmin.js";

const DEFAULT_GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const DEFAULT_MODEL = "gemini-3.6-flash";
const DEFAULT_TEMPERATURE = 0.1;
const DEFAULT_TIMEOUT_MS = 30000;
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

interface AIAnalysisResult {
  ai_score: number;
  severity: "Low" | "Medium" | "High" | "Critical";
  credibility_review: string;
  analysis_duration_ms?: number;
}

interface AIConfig {
  api_key: string;
  model_name: string;
  temperature: number;
  timeout_ms: number;
  api_endpoint?: string;
}

const GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.1-pro",
  "gemini-3.0-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash",
];

function isValidGeminiModel(name: string): boolean {
  return GEMINI_MODELS.some((m) => name === m || name.startsWith(m + "-"));
}

let cachedAvailableModel: string | null = null;

async function discoverModel(apiKey: string, baseEndpoint: string): Promise<string> {
  if (cachedAvailableModel) return cachedAvailableModel;

  const listUrl = `${baseEndpoint}?key=${apiKey}`;
  console.log(`[AI Discovery] Querying available models: ${listUrl.replace(/key=.*/, "key=***")}`);

  try {
    const res = await fetch(listUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[AI Discovery] List models failed ${res.status}:`, body);
      return DEFAULT_MODEL;
    }

    const data = await res.json();
    const models: Array<{ name: string; supportedGenerationMethods?: string[] }> = data.models || [];

    console.log(`[AI Discovery] Found ${models.length} models:`);
    models.forEach((m) => {
      const methods = m.supportedGenerationMethods?.join(", ") || "unknown";
      console.log(`  - ${m.name} [${methods}]`);
    });

    const generateCapable = models.filter((m) =>
      m.supportedGenerationMethods?.includes("generateContent")
    );

    for (const preferred of GEMINI_MODELS) {
      const found = generateCapable.find((m) => m.name.includes(preferred));
      if (found) {
        cachedAvailableModel = found.name;
        console.log(`[AI Discovery] Selected model: ${found.name}`);
        return found.name;
      }
    }

    const firstGenerateCapable = generateCapable[0];
    if (firstGenerateCapable) {
      cachedAvailableModel = firstGenerateCapable.name;
      console.log(`[AI Discovery] Using first available model: ${firstGenerateCapable.name}`);
      return firstGenerateCapable.name;
    }

    console.warn("[AI Discovery] No models support generateContent, using default");
    return DEFAULT_MODEL;
  } catch (err) {
    console.error("[AI Discovery] Failed to query models:", err instanceof Error ? err.message : err);
    return DEFAULT_MODEL;
  }
}

async function loadAIConfig(): Promise<AIConfig> {
  const { data } = await supabaseAdmin
    .from("system_settings")
    .select("key, value")
    .in("key", [
      "ai_model_name",
      "ai_temperature",
      "ai_timeout",
      "ai_api_endpoint"
    ]);

  const map = new Map<string, string>();
  (data || []).forEach((row) => map.set(row.key, row.value));

  const apiKey = DEFAULT_GEMINI_API_KEY;
  const apiEndpoint = map.get("ai_api_endpoint") || GEMINI_BASE_URL;

  let dbModel = map.get("ai_model_name") || "";
  if (!isValidGeminiModel(dbModel)) {
    console.warn(`[AI Config] Invalid model "${dbModel}" in DB, discovering available model...`);
    dbModel = "";
  }

  let model_name: string;
  if (dbModel) {
    model_name = dbModel;
  } else if (apiKey) {
    model_name = await discoverModel(apiKey, apiEndpoint);
  } else {
    model_name = DEFAULT_MODEL;
  }

  const config: AIConfig = {
    api_key: apiKey,
    model_name,
    temperature: parseFloat(map.get("ai_temperature") || String(DEFAULT_TEMPERATURE)) || DEFAULT_TEMPERATURE,
    timeout_ms: parseInt(map.get("ai_timeout") || String(DEFAULT_TIMEOUT_MS), 10) || DEFAULT_TIMEOUT_MS,
    api_endpoint: apiEndpoint,
  };

  console.log("[AI Config] Loaded:", {
    model: config.model_name,
    endpoint: config.api_endpoint,
    has_key: !!config.api_key,
    key_prefix: config.api_key ? config.api_key.substring(0, 6) + "..." : "NONE",
    temperature: config.temperature,
    timeout: config.timeout_ms,
  });

  return config;
}

const SYSTEM_PROMPT = `You are an AI safety analyst for CommuniShield, a community incident reporting system in Argao, Cebu. Analyze incident reports and return a JSON object with exactly these fields:

- ai_score: number 0-100
- severity: "Low" | "Medium" | "High" | "Critical"
- credibility_review: string

AI SCORE — calculate based on these three factors combined:

1) Detail level (0-40 points):
   - 0-10: Vague, one-liner, no specifics ("something bad happened")
   - 11-20: Some detail but missing key info (no time, no specifics)
   - 21-30: Good detail (mentions time, place, people involved, what happened)
   - 31-40: Highly detailed (exact time, full description, witness accounts, specific barangay/street)

2) Language quality (0-30 points):
   - 0-10: Vague, manipulative, or emotionally distorted wording
   - 11-20: Some concerns or uncertainty but mostly informative
   - 21-30: Calm, factual, objective language

3) Corroboration (0-30 points):
   - 0-10: No similar reports, isolated claim
   - 11-20: 1-2 similar reports exist for same incident type
   - 21-30: 3+ similar reports, or report has images submitted

SEVERITY — analyze based on threat level and language construction:

- Critical: Direct threat to life, active danger, weapons, violence in progress, mass harm. Look for phrases like "someone has a gun", "stabbing in progress", "building on fire with people inside", "holding hostages". The sentence structure shows urgency and immediacy — present tense, active voice, specific victims.
- High: Serious incident occurred, potential for escalation, injury reported, significant property damage. Sentences describe recent past events with concrete harm done.
- Medium: Incident happened but contained, no immediate danger, minor injury or property damage. Language is informational, reporting what happened.
- Low: Minor issue, nuisance, suspicious activity with no direct threat. Phrases like "saw something strange", "noise complaint", "suspicious person loitering".

Write the credibility_review as a direct, specific statement about THIS report. Do not use generic phrases. Base it on the actual data provided, including image count, similar post count, and location detail. Do not classify sentiment.`;

async function callGemini(
  prompt: string,
  config: AIConfig,
  retries = 3
): Promise<string> {
  if (!config.api_key) {
    throw new Error("GEMINI_API_KEY is not set. Add it to your environment variables.");
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout_ms);

    try {
      const baseEndpoint = (config.api_endpoint && config.api_endpoint.trim() !== "") 
        ? config.api_endpoint 
        : GEMINI_BASE_URL;
      const url = `${baseEndpoint}/${config.model_name}:generateContent?key=${config.api_key}`;
      const maskedUrl = url.replace(/key=.*/, "key=***");

      console.log(`[Gemini] Attempt ${attempt}/${retries} — POST ${maskedUrl}`);
      console.log(`[Gemini] Prompt length: ${prompt.length} chars`);

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `${SYSTEM_PROMPT}\n\nReport:\n${prompt}\n\nReturn ONLY valid JSON, nothing else:`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: config.temperature,
            topP: 0.9,
            maxOutputTokens: 300,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Gemini] ERROR ${response.status} — ${errorText}`);
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }

      console.log(`[Gemini] SUCCESS — ${response.status}`);
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      if (text) {
        return text;
      }
      throw new Error("Empty response from Gemini API");
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : "";
      const isClientError = /Gemini API error: [4]\d{2}/.test(msg);
      console.warn(
        `Gemini attempt ${attempt}/${retries} failed:`,
        msg || err
      );
      if (attempt < retries && !isClientError) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (isClientError) break;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error("Failed to generate response after retries");
}

/**
 * Parses AI response and validates structure
 */
function parseAIResponse(response: string): AIAnalysisResult {
  try {
    // Extract JSON from response (Gemini sometimes wraps in markdown code fences)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : response;
    const parsed = JSON.parse(jsonStr);

    // Validate and clamp values
    const ai_score = Math.max(0, Math.min(100, Number(parsed.ai_score) || 50));
    const severity = ["Low", "Medium", "High", "Critical"].includes(parsed.severity)
      ? parsed.severity
      : "Medium";
    const credibility_review = String(parsed.credibility_review || "AI analysis completed").slice(
      0,
      500
    );

    return { ai_score, severity, credibility_review };
  } catch {
    // Fallback on parse failure
    return {
        ai_score: 50,
        severity: "Medium",
        credibility_review: "Unable to generate AI review. Manual verification recommended.",
    };
  }
}

/**
 * Builds the analysis prompt from report data
 */
function buildPrompt(report: {
  incident_category: string;
  incident_type: string;
  location: string;
  details: string;
  latitude?: number | null;
  longitude?: number | null;
  image_count?: number;
  similar_post_count?: number;
}): string {
  return `Category: ${report.incident_category}
Type: ${report.incident_type}
Location: ${report.location || `Lat: ${report.latitude}, Lng: ${report.longitude}`}
Details: ${report.details || "No details provided"}
Images submitted: ${report.image_count ?? 0}
Similar reports in area: ${report.similar_post_count ?? 0}`;
}

/**
 * Analyzes a report using Gemini and stores results
 */
export const aiService = {
  /**
   * Check if AI analysis is enabled in settings
   */
  async isEnabled(): Promise<boolean> {
    const { data } = await supabaseAdmin
      .from("system_settings")
      .select("value")
      .eq("key", "ai_scoring_enabled")
      .maybeSingle();
    return data?.value === undefined ? true : data.value === "true";
  },

  /**
   * Get AI model version from settings
   */
  async getModelVersion(): Promise<string> {
    const { data } = await supabaseAdmin
      .from("system_settings")
      .select("value")
      .eq("key", "ai_model_version")
      .maybeSingle();
    return data?.value || "gemini-3.6-flash";
  },

  /**
   * Analyze a single report
   */
  async analyzeReport(reportId: string, reportData: {
    incident_category: string;
    incident_type: string;
    location: string;
    details: string;
    latitude?: number | null;
    longitude?: number | null;
  }): Promise<AIAnalysisResult> {
    const enabled = await this.isEnabled();
    if (!enabled) {
      return {
        ai_score: 50,
        severity: "Medium",
        credibility_review: "AI analysis disabled",
      };
    }

    const [imageCountResult, reportTypeResult] = await Promise.all([
      supabaseAdmin
        .from("report_images")
        .select("id", { count: "exact", head: true })
        .eq("report_id", reportId),
      supabaseAdmin
        .from("reports")
        .select("incident_type_id")
        .eq("id", reportId)
        .maybeSingle(),
    ]);

    const imageCount = imageCountResult.count ?? 0;
    const incidentTypeId = reportTypeResult.data?.incident_type_id;

    let similarCount = 0;
    if (incidentTypeId) {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabaseAdmin
        .from("reports")
        .select("id", { count: "exact", head: true })
        .eq("incident_type_id", incidentTypeId)
        .neq("id", reportId)
        .gte("created_at", twentyFourHoursAgo);
      similarCount = count ?? 0;
    }

    const config = await loadAIConfig();
    const prompt = buildPrompt({
      ...reportData,
      image_count: imageCount,
      similar_post_count: similarCount,
    });
    let aiResponse: string;
    const startTime = Date.now();

    try {
      aiResponse = await callGemini(prompt, config);
    } catch (error) {
      console.error("Gemini analysis failed:", error);
      return {
        ai_score: 50,
        severity: "Medium",
        credibility_review: `AI analysis unavailable: ${error instanceof Error ? error.message : "Unknown error"}`,
        analysis_duration_ms: Date.now() - startTime,
      };
    }

    const result = parseAIResponse(aiResponse);
    const modelVersion = await this.getModelVersion();
    const durationMs = Date.now() - startTime;

    // Store analysis in database
    const { error } = await supabaseAdmin
      .from("report_credibility_analysis")
      .upsert({
        report_id: reportId,
        ai_score: result.ai_score,
        severity: result.severity,
        credibility_review: result.credibility_review,
        ai_model_version: modelVersion,
        analysis_duration_ms: durationMs,
        analyzed_at: new Date().toISOString(),
      }, { onConflict: "report_id" });

    if (error) {
      console.error("Failed to store AI analysis:", error);
    }

    return { ...result, analysis_duration_ms: durationMs };
  },

  /**
   * Batch analyze multiple reports (for backfill)
   */
  async analyzeReports(reportIds: string[]): Promise<Record<string, AIAnalysisResult>> {
    const results: Record<string, AIAnalysisResult> = {};
    
    for (const id of reportIds) {
      try {
        // Fetch report data
        const { data: report } = await supabaseAdmin
          .from("reports")
          .select(`
            id,
            location,
            latitude,
            longitude,
            details,
            incident_type_id,
            incident_types!inner (
              name,
              incident_categories!inner (name)
            )
          `)
          .eq("id", id)
          .maybeSingle();

        if (!report) {
          results[id] = {
            ai_score: 0,
            severity: "Low",
            credibility_review: "Report not found",
          };
          continue;
        }

        const typeData = report.incident_types as unknown as {
          name: string;
          incident_categories: { name: string };
        };

        const analysis = await this.analyzeReport(id, {
          incident_category: typeData.incident_categories.name,
          incident_type: typeData.name,
          location: report.location || "",
          details: report.details || "",
          latitude: report.latitude,
          longitude: report.longitude,
        });

        results[id] = analysis;
      } catch (error) {
        console.error(`Failed to analyze report ${id}:`, error);
        results[id] = {
          ai_score: 50,
          severity: "Medium",
          credibility_review: "Analysis failed",
        };
      }
    }

    return results;
  },

  /**
   * Test Gemini API connectivity
   */
  async testConnection(): Promise<{ connected: boolean; model?: string; error?: string }> {
    const config = await loadAIConfig();

    if (!config.api_key) {
      return { connected: false, error: "GEMINI_API_KEY is not set in environment variables." };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      // Use the models list endpoint as a lightweight connectivity check
      const baseEndpoint = (config.api_endpoint && config.api_endpoint.trim() !== "") 
        ? config.api_endpoint 
        : GEMINI_BASE_URL;
      const url = `${baseEndpoint}?key=${config.api_key}`;
      const maskedUrl = url.replace(/key=.*/, "key=***");

      console.log(`[Gemini Test] GET ${maskedUrl}`);

      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Gemini Test] ERROR ${response.status} — ${errorText}`);
        return { connected: false, error: `Gemini API returned ${response.status}: ${errorText}` };
      }

      const data = await response.json();
      const models: Array<{ name: string }> = data.models || [];
      const hasModel = models.some((m) => m.name.includes(config.model_name));

      console.log(`[Gemini Test] SUCCESS — ${models.length} models available, ${config.model_name} found: ${hasModel}`);

      return {
        connected: true,
        model: hasModel ? config.model_name : `${config.model_name} (available via API)`,
      };
    } catch (error) {
      console.error(`[Gemini Test] CONNECTION FAILED —`, error instanceof Error ? error.message : error);
      return {
        connected: false,
        error: error instanceof Error ? error.message : "Connection failed",
      };
    }
  },

  /**
   * Get current AI configuration from system_settings
   */
  async getConfig(): Promise<AIConfig> {
    return loadAIConfig();
  },
};