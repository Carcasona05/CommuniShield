# User report posting

The **+** button performs the frontend participation/profile preflight once and
shows a spinner while checking, with repeated taps locked. The form does not
repeat those requests on focus or when Post Report is pressed. Current account,
profile, suspension and allowance rules are still enforced by the backend on
every submission. Required-field validation remains on the form.

Valid drafts are copied into a session-scoped in-memory posting manager, then the
client navigates to Home. Only **Uploading your post…** floats above the bottom
navigation bar, without a card/background or progress detail. The report is not inserted into the
feed optimistically. Success requires a backend response containing `report_id`;
only then is the feed refreshed, the text removed and the existing success toast
shown. Error toasts explain failures; plain-text recovery actions retain drafts.

## Failure and retry

- Photo/pre-save failures retain the draft, attachments and GPS coordinates.
  **Retry** resubmits subject to backend authorization. **Edit draft** restores the form without a
  delayed GPS lookup overwriting the saved address/coordinates.
- A save rejected with 401/403/429 can be retried with backend validation; completed
  photo URLs are reused within that job.
- Other failed or missing save responses are **Submission not confirmed**. The
  backend may have persisted a report before its response was lost, or a later
  attachment operation may have failed. The client links to **My Reports** instead
  of automatically resending and risking a duplicate. This is not an exactly-once
  or server-idempotent submission protocol.
- One pending/failed job is retained at a time; rapid clicks and re-entering the
  form cannot queue duplicate uploads. A new draft can start after confirmed
  success, or after the prior failure is returned to editing.

## Lifetime and privacy

Navigation within the running app does not cancel posting. Logout, disabling the
account or changing sessions clears draft state, aborts requests and fences late
callbacks. Uploads check the original token before sending photos; they cannot
silently attach the replacement account's credentials.

Drafts/photo URIs are held in RAM only, not persisted to browser storage. Refresh,
closing the app or OS process termination is **not** recoverable by this feature.
Keep the app open until completion. Aborting a request
cannot undo a database write already accepted by the server. Uploads that finish
before a later failure may leave unreferenced remote files; lifecycle cleanup is
not added by this client change.

No SQL migration is required. Existing backend authorization and report-creation
logic remain authoritative.

## Reset after confirmed success

Every confirmed report increments a session-local completion revision that
survives dismissal of the success toast. The retained Post Report tab uses it to
clear text, chosen category/type, photos, address and coordinates and restore the
default Fullname choice/profile display name. Reopening starts at scroll position
zero and obtains a new location. Draft handoff alone does not clear inputs;
failed uploads keep the saved draft for retry/edit. Restoring a failed draft also
starts at the top without overwriting its GPS/address with a late location lookup.
