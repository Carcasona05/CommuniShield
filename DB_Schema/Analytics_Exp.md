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

- Weight historical reports by severity (`Low`=1, `Medium`=2, `High`=3,
  `Critical`=4).
- Build an average per hour-of-day from the last 30 days.
- Project the next 48 hours: baseline = that hour's weighted average
  normalized against the peak hour, adjusted by a recent-vs-prior trend factor
  (last 7 days vs the 7 days before).

Deterministic, cheap, and explainable. You only move to ARIMA / Prophet or a
trained ML model if the simple version proves inaccurate.

## 3. Possible Crime Forecast

**Not a separate AI.** It is the *output* of the predictive model plus simple
rules:

| Field                  | Source                                                     |
| ---------------------- | ---------------------------------------------------------- |
| Predicted high-risk zone | Highest-density/severity cluster among recent reports    |
| Risk level              | Derived from max forecast probability (≥80 HIGH, ≥60 MEDIUM, else LOW) |
| Probability %           | Max forecast probability                                   |
| Predicted crime types   | Incident-type distribution inside the zone (top 3)         |
| Estimated time window   | Forecast hour with peak probability (± 2 hours)            |
| Trend indicator         | Forecast volume vs previous period                         |
| Recommended actions     | Rule-based (e.g., probability ≥ 80 → "increase patrol")    |

An LLM could rephrase the recommendations, but rule-based suggestions are
safer and deterministic for a safety system.

## Summary

- Sentiment Analysis → aggregate query (not AI).
- Predictive Trend Model → statistical forecast (light data-science, no LLM).
- Possible Crime Forecast → derived output + rules (not AI).

Implementation lives in `reportService.getAdminAnalytics()` (backend) and the
rewritten `Admin_Analytics.jsx` (frontend).
