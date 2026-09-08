# CommuniShield — `profiles` Table Schema Explanation

## 1. Table Structure

The `profiles` table is a one-to-one extension of Supabase's `auth.users` table. Each
authenticated user has exactly one row here, keyed by the same `uuid`.

| Column        | Type        | Constraint / Default       | Purpose                                    |
| ------------- | ----------- | -------------------------- | ------------------------------------------ |
| `id`          | `uuid`      | PRIMARY KEY                | References `auth.users(id)`, cascades on delete |
| `first_name`  | `text`      | NULL                       | First name                                 |
| `middle_name` | `text`      | NULL                       | Middle name                                |
| `last_name`   | `text`      | NULL                       | Last name                                  |
| `fullname`    | `text`      | Auto-filled by trigger    | Computed: `first + middle + last` name; set by `set_fullname` trigger |
| `user_name`   | `text`      | NULL                       | Username (from the register form)          |
| `role`        | `text`      | NOT NULL, DEFAULT `'user'` | `'user'` / `'admin'` / `'super_admin'`     |
| `phone`       | `text`      | NULL                       | Optional contact number                    |
| `birthdate`   | `date`      | NULL                       | User's date of birth                       |
| `location`    | `text`      | NULL                       | User's address / current location          |
| `department`  | `text`      | NULL                       | Optional department for admins             |
| `status`      | `text`      | NOT NULL, DEFAULT `'Active'` | `'Active'` / `'Disabled'`                |
| `created_at`  | `timestamptz`| NOT NULL, DEFAULT now()    | Set on creation                            |
| `updated_at`  | `timestamptz`| NOT NULL, DEFAULT now()    | Auto-refreshed on update                   |

`fullname` is auto-derived from `first_name + middle_name + last_name` (blank
parts skipped). It is kept in sync by the `set_profiles_fullname` trigger
(`BEFORE INSERT OR UPDATE`). A regular column + trigger is used instead of a
**generated column** because `concat_ws` is not guaranteed immutable in every
Postgres version (a generated expression would fail with `42P17`). Code still
writes the individual name parts and `fullname` is set automatically.

`fullname` is a **generated column**: Postgres computes it automatically from
`first_name + middle_name + last_name` (blank parts skipped). It cannot be
written directly — code must write the individual name parts, and `fullname`
stays in sync automatically.

The `check` constraints enforce valid `role` and `status` values at the database level so bad data cannot be inserted.

## 2. Why it is in 3NF (Third Normal Form)

The relation satisfies 3NF (and BCNF) without any extra splitting:

- **Single key:** `id` is the only key.
- **1NF:** all columns are atomic (phone is a single number, not a list, etc.).
- **2NF:** every non-key column (`first_name`, `middle_name`, `last_name`, `user_name`, `phone`, `birthdate`, `location`, `department`, `status`, timestamps) depends on the *entire* key `id`, not just part of it (there is only one column in the key).
- **3NF:** no non-key column depends on another non-key column. For example, `department` does not determine `role`, and `role` does not determine `department`. `status` is independent of `role`. `fullname` is auto-derived from the name parts by a trigger rather than stored redundantly by hand.

Splitting `role` / `department` / `status` into lookup tables would only be for maintenance convenience, not a normalization requirement. Keeping the enums inline here is simpler and stays 3NF-compliant.

## 3. Automatically Creating a Profile

A database trigger runs whenever a new `auth.users` row is created, so every signup is guaranteed a profile.

- `handle_new_user()` inserts a profile row with `role = 'user'`, copying `firstName`, `lastName`, and `middleName` from the metadata (the generated `fullname` is computed automatically), plus the username from `user_metadata.userName` (falling back to `user_metadata.name`).
- Trigger `on_auth_user_created` fires `AFTER INSERT ON auth.users`, executing the function.

Both triggers are created inside `DO $$ ... end $$` blocks that `DROP TRIGGER IF EXISTS ...` first. This makes the script safe to re-run (Postgres does not support `CREATE OR REPLACE TRIGGER`).

## 4. Automatically Keeping `updated_at` Fresh

The `set_updated_at` function sets `updated_at = now()` on every `UPDATE` of the `profiles` table, handled by the `set_profiles_updated_at` `BEFORE UPDATE` trigger.

