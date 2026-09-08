# CommuniShield — Admin & Super Admin Schema Explanation

> Schema files: `admins_schema.sql` (audit logs, validation history, system
> settings, announcements) and `admin_reports_schema.sql` (admin-filed incident
> reports — **optional / not applied for now**).
> Run after `profiles_schema.sql` (it relies on `current_user_role()` and
> `profiles`), and after `reports_schema.sql` (it references `reports` and
> `incident_types`).

## 1. What the Admin / Super Admin modules need

An audit of every Admin and SAdmin screen shows the modules depend on these
distinct entities:

| Module / Screen                | Needs                                                                 |
| ------------------------------ | --------------------------------------------------------------------- |
| Admin Dashboard                | Report counts, hotspots, recent report activity                        |
| Admin Validation (Similar Reports) | Incident reports, AI score/severity/sentiment/review, images, comments |
| Admin Logs                     | Audit trail of admin actions                                           |
| Admin Analytics                | Report aggregates, sentiment trend, credibility rate                   |
| Admin Add Report               | Incident report form (same as the user's Post Report), stored in `admin_reports` — optional, see `admin_reports_schema.sql` |
| Admin Settings                 | Admin's own profile (name, username, phone, department, password)     |
| SAdmin Dashboard               | Aggregate stats, admin-account summary, audit trail, AI settings       |
| SAdmin Validation              | Incident reports + validation decisions (verify/reject/resolve/archive)|
| SAdmin Admin Accounts          | Admin accounts CRUD (name, email, role, department, phone, status)    |
| SAdmin Audit Logs              | Audit trail of system/admin actions                                    |
| SAdmin Settings                | AI toggle + thresholds, map prefs, notification prefs, API/model info |

Most of these screens currently render hard-coded mock data. The backend
entities below are the schema needed so the modules can be wired to real data.

## 2. What already exists (no new tables needed here)

| Existing table         | Source file            | Covers                                                     |
| ---------------------- | ---------------------- | ---------------------------------------------------------- |
| `profiles`             | `profiles_schema.sql`  | Admin accounts: `role`, `department`, `phone`, `status`, name parts |
| `reports`              | `reports_schema.sql`   | User-filed incident reports + `status` / `is_verified` lifecycle |
| `report_images`        | `reports_schema.sql`   | Photos on each user report                              |
| `report_comments`      | `reports_schema.sql`   | Comments used by the sentiment analysis in validation      |
| `incident_categories`  | `reports_schema.sql`   | The 7 fixed incident categories                            |
| `incident_types`       | `reports_schema.sql`   | Types per category                                         |
| `admin_posts`          | `reports_schema.sql`   | Legacy admin announcements / safety posts (feed source "Admin"); superseded by `admin_announcement` |
| `report_credibility_analysis` | `credibility_schema.sql` | Per-report `ai_score`, `severity`, `sentiment`, `credibility_review` |
| `notifications` + children | `notifications_schema.sql` | Admin/SAdmin bell notifications (types `admin`, `ai`, `system`, `log`) |
| `app_settings`         | `credibility_schema.sql` | AI credibility toggle + high/medium thresholds            |
| `user_credibility`     | `credibility_schema.sql` | Per-user credibility score (Admin Analytics "Credibility Rate") |

## 3. New tables added by `admins_schema.sql`

### 3.1 `audit_logs`

Every admin/super-admin action that should be traceable (Admin_Logs,
SAdmin_AuditLogs, dashboard "recent activities").

| Column        | Type        | Notes                                        |
| ------------- | ----------- | -------------------------------------------- |
| `id`          | `uuid` PK   |                                              |
| `actor_id`    | `uuid`      | → `auth.users`, set null if admin deleted    |
| `actor_name`  | `text`      | Display name of who performed the action     |
| `action_type` | `text`      | Constrained enum of admin actions            |
| `title`       | `text`      | Short headline                               |
| `details`     | `text`      | Free-text detail                            |
| `report_id`   | `uuid`      | → `reports`, set null if report deleted      |
| `old_value`   | `text`      | Previous state (e.g. old status)             |
| `new_value`   | `text`      | New state (e.g. new status)                  |
| `created_at`  | `timestamptz` | Set on creation                            |

`action_type` covers: Report Verified, Report Mapped, Report Rejected, Report
Deleted, AI Analysis Completed, Admin Added, Admin Updated, Admin Disabled,
Admin Deleted, System Settings Updated, Announcement Created, Notification Sent.

### 3.2 `report_validations`

A normalized history of every validation decision, so the "Similar Reports"
modals and dashboard can show `verifiedBy`, `remarks`, and full status history
without denormalizing the `reports` table.

| Column          | Type        | Notes                                             |
| --------------- | ----------- | ------------------------------------------------- |
| `id`            | `uuid` PK   |                                                   |
| `report_id`     | `uuid`      | → `reports`, cascade on delete                    |
| `admin_id`      | `uuid`      | → `auth.users`, set null if admin deleted         |
| `action`        | `text`      | Under Verification / Resolved / Rejected / Archived / Marked Fake |
| `previous_status` | `text`    | Status before the action                          |
| `new_status`    | `text`      | Status after the action                           |
| `remarks`       | `text`      | Admin note shown on the report                    |
| `created_at`    | `timestamptz`| Set on creation                                  |

The current `verified_by` / `remarks` shown by the validation UI are derived
from the latest `report_validations` row for a report. No counters or derived
columns are stored.

### 3.3 `system_settings`

Key/value store for the SAdmin Settings page (map preferences, notification
preferences, AI model/API metadata). A key/value table keeps this extensible
and avoids a wide settings table. AI credibility toggle + thresholds stay in
the existing typed `app_settings` table.

| Column     | Type        | Notes                                     |
| ---------- | ----------- | ----------------------------------------- |
| `key`      | `text` PK   | Setting name                              |
| `value`    | `text`      | Setting value (stored as text)            |
| `updated_at` | `timestamptz` | Auto-refreshed on update              |

Seeded keys: `map_auto_map_verified`, `map_cluster_overlay`,
`map_heatmap_overlay`, `map_default_zoom`, `map_center`,
`notification_email`, `notification_push`, `ai_model_version`,
`ai_api_endpoint`.

### 3.4 `admin_reports` + `admin_report_images` (optional)

> Defined in **`admin_reports_schema.sql`**. This file is **not part of the
> current build** — it is kept separate because the admin "Add Report" feature
> is not being implemented yet. Only `admin_announcement` (below) is active.

Incident reports filed by an admin through the validation screen's **Add
Report** button. It mirrors the user report form (`User_PostReport`): pick an
incident category + type, auto-fetch the current location, add details and
photos, then submit. Admin reports are stored separately from user reports so
the feed and validation queues can tell them apart.

| Column           | Type             | Notes                                  |
| ---------------- | ---------------- | -------------------------------------- |
| `id`             | `uuid` PK        |                                        |
| `admin_id`       | `uuid`           | → `auth.users`, set null if admin deleted |
| `incident_type_id` | `uuid`         | → `incident_types` (normalized category + type) |
| `location`       | `text`           | Display text (auto-fetched)            |
| `latitude` / `longitude` | `double precision` | Geo point (auto-fetched)     |
| `poster_name`    | `text`           | Reporter display name                  |
| `display_name_type` | `text`        | `Fullname` / `Username`                |
| `details`        | `text`           | Incident description                   |
| `status`         | `text`           | Same lifecycle as user reports         |
| `is_verified`    | `boolean`        | Verified flag                          |
| `created_at` / `updated_at` | `timestamptz` | Set / auto-refreshed             |

`admin_report_images` holds the 0..N photos per admin report (cascade on
delete), identical in shape to `report_images`.

### 3.5 `admin_announcement`

Public announcements / safety advisories created by an admin (the current
`Admin_AddReportModal`-style announcement form, and the user feed "Admin"
source). This table supersedes the legacy `admin_posts` table.

| Column     | Type        | Notes                                        |
| ---------- | ----------- | -------------------------------------------- |
| `id`       | `uuid` PK   |                                              |
| `admin_id` | `uuid`      | → `auth.users`, set null if admin deleted    |
| `type`     | `text`      | Curfew, Road Closure, Emergency, Weather Advisory, Seminar, Safety/Tips, Announcement, etc. |
| `title`    | `text`      | Announcement headline                        |
| `location` | `text`      | Optional area reference                      |
| `details`  | `text`      | Announcement body                            |
| `pic_url`  | `text`      | Optional image                               |
| `created_at` / `updated_at` | `timestamptz` | Set / auto-refreshed            |

## 4. Admin "Add Report" vs announcements

The Admin / SAdmin validation screens have an **Add Report** button. Today the
front-end mistakenly opens an announcement-type form; the intended behavior is
an incident report form identical to the user's Post Report. The schema
therefore models two distinct things:

- **`admin_reports`** — admin-submitted incident reports (the Add Report form,
  like `User_PostReport`). **Deferred** — lives in the optional
  `admin_reports_schema.sql`.
- **`admin_announcement`** — announcements / advisories shown in the user feed.
  **This is the active table** for the announcement feature that exists now.

They are kept in separate tables so an incident report is never confused with
an announcement, and each has its own lifecycle.

## 5. 3NF notes

- Every new table has a single-column primary key, so there are no partial
  dependencies (2NF is satisfied by construction).
- No non-key column depends on another non-key column: `action_type` does not
  determine `title`; `new_status` does not determine `remarks`; a setting
  `key` determines only its own `value` (3NF).
- Validation history and audit records are **rows**, not repeated groups or
  comma-separated strings (1NF).
- Derived values are not stored: current report status lives on `reports`,
  `verifiedBy`/`remarks` come from the latest `report_validations` row, and
  dashboard/analytics counts are computed with `COUNT()` queries.

## 6. RLS

- `audit_logs`: readable and writable only by `admin` / `super_admin` (via
  `current_user_role()`).
- `report_validations`: readable and writable only by `admin` / `super_admin`.
- `admin_reports` + `admin_report_images`: readable and writable only by
  `admin` / `super_admin`.
- `admin_announcement`: readable by all authenticated users (feed); writable
  by `admin` / `super_admin`.
- `system_settings`: readable by all authenticated users; only `super_admin`
  may update.
- Like the rest of the backend, admin writes also go through the service-role
  client, so these policies are defense-in-depth.

## 7. Run order

1. `profiles_schema.sql` (provides `profiles` + `current_user_role()`)
2. `reports_schema.sql` (provides `reports`, `admin_posts`)
3. `notifications_schema.sql`
4. `credibility_schema.sql`
5. `emergency_facilities_schema.sql`
6. `admins_schema.sql`
7. `admin_reports_schema.sql` — **optional**, only when the admin Add Report
   feature is implemented (depends on `incident_types` from step 2).

## 8. Still needed on the backend

The screens currently show mock data. For the **announcement** feature that
exists now, the API needs a write endpoint that inserts into
`admin_announcement` (plus read for the user feed). Later, when
`admin_reports` is enabled, admin report submission would reuse the user report
flow (`POST /reports`). Also still needed: validation decisions
(`report_validations`), audit logs (`audit_logs`), system settings
(`system_settings`), and dashboard / analytics aggregates (computed from
`reports` + `report_credibility_analysis` + `report_validations`). Admin
account CRUD already exists (`/admin/accounts`, `/admin/register`).
