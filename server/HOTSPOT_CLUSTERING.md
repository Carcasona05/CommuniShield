# Synthetic-data hotspot clustering

The current report corpus is entirely test data (confirmed by the project
owner). Results demonstrate software behaviour, NOT real-world hotspots,
predictive accuracy, patrol effectiveness, or deployment optimization. Police
records are not needed for this prototype and must not be obtained contrary to
the applicable rules.

## Implemented

- Admin/super-admin `GET /api/admin/clusters` runs DBSCAN on the server and
  returns source reports and memberships from the same dashboard snapshot.
- Hotspot Detection consumes that result instead of grouping address text.
- Default: trailing 30 days, haversine distance in metres, `eps = 300 m`,
  `minLocations = 4` INCLUDING the location itself. These are prototype
  parameters, not empirically validated settings.
- Optional `period`: `24h`, `7d`, `30d`, `all`; category and incidentType filters
  apply BEFORE clustering. Future/undated reports are always excluded.
- Archived, rejected, marked-fake and resolved reports are excluded. This is
  an **active-report concentration** view; historical evaluation would require
  a separate policy including resolved incidents that occurred in its window.
- Coordinates must be valid and inside the bundled Argao boundaries. Street
  labels never override coordinates. Unresolved boundary-edge barangay names
  remain unspecified rather than invented.

## Duplicate policy (important for the paper)

Numerically identical coordinate pairs become ONE spatial location with its
original report IDs/count retained. There is no arbitrary rounding that merges
nearby coordinates. DBSCAN uses distinct locations for density; report counts
are descriptive weights for totals/ranking only, NOT sample weights in the
core-point test. Passing counts as sklearn `sample_weight` would allow one
repeated pin to become a core point and would defeat this policy.

Thus 20 reports at one pin are one unclustered location unless enough other
distinct nearby pins support a cluster. It is not "20 incidents" or "20
independent locations". Duplicate coordinates do not prove duplicate events;
reports are retained, never deleted. Centers use distinct locations equally.
Border points can be assigned to density-connected clusters; DBSCAN's eps is a
neighbourhood distance, NOT a maximum cluster radius.

The page retains report-volume concentration levels for display, explicitly
not probabilities. Its heatmap still displays eligible report pins (including
unclustered locations); it is not a polygon of forecast danger. Cluster
memberships and the right-hand list come from DBSCAN, not from map heat colours.

## Limits / next stages

No database migration, model training, new dependency or live-data mutation is
required. Deploy the server and client together. Failures show an error, not
the old address-bucket output disguised as clustering.

This initial implementation uses the existing dashboard reader and a quadratic
neighbour search suitable for the small test corpus. Before larger datasets,
add explicit paginated reads and spatial indexing; do not claim a complete
citywide analysis from a truncated dashboard response. Results are computed
on demand, not persisted as research runs yet.

Risk Prediction and the user-map overlay have NOT yet been switched to this
engine. Polygon overlays and chronological forecasting/backtests are separate
next stages. A synthetic
backtest may validate the pipeline on designed scenarios, but cannot establish
real-world accuracy. Negative sentiment alone is not evidence of danger, and
model confidence is not the same as validated correctness.

For the paper, describe this as **a prototype evaluated using synthetic
incident scenarios due to restrictions on official police data**. Evaluate
known planted clusters/outliers, duplicate-pin robustness, parameter
sensitivity, multilingual model performance and usability. Do not present the
present corpus or the previous all-points DBSCAN preview as real incident
patterns or predictive validation.

Tests: `npm test` includes `../tests/server/HotspotClustering.test.ts` for duplicates,
coordinates/boundaries, date/status/filter exclusion, determinism, density
connectivity, metre distances and API access/validation.

## Offline synthetic evaluation (implemented)

See `datasets/synthetic-hotspots/README.md`. From `server/`, run
`npm run hotspots:generate` followed by `npm run hotspots:evaluate`.
This creates separate source/truth files, a 16-setting tuning table, a
held-out evaluation and a Markdown report. No database access or changes to
the deployed clustering settings occur. `../tests/server/SyntheticHotspots.test.ts` is
included in `npm test`.

## Sentiment context (implemented)

Each cluster returned by `/api/admin/clusters` now includes `evidence` from
`hotspotSentimentService.ts`. The service reads stored analyses; it does not
call AI models, retrain them, change DBSCAN membership or create a risk score.
Hotspot Detection renders this through `HotspotSentimentSummary.jsx`.

- Reports: one vote per distinct report ID, counts/shares for negative,
  neutral, positive, mixed and unclear, plus usable/total coverage and language
  counts. Failed/missing analyses are never silently counted as neutral.
- Usable means `succeeded`, no stored error, a recognized label/language
  (English/Filipino/Cebuano), and valid confidence >= 0.7. This provisional
  display threshold is not an evaluation of model accuracy or calibration.
- Comments: validate dates against the selected window, deduplicate comment
  IDs, aggregate label shares within each report, then average those shares
  equally across reports with usable comments. One hundred comments on one
  report cannot outweigh one comment on another. Report and comment sentiment
  remain separate; their model confidences are not averaged into a risk score.
- Verification buckets are disjoint and based on stored flags/status, not
  sentiment. Pending reports are explicitly identified as unverified evidence.
- Activity compares the last 7 days with the preceding 7 days among the
  **current active cluster members**. It is not a historical reconstruction of
  all incidents in the area. Negative-report-share change is shown only with
  at least 3 usable report analyses in EACH period and a selected window of at
  least 14 days (or `all`). Otherwise it says insufficient data. Any displayed
  change is percentage points of sentiment share, not forecast probability.
- The stored model/provider names used in the usable evidence are retained in
  the API for provenance. No personal risk or patrol-allocation score is made.

`../tests/server/HotspotSentiment.test.ts` and `../tests/browser/hotspotClustering.browser.mjs` cover
coverage, failure/unknown handling, weighting, comparisons and UI rendering.
This implements contextual integration; it does NOT validate the combined
feature's safety-domain accuracy. Human-reviewed multilingual safety examples
are still needed for that separate evaluation.

### Interactive test against the running system

With the local client on port 8081 and API on port 3000, the optional script
`server/scripts/hotspot/manualBrowser.mjs` opens Chrome and lets the operator
sign in normally (including device verification). Set `PLAYWRIGHT_MODULE` and
`CHROME_PATH` as for the existing optional browser tests, then run from server:

```powershell
node scripts/hotspot/manualBrowser.mjs
```

It uses actual GET responses (no route mocking or auth bypass), checks the
date filters, captures desktop/narrow/card screenshots and saves aggregate
evidence to `artifacts/hotspot-sentiment/`. It never logs access tokens or
credentials and leaves Chrome open for inspection. Login may create the
normal session/login-activity records; no report/sentiment writes occur.
That artifact directory is ignored by Git. If there are no eligible hotspots,
the test captures the honest empty state rather than inserting demo reports.
