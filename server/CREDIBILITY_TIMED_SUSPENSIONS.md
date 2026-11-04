# Timed credibility suspensions (current policy)

## Deployment

On the existing application schema, apply:

1. `DB_Schema/migrations/user_profile_completion.sql` (if not already applied).
2. `DB_Schema/migrations/credibility_timed_suspensions.sql` (current policy).

The timed migration is self-contained: it creates its usage/scoring ledgers,
permission checks, scoring triggers and suspension functions without an obsolete
intermediate feature migration. It works for both a fresh installation of this
policy and a database that already uses it, preserving existing scores, usage,
rewards and active deadlines when rerun. Back up and stage-test first.
Pause old API instances while migrating and deploy the updated API/client
together; old instances must not keep awarding old rewards. No live migration is
performed automatically by the coding agent.

Existing scores are preserved. Reports already rewarded under the +5 policy do
not receive another reward or a retroactive +10 top-up. Already-suspended accounts
begin their first one-day suspension when this migration is applied.

## Rewards and penalties

- Initial score: 60; minimum 0, maximum 100.
- Admin/Super Admin verification: **+15, once per report**, capped at 100.
- Rejected report: **−10**; fake report: **−30** (unchanged existing penalties).
- Submissions, images, comments, likes and profile completion: no account points.
- Repeated reviews do not duplicate rewards or active deductions. Existing normal
  report-outcome supersession remains; there is no standalone manual correction
  endpoint, score-editing UI or early-release operation.

## Suspension timing

Falling below 20 starts a suspension immediately in the scoring transaction.
Durations are **1, 3, 7, 14, then 30 days** (30 days for subsequent occurrences).
A duration is an elapsed 24-hour day, not a calendar-day boundary. One open record
per user prevents duplicate suspensions. Refresh, login, repeated decisions or
additional score deductions cannot extend an active suspension.

Posting, commenting and report edits remain blocked for the complete duration,
even if previously submitted reports earn verification rewards while suspended.
Browsing, likes and safety information remain available. Admin/Super Admin are
exempt. Separate account disablement remains a separate security control.

At expiry, restore the score to **at least 20**, never lower a recovered score.
Escalation resets after **90 days since the last suspension's end** without a new
suspension. Completed suspension records remain private for audit purposes.

Recovery is evaluated using database time on access/profile checks and before
content writes/review scoring. There is no mandatory background scheduler: an
offline user's expiry is materialized on their next request, and their first
eligible request can succeed. The UI refreshes an active timer at most once per
minute and at expiry. A device clock cannot grant permission. Daily usage is not
refunded at expiry; existing limits still reset at midnight Asia/Manila.

Suspension start/expiry notifications link to Profile Details. The public
`GET /api/credibility/access` response includes the current score/allowances and
`suspension: { occurrence, durationDays, startedAt, endsAt, reason }` when active.
All permission checks remain backend-enforced and atomic with database writes.
The API also requires the `timed-v1` policy marker; an old base-only database
returns 503 instead of silently awarding +5 or keeping indefinite suspensions.

## AI credibility review text

New reviews no longer append `Image authenticity flags`, EXIF/GPS/timestamp codes
or a claim that images have no authenticity issues. Legacy stored review text is
cleaned on API reads, so reports need not be reanalyzed just to hide those flags.
The prompt and response sanitizer also prevent raw flags from model output.

This is a review-text change, not a rewrite of the separate internal AI scoring
model: existing metadata-based AI-report-score calculations are unchanged. They
do not mutate the user's account credibility score.

## Verification

- Backend: `node --import tsx --test src/CredibilityRestrictions.test.ts src/ProfileCompletion.test.ts src/ReportSubmission.test.ts`
- Client: `node --test tests/clients/credibilityAccess.test.mjs tests/clients/profileMobileDesign.test.mjs tests/clients/profileCompletionGate.test.mjs`
- Isolated PostgreSQL: `tests/database/credibilityTimedSuspensions.postgres.mjs`
  (PGlite; configure `PGLITE_MODULE` if needed).

The database test installs the timed migration directly and checks fresh setup,
repeat installation, limits, reward idempotency and escalation/recovery behavior.
