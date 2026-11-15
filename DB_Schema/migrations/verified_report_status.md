# Verified report status

Apply `verified_report_status.sql` in Supabase SQL Editor **after**
`admin_analysis_jobs.sql` and `credibility_timed_suspensions.sql`. The existing
feed migration's tables must also be present. Restart/deploy the backend and
reload/deploy the client afterward. The assistant has not applied this live.

The review actions now distinguish:

- Pending Review / Under Verification: not yet confirmed.
- Verified: confirmed, still active/unresolved (`is_verified = true`).
- Resolved: addressed/closed (`is_verified = true`).
- Rejected / Marked Fake / Archived: not verified.

Verified uses the ordinary status display and its own button/filter, not an
additional verification badge. Both Admin and Super Admin share these controls.
Dashboard's Verified count/filter now counts the Verified status; existing
Resolved reports remain Resolved and remain eligible for the verified map.
Verified stays eligible for hotspots, current risk context, safety metadata and
forecast history. It is not a declaration of forecast accuracy or danger.

No historical report statuses, credibility scores, saved analyses or model files
are rewritten. The old verification reward ledger is preserved, so Verify then
Resolve does not award verification points twice. Reports without an owner skip
user scoring (fixing ownerless seed-report review errors); they can still be
reviewed, audited and analyzed. Notifications describe Verified and Resolved
separately. Ordinary users cannot assign review statuses to their own reports.

Database regression tests: `tests/database/verifiedReportStatus.postgres.mjs`
(PGlite; use `PGLITE_MODULE` if installed in an isolated tool directory).
`finalized/` is a versioned schema snapshot, not modified by this migration;
apply this migration after that snapshot when provisioning from it.
