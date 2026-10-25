export function sentimentOrigin(model) {
  if (typeof model !== "string") return "";
  if (model.startsWith("cascade:supporting|")) {
    const id = model.split("|support:")[1]?.split(",")[0];
    return id ? `Supporting ${id.slice(0, 8)}` : "Supporting model";
  }
  if (model.startsWith("cascade:unclear|")) return "Cascade unresolved";
  if (model.endsWith("@bundled")) return "Built-in";
  if (model.startsWith("assist:")) return "Gemini assist";
  if (model.startsWith("word-character-") && model.includes("@")) return "Legacy model version";
  return "";
}