## 5. Row Level Security (RLS) & Role-Based Access

RLS is enabled so the app can safely use the Supabase anon/user-scoped client. Access is decided by the caller's `role`, read from the caller's own profile.

> **Important (defense-in-depth):** all admin/account CRUD in the backend uses the **service-role key** (`supabaseAdmin`), which **bypasses RLS entirely**. Backend authorization is application-level (only `super_admin` may create or manage admins). These RLS policies are an additional database-level guard for any future user-scoped access.

The helper `current_user_role()` returns the role of the current authenticated user (or anon/`NULL` for unauthenticated requests).

### Yes/No permission matrix

| Role          | SELECT                     | INSERT                                           | UPDATE                             | DELETE                                   |
| ------------- | -------------------------- | ------------------------------------------------ | ---------------------------------- | ---------------------------------------- |
| `user`        | Own profile only           | No                                               | Own profile only                   | No                                       |
| `admin`       | All profiles               | No (cannot add new admins)                       | Own profile only                   | No                                       |
| `super_admin` | All profiles               | Allowed (can create admins)                    | Any row (can promote/change roles) | Allowed                                  |

#### SELECT policies
1. `select_own_profile` — any authenticated user may read their own profile (`auth.uid() = id`).
2. `admin_select_all_profiles` — users whose role is `admin` or `super_admin` may read the full profile directory.

#### INSERT policy
- `super_admin_insert_profiles` — only `super_admin` may insert new rows. This is what prevents a regular `admin` from adding new admins. Regular signups insert via the auth trigger, not through this policy.

#### UPDATE policies
1. `update_own_profile` — anyone may update their own profile.
2. `super_admin_update_all` — `super_admin` may update any profile, including promoting to `admin`/`super_admin`, changing `role`, `status`, etc.

#### DELETE policy
1. `super_admin_delete_profiles` — only `super_admin` may delete profiles (account removal / deactivation).

## 6. How This Maps to the Backend

| Backend operation | Code location | Supabase client | RLS applies? |
| ----------------- | -------------- | --------------- | ------------- |
| Register / login  | `authController.ts`        | `supabaseAdmin` / `supabase` (anon) | No (service/anon) |
| Profile read      | `authService.getProfile` (line 15-19) | user-scoped token | Yes — own row via `select_own_profile` |
| Own profile edit  | `authService.updateName`   | user-scoped token | Yes — `update_own_profile` |
| Add admin         | `createAdmin` / `adminRegister` | `supabaseAdmin` | No — guarded in code (`role === 'super_admin'`) |
| Admin CRUD        | `adminController.ts`        | `supabaseAdmin` | No — guarded in code by `role === 'super_admin'` |

Because account management uses the service role, the backend checks `profile.role !== "super_admin"` before creating/viewing/updating/deleting admins (`adminController.ts` and `authController.ts`). The RLS policies in this script enforce the same rules at the database level for any user-scoped access.

---

# REPORTS — Community Feed Schema Explanation

> Schema file: `reports_schema.sql`. Covers the user report lifecycle:
> submit (`User_PostReport`), feed (`User_Home`), details + comments
> (`User_RepPostView`), and own-report list/edit/delete (`User_MyReports`).
> Admin safety posts in the same feed are stored in `admin_posts`.

## 1. Tables

| Table                | Purpose                                                       |
| -------------------- | ------------------------------------------------------------- |
| `incident_categories`| Top-level incident categories (7, seeded from the forms)       |
| `incident_types`     | Incident types; each belongs to one category (unique pair)     |
| `reports`            | The core user incident report                                 |
| `report_images`      | 0..N photos per report (form caps at 3; feed shows 2)          |
| `report_comments`    | Comments; drives the detail view and the comment count         |
| `report_likes`       | One like per user per report; drives the like count            |
| `admin_posts`        | Admin/SuperAdmin safety posts (feed source "Admin")            |

## 2. `reports` columns

