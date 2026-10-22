# Report submission latency

## Why it was slow

`POST /api/reports` previously saved a report and then awaited submission
points, geographic notification fan-out, Gemini credibility analysis,
sentiment analysis and admin notification fan-out before returning HTTP 201.
Report persistence also repeated the client's reverse geocoding (up to its
8-second timeout) and reread the location. Photos were compressed/uploaded
serially on the client. External-model retries could therefore keep the
submit button spinning long after the report already existed.

## Current flow

1. Validate/authenticate as before and resolve the incident type.
2. Save the report and its photo links. Preserve the client's address/street;
   if absent, derive a barangay fallback from bundled polygons without a
   network geocoder. Return the inserted location directly, no reread/update.
3. Register post-processing with `backgroundTasks.schedule` and Vercel's
   official `waitUntil` hook, then return HTTP 201 with the real report ID and
   `analysis.credibility` / `analysis.sentiment_status` both `pending`.
4. In parallel, run points, nearby notifications, credibility and sentiment.
   Admin notifications retain severity-derived priority after credibility;
   they no longer wait for unrelated sentiment completion. Stored analyses
   remain available through existing reads/refresh. No fake score is returned.
5. Log failed background steps without turning a persisted report into a
   misleading submission error or an unhandled rejection.

The shared image uploader runs up to 3 uploads concurrently, preserves the
selected order and waits for in-flight uploads to settle before reporting a
failure. It never silently drops failed selected photos. Bucket setup is
shared/cached per server instance and object paths use UUIDs with `upsert:
false`, preventing same-millisecond parallel uploads from overwriting each
other. This uploader is also used by the admin add-report form.

User Post Report now displays preparation/upload/save progress. An immediate
ref lock protects against double taps before React re-renders; errors unlock
the form without clearing input. The existing 1.2-second success-toast pause
before navigating home remains, with the submit action locked during it.

## Deploy / limits

`@vercel/functions` was added to server dependencies/lockfile. Install with
`npm ci` when deploying; no new database migration, queue worker, key or
hosting service is required. Restart the local backend after dependency
changes and refresh the client (the local watcher normally reloads source).

`waitUntil` keeps work associated with the Vercel request after its response;
it is **not a durable queue or an automatic retry mechanism**. Work still shares
the function's execution-duration limit. Set an appropriate supported Vercel
max duration for the existing model timeouts; process shutdown, deployment,
or duration exhaustion can interrupt analysis/notifications. Existing admin
re-analysis can repair unfinished model results. Use a durable jobs table /
worker or managed queue if guaranteed retries are required; none are claimed
here. Do not stop the local server immediately after a submitted post if you
want its background work to finish.

Photo transfer, authentication, database latency and cold starts still affect
submission time. There is no claim of a fixed millisecond production latency.
Foreground failures before confirmation still surface as errors. The tap lock
is not server-side idempotency across multiple devices or ambiguous network
retries; that would need a separate persistent request-key design.

## Verification

- `src/ReportSubmission.test.ts`: HTTP acknowledgement while a real tracked
  background promise is deliberately blocked; persistence-before-success;
  failure isolation; preserved points/notification behaviour; no geocoder or
  location reread; photo-link persistence; unique parallel storage paths.
- `clients/tests/uploadBatch.test.mjs`: concurrent execution, bounded work,
  order/progress, failure visibility and waiting for in-flight work.
- `tests/reportSubmission.browser.mjs`: actual user form with mocked API/storage,
  duplicate clicks, saving progress, retry after a save error, navigation with
  analysis still pending, gallery photo failure and successful photo retry.

Tests do not insert reports into the live database or notify actual accounts.
