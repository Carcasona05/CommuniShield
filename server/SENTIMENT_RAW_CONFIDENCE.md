# Raw-confidence winner policy

## Deploy

1. Apply `DB_Schema/migrations/sentiment_raw_confidence_decision.sql` in Supabase
   SQL Editor **before restarting/deploying this backend**. The added nullable
   JSONB `sentiment_analysis.decision` column preserves old rows, RLS and grants.
2. Restart/redeploy the backend. No worker restart, retraining, model-file changes
   or supporting-model policy rewrites are required.
3. Existing stored results remain cached until explicitly reanalysed. Reanalysis
   may call Gemini and consume API quota; deployment does not run it automatically.

## Selection

Built-in, enabled/validated supports for the detected language, and Gemini (when
configured and enabled) contribute separate raw predictions. Supporting admission,
hash matching, private artifact checks, language scope, pool limits and disabled
model handling remain enforced. Legacy activated non-bundled models still cannot
be mixed with supports qualified against another built-in bundle.

- Below 0.45: not eligible.
- 0.45 inclusive to below 0.85: eligible, `moderate`.
- 0.85 inclusive through 1: eligible, `high`.
- Highest eligible raw confidence wins, regardless of conflicting labels.
- Exact top ties with conflicting labels: `unclear`, confidence 0, no winner.
- Exact ties with the same label: retain that label/score; deterministic model ID
  ordering identifies one winner without inventing extra confidence.
- No eligible predictions: `unclear`, confidence 0. An explicit provider abstention
  (`unclear`) cannot overrule a usable label. Existing `mixed` outputs remain valid.
- Invalid scores are not clamped into qualifying predictions. Failed/disabled
  providers add no candidate; an available source can win on its own.

This replaces the old local-priority Gemini fusion and serving-time support
cascade. There is no averaging, confidence discount, duplicate voting, short-text
override or strong-built-in bypass. Supports are now evaluated even if the
built-in is already confident, so inference may cost more CPU than the old cascade.
Training admission requirements are unchanged. Previously measured cascade quality
does not establish the accuracy of this new serving policy.

## Audit

New/reanalysed results store `decision` with the policy version, both thresholds,
reason, winning source/model ID and every available candidate's label, raw score,
band and eligibility. Local candidates also retain three-class scores. `model`
identifies the winning model and `provider` its origin (`ensemble` for supporting
models). Analysis/reanalysis responses include the decision trace. Historical
results have a null trace. Claim fencing/source-change checks apply to the trace
and final result together, and pending/discarded claims clear obsolete traces.

Example with measured fixture scores: built-in neutral .7542172074, two supports
neutral .7772260308, Gemini negative .95 => **negative .95**, winner Gemini.

Raw local probabilities and Gemini's self-reported confidence are not calibrated
against each other. This is the requested ranking rule, not a claim that the
highest number is necessarily correct. Validate accuracy on independent labeled
examples before treating these scores as certainty.

## Internal test page

Open `/SentimentTest` on the client web origin while signed in as Admin or Super
Admin. The route is intentionally absent from navigation. Its access probe and
`POST /api/sentiment/test` both enforce authentication and admin roles on the
server; hiding the URL is not the access control.

The lightweight page accepts up to 2,000 text characters and 600 optional context
characters. It runs the same serving pipeline only on explicit button clicks and
shows the final winner and available model scores. No reports, comments, datasets,
analysis records or support-usage counters are written. Downloaded model caches
may be populated on the backend. Gemini receives entered text/context and consumes
API quota. Provider failures are omitted from the candidate list; sensitive error
bodies are not returned. No entered text/results are stored by the page.

The endpoint permits five attempts per minute per account and one concurrent test
per account **per backend process**. On horizontally scaled deployments, enforce a
shared gateway/Redis rate limit too if a global quota cap is needed.

Restart the backend and Expo after adding the route. The page can run without
the decision-column migration because it never reads/writes analysis records,
but normal post/comment analysis still requires the deployment migration above.

## Offline tests

From `server`:

```powershell
node --import tsx --test src/SentimentConfidenceRouting.test.ts src/SentimentSupportingPrediction.test.ts src/LocalSentimentSummary.test.ts
```

From the repo root (PGlite installed or `PGLITE_MODULE` pointing to its module):

```powershell
node --test tests/database/sentimentRawConfidence.postgres.mjs
```

These tests mock external providers/registry/usage writes; they do not issue live
Gemini calls, modify Supabase, claim training jobs, or change bundled models.