| Column             | Type            | Notes                                             |
| ------------------ | --------------- | ------------------------------------------------- |
| `id`               | `uuid` PK       |                                                   |
| `user_id`          | `uuid`          | → `auth.users`; set null if user deleted          |
| `incident_type_id` | `uuid`          | → `incident_types` (normalized category + type)   |
| `location`         | `text`          | Display text (auto-fetched)                       |
| `latitude`         | `double precision` | Geo point (auto-fetched)                      |
| `longitude`        | `double precision` | Geo point (auto-fetched)                      |
| `poster_name`      | `text`          | Reporter display name chosen at submit time       |
| `display_name_type`| `text`          | `Fullname` or `Username`                          |
| `details`          | `text`          | Incident description                              |
| `status`           | `text`          | Pending Review / Under Verification / Resolved / Rejected / Archived |
| `is_verified`      | `boolean`       | Verified flag                                     |
| `created_at`       | `timestamptz`   | Set on creation                                   |
| `updated_at`       | `timestamptz`   | Auto-refreshed                                    |

## 3. Why it is in 3NF

- **1NF:** every column holds a single atomic value.
- **2NF:** `id` is the only key; every non-key column depends on the whole `id`.
- **3NF:** no non-key column depends on another non-key column. The incident
  text (`incident_category` / `incident_type`) is split into lookup tables
  (`incident_types` → `incident_categories`) instead of being repeated per
  report. Like/comment counts are **derived** via `COUNT()`, not stored, so
  there are no redundant counters to keep in sync.

## 4. RLS

- Feed content (`reports`, `report_images`, `report_comments`, `report_likes`,
  `admin_posts`) is readable by all authenticated users.
- Users manage only their own reports, images, comments, and likes.
- Only `admin` / `super_admin` (checked via `profiles.role`) may create/update/
  delete `admin_posts`.
- Admin validation writes (verified_by, status) go through the service-role
  backend client, which bypasses RLS.

## 5. Key queries

- Feed rows with type/category text, reporter name, and counts — see the
  query at the top of `reports_schema.sql`.
- A user's own reports (`User_MyReports`):
  `select * from public.reports where user_id = auth.uid() order by created_at desc;`

---

# NOTIFICATIONS — Schema Explanation

> Schema file: `notifications_schema.sql`. Covers the Notification screen
> (`User_Notification.jsx`) and the admin/superadmin bell dropdowns
> (`Admin_Layout.jsx`, `SAdmin_Layout.jsx`).

## 1. Tables

| Table                            | Purpose                                                        |
| -------------------------------- | -------------------------------------------------------------- |
| `notification_types`             | Lookup of valid notification kinds (1NF: no repeated type text) |
| `notifications`                  | Shared base row for every notification                         |
| `notification_report_status`     | Extra fields for "Your Reports" status updates (1:1)           |
| `notification_nearby_incident`   | Extra fields for "Near Your Location" alerts (1:1)             |
| `login_activities`               | "Recent Account Login" device sessions (separate entity)       |

## 2. `notifications` columns

| Column       | Type        | Notes                                          |
| ------------ | ----------- | ---------------------------------------------- |
| `id`         | `uuid` PK   |                                                |
| `user_id`    | `uuid`      | → `auth.users`, cascades on delete             |
| `type_id`    | `uuid`      | → `notification_types`                         |
| `title`      | `text`      | Notification headline                          |
| `message`    | `text`      | Notification body                              |
| `priority`   | `text`      | Low / Medium / High                            |
| `is_read`    | `boolean`   | Read/unread for the bell badge                 |
| `created_at` | `timestamptz`| Set on creation                               |
| `updated_at` | `timestamptz`| Auto-refreshed                                 |

Child tables (`notification_report_status`, `notification_nearby_incident`) use
`notification_id` as both primary key and foreign key, giving a 1:1 relationship
to a `notifications` row — shared fields stay in the base table while the
variant-specific fields live in the child.

## 3. Why it is in 3NF

- **1NF:** atomic columns; the three mock arrays (`userReports`,
  `nearbyIncidents`, `loginActivity`) are split into proper tables instead of
  repeated groups.
- **2NF:** every table has a single-column key (`id` / `notification_id`), so
  there are no partial dependencies.
- **3NF:** no non-key column depends on another non-key column. `type`/`level`/
  `priority` are constrained enums or lookup rows rather than duplicated text.

## 4. RLS

- Users read/update only their own notifications (`auth.uid() = user_id`).
- Child rows are visible only through an owning notification belonging to the
  caller (`EXISTS` against `notifications`).
- `login_activities` are restricted to their own user.

## 5. Key queries

