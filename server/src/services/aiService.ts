import { supabaseAdmin } from "../config/supabaseAdmin.js";

const DEFAULT_OLLAMA_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const DEFAULT_MODEL = "tinyllama:1.1b";
const DEFAULT_TEMPERATURE = 0.1;
const DEFAULT_TIMEOUT_MS = 120000;

interface AIAnalysisResult {
  ai_score: number;
  severity: "Low" | "Medium" | "High" | "Critical";
  sentiment: "Negative" | "Neutral" | "Positive" | "Concerned" | "Anxious" | "Unclear";
  credibility_review: string;
  analysis_duration_ms?: number;
}

interface AIConfig {
  ollama_url: string;
  model_name: string;
  temperature: number;
  timeout_ms: number;
}

async function loadAIConfig(): Promise<AIConfig> {
  const { data } = await supabaseAdmin
    .from("system_settings")
    .select("key, value")
    .in("key", [
      "ai_ollama_url",
      "ai_model_name",
      "ai_temperature",
      "ai_timeout",
    ]);

  const map = new Map<string, string>();
  (data || []).forEach((row) => map.set(row.key, row.value));

  return {
    ollama_url: map.get("ai_ollama_url") || DEFAULT_OLLAMA_URL,
    model_name: map.get("ai_model_name") || DEFAULT_MODEL,
    temperature: parseFloat(map.get("ai_temperature") || String(DEFAULT_TEMPERATURE)) || DEFAULT_TEMPERATURE,
    timeout_ms: parseInt(map.get("ai_timeout") || String(DEFAULT_TIMEOUT_MS), 10) || DEFAULT_TIMEOUT_MS,
  };
}

const SYSTEM_PROMPT = `You are an AI safety analyst for ARGUS, a community incident reporting system in Argao, Cebu. Analyze incident reports and return a JSON object with exactly these fields:

- ai_score: number 0-100
- severity: "Low" | "Medium" | "High" | "Critical"
- sentiment: "Negative" | "Neutral" | "Positive" | "Concerned" | "Anxious" | "Unclear"
- credibility_review: string

AI SCORE — calculate based on these three factors combined:

1) Detail level (0-40 points):
   - 0-10: Vague, one-liner, no specifics ("something bad happened")
   - 11-20: Some detail but missing key info (no time, no specifics)
   - 21-30: Good detail (mentions time, place, people involved, what happened)
   - 31-40: Highly detailed (exact time, full description, witness accounts, specific barangay/street)

2) Sentiment quality (0-30 points):
   - 0-10: Panic-driven, exaggerated, emotionally manipulative ("HELP!!! URGENT!!!", excessive caps, all exclamations)
   - 11-20: Concerned or anxious tone but still informative
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

Write the credibility_review as a direct, specific statement about THIS report. Do not use generic phrases. Base it on the actual data provided — mention the real image count, real similar post count, real location detail, and real sentiment. Never repeat the same template for every report.`;

/**
 * Calls TinyLlama via Ollama API to analyze a report with retry logic
 */
async function callTinyLlama(
  prompt: string,
  config: AIConfig,
  retries = 3
): Promise<string> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout_ms);

    try {
      const response = await fetch(`${config.ollama_url}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.model_name,
          prompt: `${SYSTEM_PROMPT}\n\nReport: ${prompt}\n\nReturn ONLY valid JSON, nothing else:`,
          stream: false,
          options: {
            temperature: config.temperature,
            top_p: 0.9,
            num_predict: 300,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const text = data.response?.trim() || "";
      if (text) {
        return text;
      }
      throw new Error("Empty response from Ollama API");
    } catch (err) {
      lastError = err;
      console.warn(
        `TinyLlama attempt ${attempt}/${retries} failed:`,
        err instanceof Error ? err.message : err
      );
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
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
    // Extract JSON from response (TinyLlama sometimes adds extra text)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : response;
    const parsed = JSON.parse(jsonStr);

    // Validate and clamp values
    const ai_score = Math.max(0, Math.min(100, Number(parsed.ai_score) || 50));
    const severity = ["Low", "Medium", "High", "Critical"].includes(parsed.severity)
      ? parsed.severity
      : "Medium";
    const sentiment = ["Negative", "Neutral", "Positive", "Concerned", "Anxious", "Unclear"].includes(
      parsed.sentiment
    )
      ? parsed.sentiment
      : "Neutral";
    const credibility_review = String(parsed.credibility_review || "AI analysis completed").slice(
      0,
      500
    );

    return { ai_score, severity, sentiment, credibility_review };
  } catch {
    // Fallback on parse failure
    return {
      ai_score: 50,
      severity: "Medium",
      sentiment: "Neutral",
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
 * Analyzes a report using TinyLlama and stores results
 */
export const aiService = {
  /**
   * Check if AI analysis is enabled in settings
   */
  async isEnabled(): Promise<boolean> {
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("ai_credibility_enabled")
      .maybeSingle();
    return data?.ai_credibility_enabled ?? true;
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
    return data?.value || "TinyLlama-1.1b";
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
        sentiment: "Neutral",
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
      const { count } = await supabaseAdmin
        .from("reports")
        .select("id", { count: "exact", head: true })
        .eq("incident_type_id", incidentTypeId)
        .neq("id", reportId);
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
      aiResponse = await callTinyLlama(prompt, config);
    } catch (error) {
      console.error("TinyLlama analysis failed:", error);
      return {
        ai_score: 50,
        severity: "Medium",
        sentiment: "Neutral",
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
        sentiment: result.sentiment,
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
            sentiment: "Unclear",
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
          sentiment: "Neutral",
          credibility_review: "Analysis failed",
        };
      }
    }

    return results;
  },

  /**
   * Test TinyLlama connectivity
   */
  async testConnection(): Promise<{ connected: boolean; model?: string; error?: string }> {
    const config = await loadAIConfig();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${config.ollama_url}/api/tags`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return { connected: false, error: `Ollama API returned ${response.status}` };
      }

      const data = await response.json();
      const modelNameBase = config.model_name.split(":")[0] ?? config.model_name;
      const hasModel = data.models?.some((m: { name: string }) => m.name.startsWith(modelNameBase));

      return {
        connected: true,
        model: hasModel ? config.model_name : `${config.model_name} (not pulled)`,
        ...(hasModel ? {} : { error: `Model not found. Run: ollama pull ${config.model_name}` }),
      };
    } catch (error) {
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