// Policy-review fixtures, not training data or measured Gemini ground truth.
// Context-sensitive cases deliberately have no unconditional expected label.
export const sentimentCommentCases = [
  { text: "taga gabie diri sa amoa dapit karsada kay grabe ka ngitngit. mahadlok mi mo labang labang diri.", kind: "explicit", expected: "negative", rationale: "Expressed fear, not darkness alone." },
  { text: "Dili man guru ni tinuod oy", kind: "context-sensitive", rationale: "Skeptical disagreement may express distrust; do not infer whether the report is true." },
  { text: "Bruh", kind: "context-sensitive", rationale: "Ambiguous interjection; do not force neutral or inherit negativity." },
  { text: "walay suga sa tulay ug lisod kaayo motabok", kind: "explicit", expected: "negative", rationale: "Expressed difficulty and unfavorable assessment." },
  { text: "bitaw mao na akong nabantayan ay", kind: "explicit", expected: "neutral", rationale: "Simple acknowledgment does not inherit the parent's emotion." },
  { text: "Batia sad ana oy", kind: "explicit", expected: "negative", rationale: "Unfavorable judgment; context resolves the referent." },
  { text: "Walay suga ang tulay", kind: "context-sensitive", rationale: "Neutral standalone fact; an implicit complaint requires additional evidence, not severity alone." },
  { text: "ngitngit kaayo among agianan, nahadlok ko basin naay manulis", kind: "explicit", expected: "negative", rationale: "Explicit fear of robbery." },
  { text: "bitaw didto ga blink blink ang suga usahay wala jud", kind: "context-sensitive", rationale: "Observation by itself; complaint intent needs contextual evidence." },
  { text: "Sure uy? Basin fake ni ha", kind: "context-sensitive", rationale: "Can express distrust, but is not evidence of actual falsity." },
  { text: "guba ang poste sa suga sa may eskinita ug ngitngit kaayo", kind: "context-sensitive", rationale: "Describes a condition; distinguish factual observation from an implicit complaint." },
] as const;