- Bell dropdown: join `notifications` to `notification_types`, filter by
  `user_id`, order by `created_at desc`.
- "Your Reports": join to `notification_report_status` where type is
  `report_status`.
- "Near Your Location": join to `notification_nearby_incident` where type is
  `nearby_incident`.
- "Recent Account Login": `select * from login_activities where user_id = auth.uid()
  order by created_at desc;`

---

# EMERGENCY FACILITIES — Schema Explanation

> Schema file: `emergency_facilities_schema.sql`. Backs the map screen
> (`User_Map.jsx`): it fills the "Nearest Police" / "Nearest Fire Dept." summary
> cards and draws the pins on the Leaflet map via the `/facilities/nearby`
> endpoint.

## 1. Table structure

| Column       | Type               | Notes                              |
| ------------ | ------------------ | ---------------------------------- |
| `id`         | `uuid` PK          | Auto-generated                     |
| `name`       | `text`, UNIQUE     | Facility display name              |
| `type`       | `text`             | `'police'` or `'fire'` (checked)   |
| `latitude`   | `double precision` | Geo point                          |
| `longitude`  | `double precision` | Geo point                          |
| `address`    | `text`             | Display address                    |
| `phone`      | `text`             | Contact number (falls back to 911) |
| `created_at` | `timestamptz`      | Set on creation                    |

## 2. Seeded data (Argao only)

The map is locked to Cebu, and only **Argao, Cebu** facilities are seeded:

- **Argao Municipal Police Station** (`police`) — 9.8721, 123.5986
- **Argao Fire Station** (`fire`) — 9.8738, 123.5998

To add more pins, run an insert (the script uses `on conflict (name) do nothing`,
so re-running it is safe):

```sql
insert into public.emergency_facilities (name, type, latitude, longitude, address, phone) values
  ('Sample Police Station', 'police', 9.8700, 123.6000, 'Barangay, Argao, Cebu', '911')
on conflict (name) do nothing;
```

## 3. Normalization & RLS

- **3NF:** single-column key; no non-key dependencies. Distance is **not stored** —
  it is computed at request time with the haversine formula in
  `facilityService.ts` from the requesting coordinates. Adding/removing pins is a
  simple row insert/delete, with no counters or derived data to keep in sync.
- **RLS:** enabled; every authenticated user may read (`read_all_emergency_facilities`).
  Writes are done via SQL or the service-role backend, not the user client.

## 4. Key query

```sql
select * from public.emergency_facilities order by name;
```

---

# CREDIBILITY SCORE — Schema Explanation

> Schema file: `credibility_schema.sql`. Backs everything related to the
> **credibility score** in the codebase:
> - `User_ProfileSettings.jsx` — the account **Credibility Score** card with the
>   5-level timeline (`Suspended`, `At risk`, `Very Limited`, `Limited`, `All
>   good`). Today it hard-codes `credibilityStatus: 3`; the backend should return
>   the real value from `user_credibility.level`.
> - `Admin_Validation.jsx` / `SAdmin_Validation.jsx` / validation modals —
>   per-report AI analysis (`aiScore`, `severity`, `sentiment`,
>   `credibilityReview` / `credibility`).
> - `SAdmin_Settings.jsx` — AI credibility on/off toggle plus the High ("85→90")
>   and Medium ("60") thresholds.
> - `Admin_Analytics.jsx` — the "Credibility Rate" aggregate card.

## 1. Tables

| Table                          | Purpose                                                       |
| ------------------------------ | ------------------------------------------------------------- |
| `user_credibility`             | 1:1 account score per user (what the Profile Settings shows)  |
| `credibility_events`           | Audit trail of every change that moves the score              |
| `report_credibility_analysis`  | 1:1 AI analysis per report (validation screens)               |
| `app_settings`                 | AI toggle + high/medium credibility thresholds (singleton)    |

## 2. `user_credibility` columns

| Column        | Type            | Notes                                          |
| ------------- | --------------- | ---------------------------------------------- |
| `id`          | `uuid` PK       |                                                |
| `user_id`     | `uuid`, UNIQUE  | → `auth.users`, cascades on delete             |
| `score`       | `numeric(5,2)`  | 0–100; default 60                              |
| `level`       | `smallint`      | 0–4 index that feeds `statusIndex` in the UI   |
| `level_label` | `text`          | Display label                                  |
| `updated_at`  | `timestamptz`   | Auto-refreshed                                 |

