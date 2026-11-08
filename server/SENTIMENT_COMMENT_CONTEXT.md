# Comment-first Gemini sentiment policy

Gemini classifies the attitude expressed by the target author, not the severity
of an incident or the sentiment of a parent report. The parent post remains
available to resolve references, meaning and credible sarcasm. It must not make
a neutral acknowledgment negative merely by describing an unsafe situation.

- Fear, dissatisfaction, criticism and expressed distrust can be negative.
- Genuine gratitude, praise and relief can be positive under a negative post.
- Factual conditions and simple acknowledgment without a clear attitude are neutral.
- Ambiguous interjections and implicit complaints require interpretation; do not
  treat "Bruh" or every lighting observation as an unconditional negative/neutral.
- Sarcasm requires credible cues interpreted with context. A negative parent,
  laughter or quotation marks alone does not establish it.
- Skepticism is an attitude, not a verdict that a report is false. This policy
  does not assess credibility or incident severity.

Both target and parent are serialized as separate JSON input fields. The shared
prompt marks those fields as data rather than instructions. No hard-coded phrase
overrides, confidence changes, database migrations, client edits or model-file
changes were introduced. The raw-confidence winner policy is unchanged: Gemini
can still lose to a higher-scoring local model, or be unavailable.

The eleven supplied Cebuano comments are recorded as review fixtures in
`src/fixtures/sentimentCommentCases.ts`. Context-sensitive cases deliberately lack
unconditional expected labels. `src/SentimentCommentContext.test.ts` checks the
prompt contract, real HTTP request/parser flow with mocked Gemini responses,
production comment context forwarding, raw-score selection and saved-result reuse.
Mocked provider tests do NOT establish real Gemini accuracy or prove resistance
to every instruction-like input. No live Gemini calls were made by these tests.

Restart/deploy the backend to use the updated prompt. Existing stored results
are preserved and require explicit reanalysis to change. Standalone Sentiment Test
and contextual comments can still differ legitimately because their inputs differ.
Assess real provider behavior separately using the same target, parent, settings
and model version; do not assume that enabling Gemini guarantees a specific label.
