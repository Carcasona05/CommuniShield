# Current indicators and 7-day report-volume outlook

`GET /api/admin/risk-outlook?barangay=Lamacan` is authenticated and restricted
to admin/super-admin. Omit `barangay` for the aggregate. No migrations, external
AI calls, new dependencies or production-data writes are required.

## Two intentionally different views

**Current indicators** use eligible active reports from the last 30 days:
pending review / under verification, valid coordinates and a coordinate-resolved
Argao barangay. They include observed severity, verification and multilingual
sentiment context and intersecting DBSCAN clusters. The spatial engine and
parameters are shared with Hotspot Detection; negative sentiment does not
alter density or forecast values. Missing credibility analysis is shown as
unrated rather than inheriting the dashboard's default Medium severity.
Barangay report counts are explicitly
descriptive concentrations, NOT predicted risk zones. The map contains existing
reports, NOT predicted future events.

The current indicator reader is the existing dashboard snapshot; a warning is
returned/displayed at >=1000 rows because that snapshot may be limited.

**The outlook** estimates future **submitted-report counts**, not actual crime,
verified incidents, danger, a likelihood percentage, or optimal patrol levels.
It uses a separate paginated, exact-count-verified minimal history read (up to 365 days), including
resolved and unverified reports. Archived/rejected/marked-fake reports are
excluded, as are invalid/unresolved locations, duplicate IDs, future timestamps
and the current incomplete UTC day. Coordinate-derived barangays take
precedence over street labels. The 50,000-row safety limit fails closed rather
than returning a successful truncated forecast. History-query errors leave
current indicators available but the forecast explicitly unavailable.

## Provisional sufficiency gate

An estimate requires all of:

- At least **112 complete days** from the first eligible report to yesterday;
- At least **20 distinct report IDs** across **10 reporting days**;
- Some report activity in the last **28 complete days**.

These are declared prototype policies, not empirically validated safety
thresholds. A day with no stored row counts as **zero submitted reports**, not
proof of no incidents. The first report is not a verified monitoring start
date. Long silence can mean missing collection, so it does not earn a zero-risk
forecast. Sparse/short/stale datasets say **Insufficient data**.

## Methods and chronology

- Baseline: mean daily count over the last 56 complete days, multiplied across
  seven target days.
- Candidate: eight-week weekday profile; the most recent four weeks have
  weight 2 and the preceding four weeks weight 1. This is a simple fitted
  statistical method, not a trained neural model or Gemini-generated number.
- Six earlier non-overlapping target weeks compare weekly absolute errors.
  Each fit sees only the earlier prefix and leaves one unseen gap day.
- Choose the candidate only if its earlier weekly MAE is strictly lower;
  ties keep the simpler baseline.
- Fit on the current past history, omit today's partial data, and predict the
  next seven **full UTC days starting tomorrow**. Calibration uses that same
  one-day-gap convention. The UI displays exact UTC target dates.
- Daily/weekly estimates are rounded for display; rounded daily numbers need
  not sum exactly to the separately rounded total.

This does not causally forecast specific incidents or account for weather,
population, reporting bias, missing data or changes in reporting participation.
Resolution is based on current status: historic status-at-the-time snapshots
are not available in the current report schema.

## Uncertainty, honestly labeled

The **historical-error range** is the point estimate plus/minus the largest
absolute weekly error from the six earlier backtests, rounded outward and
clipped at zero, with a minimum half-width of one report. It is descriptive,
**not a calibrated confidence/prediction interval** or a claimed 80/95% level.
The same earlier folds help select the method, so their errors can be optimistic.
Sudden changes may fall outside the range. The page shows baseline and selected
MAE instead of a fabricated probability score.

## Independent chronological synthetic evaluation

See `datasets/synthetic-risk-outlook/README.md`. Run from `server/`:

```powershell
npm run risk:evaluate
```

It creates seeded daily submission series with steady activity, weekday
patterns, gradual growth, a late shock, sparse data, short history and a long
reporting gap. Four later non-overlapping weeks per eligible scenario are held
out. Each evaluation fold selects/calibrates using only its earlier training
prefix. Later counts are used solely for scoring. Raw series and failures are
retained, and the script never reads/writes the application database.

Default-seed result: 16 scored synthetic weeks; selected-pipeline MAE **17.531**
submissions/week versus baseline **18.281** (candidate alone **17.456**).
All methods are scored at the same one-decimal displayed precision. The
final report is in `generated/seed-20261022-display-precision/`; the first
draft is preserved separately rather than overwritten.
Observed descriptive-range coverage is **0.688** of scored synthetic weeks.
Large errors after the planted late shock are preserved. This is modest
synthetic improvement, not 96/99% accuracy or evidence of real-world usefulness.
No method/threshold was changed after inspecting those held-out outcomes.

## Tests

`src/RiskOutlook.test.ts` covers history policy, UTC timing, non-overlapping
past-only backtests, baseline/error-band output, sentiment independence,
authorization, current-versus-resolved history, pagination and failure states.
The updated `tests/riskPrediction.browser.mjs` checks the honest UI labels,
insufficient/available/error states, seven daily estimates, filtering, zone
pagination, severity labels and smooth/cancellable scroll-to-top.
