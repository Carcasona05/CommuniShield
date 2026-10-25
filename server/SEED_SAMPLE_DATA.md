# Sample data using existing test accounts

Paste **`DB_Schema/seed/communishield_sample_seed.sql`** into the Supabase SQL
Editor for the database used by your running backend, then Run the entire file.
The project schema and sentiment migrations must already be installed.

## Existing accounts — no login needed

The seed resolves real account IDs by email:

- `poster1@communishield.local` through `poster20@communishield.local`
- `commenter1@communishield.local` through `commenter15@communishield.local`

It **never creates, deletes or updates accounts, profiles, passwords, roles or
user credibility scores**. No password or email verification code is needed to
run SQL as the Supabase database owner. This does not change the app's login
requirements.

Before any cleanup or inserts, a preflight checks that all 35 accounts have an
active user profile. It lists missing/inactive accounts in an exception and
stops the transaction rather than silently dropping reports or comments.
One existing active admin/super-admin is also required for synthetic audit,
announcement, validation and dataset metadata. These rows are test fixtures,
not evidence of real actions by that administrator.

## Included data

| Data | Quantity |
| --- | --- |
| Reports | **640**, spread across all **20 poster accounts** |
| Comments | **700**, spread across all **15 commenter accounts** |
| Report history | 140 days relative to the time SQL runs |
| Map locations | 46 distinct pins; 6 planted hotspots and 12 noise pins |
| Report sentiment | 513 synthetic analyses: 452 usable, 61 failed |
| Comment sentiment | 700 synthetic analyses: 525 usable, 175 failed |
| Credibility analyses | 513 synthetic analyses, including all severity levels |
| Engagement | 350 likes, 150 placeholder images, 150 validations |
| Activity | 90 sample audit logs, 110 notifications, 400 synthetic credibility events |
| Admin content | 8 sample announcements |
| Emergency facilities | 4 fictional facilities, if the table exists |
| Sentiment datasets | 5 datasets, 100 samples, 10 review events |

Reports show the existing account's username (or profile name/email fallback).
Comments belong to separate commenter accounts. All report/comment text is
labelled synthetic. The sentiment and credibility rows are synthetic fixtures,
**not live AI results**. SQL does not trigger the API's posting notifications or
AI analysis workflow; the seed includes sample rows for those screens directly.

### Real-world-style conversations (still fictional)

The reports now use concrete, incident-specific accounts in Cebuano, Filipino
and English rather than generic numbered test sentences. They include partial
observations, uncertainty, practical requests, privacy precautions, later
clarifications and resolved-case updates. Local landmarks are fictional,
generic descriptions, not verified street addresses at the generated pins.

The 700 comments form **171 unevenly sized discussions**, up to **12 replies**.
469 reports have no replies. Comments ask relevant questions, offer practical
cautions, acknowledge updates, correct assumptions or explain limited knowledge
of the event. Brief replies and more detailed observations are mixed. Every
comment is timestamped after its parent report and in thread order.

Authored sentiment fixtures match the language and intended text tone. Scenario
severity is independent of emotional tone: an unfamiliar visitor is not treated
as a criminal, and a worried lost-wallet report is not assigned high danger.
These are illustrative authored labels, not calibrated assessments or ground
truth for model evaluation. Every visible entry retains its simulation label.

Reports include 121 Pending Review, 201 Under Verification, 159 Resolved,
53 Rejected, 53 Marked Fake and **53 Archived**. Archived reports appear only
in Logs → Archived reports, not active views. Other views may apply their usual
date, status, verification or map filters. Refresh the app after loading.

The result summary should show:

| sample_reports | poster_accounts | sample_comments | commenter_accounts |
| --- | --- | --- | --- |
| 640 | 20 | 700 | 15 |

## Safety and reruns

Everything runs inside `begin; … commit;`. A failure commits none of the changes.
If your SQL client keeps an aborted transaction open, run `rollback;` before
retrying. **Do not run only the INSERT section**: the preflight and temporary
account lookup tables are required.

Reruns replace the seed's report/comment/dataset UUID namespaces and auxiliary
`Sample …` markers. Accounts and existing credibility scores remain untouched.
Seed credibility events are removed before reports so their report IDs do not
become null during cleanup. Temporary lookup tables disappear at commit.

The legacy `admin_posts` table is not referenced by any statement. Optional
`emergency_facilities` and `system_settings` statements are guarded and print a
NOTICE when their table is absent. Missing required tables or columns still
produce an error; apply the project schema/migrations first.

To remove the fixtures, run the preflight and section 0 cleanup, followed by
`commit;`, without the insert sections. This preserves the reused accounts.

## Regenerate and test

From `server/`:

```sh
npm run seed:generate
npm test
```

`../tests/server/SampleSeed.test.ts` checks file freshness, byte size, determinism, account
preservation, complete owner distribution, quoted UUIDs, schema columns, CHECK
vocabulary, row counts, coordinate/barangay resolution, production DBSCAN and
submitted-report outlook gates. The generated SQL, PL/pgSQL guard bodies and
dynamic statements have also been parsed with PostgreSQL's parser (`pglast`).
The compact account lookup function is session-local and dropped before commit.
Repeated simulation labels are added by SQL, and sentiment source text is read
from the persisted report, keeping the file below 950 KB without losing content.

Parsing is not live database execution: deployment-specific schema differences
can still fail at runtime. This file has not been executed against your live DB.

Sentiment measures submitted text tone, not danger. Hotspot weights are submitted
report counts. Forecasts estimate submitted-report counts, not crime likelihood.
Freshly seeded reports may later be re-analysed by the normal pipeline.
