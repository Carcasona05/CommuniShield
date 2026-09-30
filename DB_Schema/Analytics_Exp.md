# CommuniShield — Admin Analytics: Sentiment, Predictive Trend & Crime Forecast

> This document explains the three analytics widgets on the Admin Analytics
> screen (`Admin_Analytics.jsx`) and how much "AI" each one actually needs.

## 1. Sentiment Analysis (24hr trend)

**Not new AI work.** The system already stores a `sentiment` label per report in
`report_credibility_analysis` (`Negative`, `Neutral`, `Positive`, `Concerned`,
`Anxious`, `Unclear`). The AI already ran when that label was generated.

What the dashboard shows is just an **aggregate**: bucket reports by hour over
the last 24 hours and average each hour's sentiment polarity. A simple polarity
scale is used to turn labels into a 0–100 anxiety score:

| Label      | Polarity |
| ---------- | -------- |
| Anxious    | 1.00     |
| Concerned  | 0.80     |
| Negative   | 0.70     |
| Unclear    | 0.50     |
| Neutral    | 0.40     |
| Positive   | 0.20     |

No model is required — this is a query over data the AI layer already produced.

## 2. Predictive Trend Model (next 48 hours)

**This is the only genuinely "model-like" piece**, and it does **not** need a
large language model. For one municipality's scale, a **statistical
time-series forecast** is the right choice:

- Count incidents per hour-of-day from active reports (Rejected/Archived
  excluded) over the observed window (up to the last 30 days).
- Expected rate per slot: λ = count ÷ days observed, scaled by a
  recent-vs-prior trend factor (last 7 days vs the 7 days before), applied
  more strongly the further out the hour is.
- Project the next 48 hours as the probability of at least one incident:
  `P = (1 − e^−λ) × 100`, floored at 3%. Because λ is a real rate, quiet
  hours land around 5–15% and busy hours 60–90% — so the HIGH (≥80) /
  MEDIUM (≥60) / LOW thresholds are actually reachable.

Deterministic, cheap, and explainable. You only move to ARIMA / Prophet or a
trained ML model if the simple version proves inaccurate.

## 3. Possible Crime Forecast

**The numbers come from the predictive model; the recommended actions are
written by Gemini, grounded in those numbers:**

| Field                  | Source                                                     |
| ---------------------- | ---------------------------------------------------------- |
| Predicted high-risk zones | Up to 3 ranked locations by High/Critical report count (case/spacing-insensitively compared; "Insufficient data" when none) |
| Evidence line          | `Based on N active reports (M high-severity)` — the actual counts fed to the model; replaces any probability % |
| Predicted crime types   | Incident-type distribution across active High/Critical reports (top 5) |
| Estimated time window   | Forecast hour with peak probability (± 2 hours)            |
| Report trend           | Real weekly counts, rendered client-side as `Rising / Falling / Stable — N reports this week vs M last week` (±10% band = stable; red / green / grey) |
| Recommended actions     | **AI-written** from the computed facts (zones, window, trend, types) via Gemini, cached per prediction fingerprint; deterministic rule-based fallback when AI is unavailable or fails |

**Not displayed (internal only):** risk level (≥80 HIGH / ≥60 MEDIUM) and the
probability % still exist server-side — they feed the AI prompt and the
rule-based fallback — but they are hidden from the card: a raw "100%" claim
was unverifiable and changed no decision. The 48-hour chart is labeled
`Relative likelihood` on a 0–100 index (no `%` axis labels) for the same
reason.

Guardrails: the LLM never computes any of the numbers — it only words the
actions, and the prompt forbids inventing locations, times, percentages, or
crime types. If parsing fails or Gemini errors, the rule-based actions are
shown instead, so the card is never empty.

## Summary

- Sentiment Analysis → aggregate query over labels the AI layer already produced.
- Predictive Trend Model → statistical forecast (light data-science, no LLM).
- Possible Crime Forecast → derived output + AI-written recommended actions
  grounded in those numbers (rule-based fallback; the forecast math itself is
  still not AI).

Implementation lives in `reportService.getAdminAnalytics()` (backend) and the
rewritten `Admin_Analytics.jsx` (frontend).
