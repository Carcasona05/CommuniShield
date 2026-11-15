const SENTIMENT_THEMES = {
  positive: { label: "Positive", color: "#166344", background: "#EAF6EF" },
  negative: { label: "Negative", color: "#A32D32", background: "#FDEEEF" },
  neutral: { label: "Neutral", color: "#294880", background: "#EAF0FB" },
  mixed: { label: "Mixed", color: "#674194", background: "#F2ECFA" },
  unclear: { label: "Unclear", color: "#4B5563", background: "#EDF0F4" },
};
const NOT_ANALYZED = { label: "Not analyzed", color: "#4B5563", background: "#EDF0F4" };

export function reportCommentDisplay(comment = {}) {
  const name = typeof comment.user === "string" && comment.user.trim() ? comment.user.trim() : "User";
  const sentiment = typeof comment.sentiment === "string" ? comment.sentiment.trim().toLowerCase() : "";
  return {
    name,
    initial: Array.from(name)[0].toUpperCase(),
    body: typeof comment.text === "string" ? comment.text : "",
    sentiment: Object.hasOwn(SENTIMENT_THEMES, sentiment) ? SENTIMENT_THEMES[sentiment] : NOT_ANALYZED,
  };
}