`level` and `level_label` are **derived from `score`** by the
`set_credibility_level` trigger so they can never disagree with the number:

| Score range | `level` | `level_label` |
| ----------- | ------- | ------------- |
| 80–100      | 4       | All good      |
| 60–79       | 3       | Limited       |
| 40–59       | 2       | Very Limited  |
| 20–39       | 1       | At risk       |
| 0–19        | 0       | Suspended     |

The default row (`score 60` → `level 3` "Limited") matches the current hard-coded
UI value of `3`.

## 3. `credibility_events` — how the score moves

Instead of recomputing from scratch, every change is recorded as a row with a
signed `points` delta (`+` gains, `-` penalties). The reference events:

| `event_type`        | Typical source                                 |
| ------------------- | ---------------------------------------------- |
| `report_submitted`  | User files a report                            |
| `report_verified`   | Admin verifies a report (validation)           |
| `report_resolved`   | Report resolved / mapped                       |
| `report_rejected`   | Report rejected (credibility loss)             |
| `penalty`           | Abuse / repeated false reports                 |
| `admin_adjustment`  | Super admin manual correction                  |
| `system`            | Automatic system change                        |

`report_id` optionally links the event to the report that caused it
(`on delete set null`).

## 4. `report_credibility_analysis` columns

| Column              | Type            | Notes                                        |
| ------------------- | --------------- | -------------------------------------------- |
| `id`                | `uuid` PK       |                                              |
| `report_id`         | `uuid`, UNIQUE  | → `reports`, cascades on delete (1:1)        |
| `ai_score`          | `numeric(5,2)`  | 0–100 (admin list shows `X%`)                |
| `severity`          | `text`          | Low / Medium / High / Critical               |
| `sentiment`         | `text`          | Negative / Neutral / Positive / Concerned / Anxious / Unclear |
| `credibility_level` | `text`          | Low / Medium / High (drives the `ScoreBadge`)|
| `credibility_review`| `text`          | Free-text AI justification                   |
| `ai_model_version`  | `text`          | Model that produced it                       |
| `analyzed_at`       | `timestamptz`   | Set on creation                              |

The validation UI groups `aiScore` by report; this is also the source for the
"Credibility Rate" card in `Admin_Analytics`.

## 5. `app_settings` (singleton)

| Column                       | Type      | Default | Notes                      |
| ---------------------------- | --------- | ------- | -------------------------- |
| `ai_credibility_enabled`     | `boolean` | `true`  | `SAdmin_Settings` toggle   |
| `high_credibility_threshold` | `smallint`| `90`    | Threshold config input     |
| `medium_credibility_threshold`| `smallint`| `60`   | Threshold config input     |
| `updated_at`                 | `timestamptz` | `now()` | Auto-refreshed       |

## 6. Seeded data

- `app_settings`: one row (`true`, 90, 60); rerun safe via
  `WHERE NOT EXISTS`.
- `user_credibility`: one default row per **existing** profile
  (`select id from public.profiles ... on conflict (user_id) do nothing`).
- New accounts automatically get a `user_credibility` row via the
  `on_profile_created_credibility` trigger on `profiles`.

> Order matters: run `profiles_schema.sql` first (the seed depends on
> `profiles`), then `reports_schema.sql` (the analysis table references
> `reports`), then this script.

## 7. Normalization & RLS

- **3NF:** single-column keys; `level`/`level_label` are derived by trigger, not
  stored by hand; like/score aggregates come from `credibility_events`
  (signed deltas), never cached totals.
- **RLS:** users read their own score and events; `admin`/`super_admin` read
  everyone's; validation and settings data is readable by all authenticated
  users (writes happen via the service-role backend).

## 8. What the backend still needs

- `/profile` (`authController.getProfile`) must join `user_credibility` and
  return `credibility_score` (0–100) and `credibility_status` (the 0–4 index) so
  `User_ProfileSettings.jsx` can replace its hard-coded `credibilityStatus: 3`.
- Report feeds (`reportService.listReports`) should join
  `report_credibility_analysis` and expose `ai_score`, `severity`, `sentiment`,
  and `credibility_review`, which the validation screens already expect.