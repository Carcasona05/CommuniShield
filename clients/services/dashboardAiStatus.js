export function dashboardAiStatus(settings, loading = false) {
  const unavailable = loading ? "Loading…" : "Unavailable";
  const toggle = (label, key) => ({ label,
    value: settings?.[key] === "true" ? "Enabled" : settings?.[key] === "false" ? "Off" : unavailable,
    status: settings?.[key] === "true" ? "active" : "normal",
  });
  const modes = { local: "Local", gemini: "Gemini only", disabled: "Disabled" };
  return [
    toggle("AI Credibility Analysis", "ai_scoring_enabled"),
    toggle("Local Sentiment", "sentiment_local_model_enabled"),
    toggle("Gemini Sentiment", "sentiment_gemini_enabled"),
    { label: "Cebuano Handling", value: modes[settings?.sentiment_cebuano_mode] || unavailable, status: "normal" },
    // Product display version, deliberately independent of database metadata.
    { label: "Model Version", value: "CommuniShield-AI v1.0", status: "version" },
  ];
}
