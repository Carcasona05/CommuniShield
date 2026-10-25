# Archived reports

Archiving is how an admin retires a report. It sets `reports.status = 'Archived'`
and the report disappears from every feed, dashboard, map, hotspot, analytics,
risk, safety-tip, and user-facing list. It reappears only under **Admin Logs →
Archived reports**.

## Deployment prerequisite

Run `DB_Schema/migrations/report_archiving.sql` in the Supabase SQL editor. It is
additive and repeatable: it allows the `Report Archived` audit action and adds a
partial index for the archive list. `'Archived'` was already a legal
`reports.status` value, so nothing else is required and no existing report moves.

Without the migration, archiving still works and the report still leaves every
feed; only its entry in the activity log is skipped.

## Workflow

1. **Incident Management** (`/Admin_Validation`) → *View Posts* on a group →
   per-report menu → **Move to Archived Reports**. Super admin uses the same menu
   on `/SAdmin_Validation`.
2. The report status becomes `Archived`, its verified flag is cleared, and the
   owner is notified that the report was archived.
3. **Admin Logs** (`/Admin_Logs`) has two tabs: *Activity logs* and *Archived
   reports*. The archive tab lists the archived reports (type, location,
   reporter, date, severity, report ID) with a **Restore** action that returns a
   report to `Pending Review`.

## Server rules

- `listReports` (feeds `/reports`, `/reports/mine`, `/reports/:id`) excludes
  archived rows, so archived reports never reach a user session.
- `getAdminDashboard` excludes archived rows unless it is asked for explicitly
  with `?status=Archived` — that is the Logs archive view.
- `getAdminAnalytics` excludes archived rows.
- `POST /reports/:id/status` validates the status, forces `is_verified = false`
  when archiving, writes a `Report Archived` audit action, notifies the owner,
  and deliberately does not broadcast to other admins.
- Screens also filter archived rows client-side, so a stale cache or an
  out-of-date server cannot leak one back into a list.

## Tests

- `tests/server/Backend.test.ts` — archive audit action, `is_verified` forcing, no
  admin broadcast, and the query-level exclusion for feeds and dashboards.
- `tests/database/reportArchiving.postgres.mjs` — the migration (run twice, to
  prove it is repeatable) against real PostgreSQL via PGlite.
- `tests/browser/reportArchive.browser.mjs` — archive from Incident Management,
  confirm it only appears under Logs, restore it, and confirm a user feed hides
  an archived report.
- `tests/clients/archivedReports.test.mjs` — every screen keeps archived rows
  out of its list, and the archive/restore actions stay wired up.
