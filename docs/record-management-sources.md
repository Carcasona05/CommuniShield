# Record Management sources and eligibility

## Deployment

Re-run **`DB_Schema/migrations/admin_view_more.sql`** before deploying/restarting
the updated backend and client. Its existing 14-argument RPC is replaced in place;
no report rows are edited/deleted and no public table permissions are expanded.
The assistant has not applied it to the live database.

The updated function includes user-created incidents and excludes Rejected,
Marked Fake and Archived incidents **before** paging, counting and export. Record
activities that represent those actions, or reference an excluded incident, are
also omitted from this view. Logs and Archived views retain their separate
history and chronological order. Legacy priority cursors keep their sort format;
the client uses a versioned cache key to avoid reusing older eligibility results.

## Filters

- Posted By defaults to **Admin**; choices are Admin, Super Admin and User (no All).
- Selecting User sets Type of Report to Incident and disables that selector.
  Both the backend service and database enforce Incident for the user source,
  even if an API caller supplies a contradictory kind.
- Switching to an admin source restores the All report-type selection and unlocks
  it. Status/date/type/source filters apply to list totals and exports together.
- The heading reflects the selected source and report type. User records can be
  inspected/exported here, but do not expose this page's Edit/Delete/Archive
  actions. Human moderation remains in Report Management. Backend authorization
  policies are unchanged.
- Date presets are All dates (default), Today, Past 7 days and Past 30 days.
  Today starts at Argao UTC+8 midnight; seven/thirty-day selections are rolling
  windows. Bounds refresh on the normal focused poll and are shared by remote
  rows, counts, local blotters and exports.

Local blotters remain local and admin-authored. They are merged only when matching
the selected source/type/date/status. They are not relabeled as user incidents.

## Photos

The shared Similar Reports modal opens each attachment at its selected index in
the fullscreen viewer for both admin roles. The viewer handles pinch, one-finger
pan while zoomed, swiping while unzoomed and explicit previous/next/reset/zoom
controls. Browser touch handling disables the browser's competing touch gestures;
the image pager no longer intercepts pinch gestures.
