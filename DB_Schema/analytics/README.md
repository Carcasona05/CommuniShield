# Supabase custom analytics: one query, one X/Y chart

Every `.sql` file is an independent **read-only query returning exactly two
columns: `x` and `y`**. There is one row per unique date or category, so the charts
do not require multiple Y columns, a series selector, or a color/group field.

## Dashboard setup

1. Open the desired SQL file and replace the old saved query with its full contents
   in Supabase SQL Editor/custom reports (where supported by your dashboard).
2. Select **X axis = `x`**, **Y axis = `y`** for every report.
3. Use a line/bar chart for dates, or a bar chart for categories. Categories remain
   distinguishable by their X labels even if all bars have the same color.
4. Saving a query does not run a background monitoring job. Refresh manually or use
   a modest supported dashboard interval, such as 5–15 minutes, not every few seconds.

**SQL cannot force different series colors.** Supabase controls rendering. The
queries deliberately do not depend on automatic color assignment or multi-series
support. Category comparisons show totals for the window, not daily trends.

## What each chart shows

| File | X values | Y meaning | Display |
| --- | --- | --- | --- |
| `01_accounts_created_daily.sql` | Date | Retained Auth accounts created that day | Line/bar |
| `02_posts_by_type.sql` | Reports, Announcements | Posts created in the window | Bar |
| `03_comments_created_daily.sql` | Date | Retained comments created that day | Line/bar |
| `04_datasets_by_status.sql` | Pending, Approved, Rejected, Archived | Datasets created in the window, by current review status | Bar |
| `05_training_jobs_by_status.sql` | Queued, Training, Evaluating, Ready, Failed | Jobs created in the window, by current status | Bar |
| `06_ai_credibility_results_daily.sql` | Latest analysis date | Retained latest credibility results | Line/bar |
| `07_sentiment_outcomes.sql` | Positive, Neutral, Negative, Mixed, Unclear, Pending, Failed, Unavailable, Skipped | Current outcome of sentiment records created in the window | Bar |
| `08_approved_dataset_balance.sql` | Language / Class | Current active approved uploaded examples | Bar |
| `09_training_queue_health.sql` | Fresh or Continued / Queue state | Currently unfinished jobs across all dates | Bar |
| `10_analysis_coverage.sql` | Reports or Comments / Analysis state | Recent content by current sentiment coverage | Bar |
| `11_supporting_model_usage.sql` | Candidate name [ID] / Status | Cumulative stored supporting-model usage | Bar |
| `12_database_activity.sql` | Connection state | Current other client connections | Bar |
| `13_sentiment_language_provider.sql` | `[subject, language, provider, model, status]` | Current retained sentiment records created in the window | Bar |

Files 02, 04, 05 and 07 have been renamed because they now compare categories, not
days. Remove/replace the old saved query rather than keeping duplicate charts.
File 12 now compares current connection states rather than mixing database counters
with different units. File 13 uses a JSON-array label to keep category combinations
unique even if a model name contains separators; it is one plain text X value.

## Windows, dates, and zero values

- Windowed queries use **30 Manila calendar days, including today**. Edit
  `30 as days` and `'Asia/Manila'` separately in each relevant query. This is not
  automatically linked to the dashboard's date picker.
- Date charts 01, 03, and 06 fill zero-count days. Today is partial.
- Timestamp X values represent Manila midnight (16:00 UTC on the preceding date).
  Set the chart display timezone to Asia/Manila if the dashboard allows it.
- Status, balance, queue, and coverage charts include zero-count categories.
  Models/provider combinations return no rows if there is no retained data, rather
  than inventing a model/category. Do not aggregate an empty chart into fake usage.
- WHERE clauses use half-open timestamp ranges without wrapping indexed timestamp
  columns in date functions. An index is still needed for large tables to avoid scans.

## Counting rules and limitations

- These are **retained-row counts**, not immutable historical event logs. Deleted
  accounts/content and overwritten analyses cannot be reconstructed. Registrations
  include all account roles from `auth.users`.
- Feed counts include `reports` and `admin_announcement`, matching the current feed
  service, not legacy `admin_posts`. Archived/rejected reports remain in the count.
- Dataset status and training status are **current status of creation cohorts**.
  They are not the number approved/completed on each day. Training includes fresh
  and continued jobs; `Ready` means evaluation passed, not enabled or activated.
- The training status window can exclude old unfinished jobs; queue health (09)
  intentionally checks all dates. Waiting, due, live, and stale categories are
  mutually exclusive. It observes leases without modifying them.
- Dataset balance (08) includes active samples from approved uploaded datasets;
  it excludes frozen local baseline CSVs and training-time admission/deduplication.
- Credibility analysis (06) stores one latest result per report and can include
  fallback results. Reanalysis replaces prior results and dates. This is **not a
  count of successful Gemini requests, API attempts, tokens, or billing usage**.
- Sentiment outcomes (07) use successful labels only for succeeded records; failed
  rows with a default label are counted as failed, not as successful predictions.
  Each retained record contributes once. Retries update its current outcome.
- Coverage (10) checks current sentiment results for reports/comments created in
  the window, regardless of the analysis creation date. Missing rows are a separate
  state. Each subject contributes once; report/comment IDs cannot cross-match.
- Model usage (11) is a stored cumulative supporting-model counter, not built-in
  inference usage or API requests. Duplicate candidate names include IDs to stay unique.
- Connections (12) is a current snapshot, not a stored time series, CPU percentage,
  error count, or proof of the source of a training error. It excludes its own query
  and non-client workers. Full visibility needs appropriate statistics permissions.
- Provider/model/status groups (13) are current retained records, not a request
  ledger or measurement of prediction accuracy.

## Safety and database load

These are **not migrations**. They create no tables, indexes, functions, schedules,
permissions, or background polling and never call worker RPCs. Do not add them to
the finalized schema installer. They do not enable/disable local training.

Run from a trusted dashboard/database administrator context. Account counts need
access to `auth.users`; do not grant new browser/public access. Other queries need
the corresponding application tables. Executing-role permissions/RLS still apply.
If the live schema differs, investigate missing columns/tables rather than reinstall
the full schema over your project.

SELECT queries still consume CPU. Use manual refresh or modest dashboard refresh
intervals. Some current-state reports inspect all retained rows. No query here
automatically stores historical snapshots. For actual CPU, use Supabase metrics;
for exact historical AI attempts/costs, add backend event instrumentation separately
with a retention/privacy plan, not a scheduled call to the training RPC.

## Offline verification

With `@electric-sql/pglite` available (or `PGLITE_MODULE` set to its module path):

```powershell
node --test tests/database/analyticsReports.postgres.mjs
```

Tests install the repository schema in isolated in-memory PostgreSQL and execute
all reports in read-only transactions. They check the exact two-column shape,
unique X values, empty data, Manila boundaries, non-duplicated counts, stale leases,
and subject coverage. No credentials or live Supabase connection are used.
