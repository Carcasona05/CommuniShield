# Report Management priority order

Re-run the **updated `admin_view_more.sql`** in Supabase SQL Editor before
deploying this backend/client change. It is transactional and rerunnable. It
changes only browsing indexes/functions, not stored records, permissions on
tables, report status values, or local blotters. It has not been applied live.

Incident ordering (before pagination and export):

1. Pending Review
2. Under Verification
3. Verified
4. Resolved
5. Rejected
6. Marked Fake

Within each status: Critical, High, Medium, Low, then Unknown severity; oldest
creation time first; deterministic record-type/ID tie-breaking. Unknown incident
statuses follow the six known statuses. Announcements, activity entries and
local blotters follow incidents, retain newest-first ordering, and do not use
incident severity. Archived records stay in their separate view. Logs and the
archive keep their existing newest-first behavior.

The keyset cursor now carries frozen status/severity/time ordering keys, with
PostgreSQL timestamp precision preserved. The obsolete 13-argument overload is
dropped to avoid ambiguous PostgREST calls. Ordinary users still cannot execute
the RPC; only service_role is granted execution. Refreshing the loaded prefix
repositions reports after status/severity changes. The client uses a new cache
key and the same comparator when merging local blotters or exporting records.
