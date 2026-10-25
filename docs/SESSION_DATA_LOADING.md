# Authenticated page preloading and refresh

## Behavior

- Completed email-device verification (or a trusted-device login) calls
  `saveAuth`, then starts `prefetchAllData`. A password-only challenge never
  starts protected preloading.
- Reloads and direct links validate the lightweight `/session` before mounting role-protected
  pages or starting prefetch. The server's role takes precedence over the saved
  role. This does not replace backend authorization.
- Regular admins do **not** request `/admin/accounts`. Only super-admin plans
  include that endpoint; the client transport also guards accidental calls.
  The backend's super-admin permission remains unchanged.
- Residents preload their reports, profile, options, preferences and notifications;
  they do not preload admin-only data. `/admin/posts` is admin-only, so the user
  feed no longer lets that forbidden call discard a successful `/reports` result.
- Three preload consumers prioritize the landing page and continue independently.
  The interface does not wait for every optional page to finish before allowing
  navigation. No image downloads, exports, exhaustive page traversal, dataset
  approvals or training actions are performed by prefetch.

## Shared request and display caches

`clients/services/sessionData.js` is the session-scoped transport/cache boundary.
`apiClient.js` installs it as the Axios adapter for existing callers. Concurrent
GETs for the same URL/parameters share one request. Different filters, sessions
and roles cannot share response data.

Safe page GETs have an **8-second network reuse window**. A fetch after that goes
to the server. A caller can use `{ cacheMode: "network" }` for explicit refreshes;
such a refresh still shares any already-running identical request. Training
status refresh and retained geographic queries explicitly request fresh data.
Auth endpoints, exports, arbitrary detail URLs and requests with custom response
types or cancellation controls are not added to this response cache.

Successful page GETs prime both the existing `api:<endpoint>` cache (unfiltered
requests only) and filter-specific `query-snapshot:` entries. Existing cache-first
pages, logs and record management can show those results immediately on navigation.
Snapshots are retained for at most **5 minutes**; forecast snapshots cannot be
reused across UTC midnight. Cache retention is not a promise of offline support.

Detailed page data is **memory-only**. Old unscoped `communishield_data_cache`
storage is discarded, never restored. Normal in-app navigation reuses the current
session's memory cache. Tokens remain in existing auth storage, not in persisted
page cache keys or values.

## Browser reloads: safe IndexedDB previews

`persistentPageCache.js` writes a deliberately small allowlist to IndexedDB:

- Numeric `/admin/overview` counts, without any report details.
- Incident-category/type catalogs used by report forms.

**Not persisted:** report narratives, coordinates, identities, photos, account
records, audit logs, notifications, settings, dataset examples, training artifacts
or auth tokens. Saving every previously fetched response would create an
unnecessary privacy and storage risk. Native builds and browsers without usable
IndexedDB retain the memory/network behavior instead.

Each snapshot is scoped to the backend URL, server-verified user ID and role. A
reload performs real Supabase/API-session/account validation **before** restoring
anything. Saved role flags alone cannot unlock it. Snapshots expire after five
minutes or at UTC midnight and cannot extend their age merely by being restored.
Mutations, denials, logout and account/role changes clear saved previews; queued
old writes and delayed reads are fenced off. IndexedDB is not an encryption or
authorization boundary—this is why only non-personal preview data is allowed.

The dashboard labels restored counts **Saved overview** while refreshing. It does
not seed detailed validation/maps/logs with an empty or fabricated report list.
Fresh live counts replace the preview. Disk restoration has a 300ms budget;
blocked, corrupt, quota-limited or unavailable storage does not block sign-in.

## First-content performance target

- `GET /api/session` returns only the authenticated user ID and role. It reuses
  the middleware's validated profile instead of loading credibility, report and
  full-profile payloads. Supabase identity, approved device/session state and
  account status still must be checked. It is never response-cached.
- `GET /api/admin/overview` is admin/super-admin-only and uses exact HEAD counts
  rather than loading report narratives, comments, images and reporter profiles.
  Counts include non-archived reports and preserve existing dashboard categories;
  the legacy `hotspots` count is high/critical report count, not DBSCAN membership.
- The overview controls initial dashboard rendering. Slow details, accounts and
  secondary panels cannot keep the entire page skeleton open. Unknown account/log
  counts show a dash until loaded rather than invented zeroes.
- Login's artificial 800ms navigation delay is removed. The startup session probe
  and landing overview have 10-second request timeouts; network/503 failures offer
  a retry without unlocking saved data or needlessly clearing valid credentials.

The target is **usable initial overview within three seconds**, not completion
of every background request. The controlled local browser test holds detailed
report requests and measures first visit and a validated cached reload. Production
results still depend on hosting cold starts, Supabase/Redis latency, device and
network. No real deployment SLA or measured production latency is claimed.

## Updates and isolation

- A session-owned 60-second background sweep warms the role's common pages.
  Existing focused-page refresh hooks remain. Hidden/background apps skip sweeps
  and refresh on returning to the foreground. Timers/listeners stop on logout.
- Successful authenticated mutations invalidate shared reads and schedule a
  follow-up warmup. Old in-flight pre-mutation GETs cannot publish stale snapshots.
  Active pages retain their explicit action reloads and optimistic UI behavior.
- Existing administrative notification broadcasts also invalidate reads before
  calling their refresh handler. This does not create a new subscription to every
  database table; other remote changes arrive through polling/focus refresh.
- Temporary read errors retain still-usable page data. Authorization denial
  evicts that endpoint's cached data; expired/disabled API sessions clear auth.
- Login/logout and account/role changes fence prior requests, clear all page data
  and cancel shared GETs. Credential writes are serialized and private requests
  are paused during transitions. Late responses from old sessions are rejected.

## Configuration and verification

`EXPO_PUBLIC_API_URL` is used for both web and native builds. Production builds
must configure it and rebuild; development may fall back to the existing LAN
address. No new server environment variables or SQL migrations are needed.
**Deploy the backend first, then rebuild/redeploy the frontend**, because the
client now needs `/api/session` and `/api/admin/overview`.

- `tests/clients/sessionData.test.mjs`: role plans, account guards, deduplication,
  filtered keys, TTL, denial/error behavior, mutation/session fencing and UTC dates.
- `tests/clients/sessionLoading.test.mjs`: preload scheduling, lifecycle,
  authoritative role restoration, verified-login wiring and real Axios integration.
- `tests/browser/sessionNavigation.browser.mjs`: mocked email verification,
  no pre-auth preloading/no admin account requests, shared landing reads and cached
  Logs rendering while its background response is held.
- `tests/clients/persistentPageCache.test.mjs`: privacy allowlist, identities,
  roles/backends, expiry, invalidation, corrupt storage and bounded restoration.
- `tests/server/StartupData.test.ts`: verified session context reuse, exact head
  counts, minimal payloads and explicit failures.
- `tests/browser/persistentOverview.browser.mjs`: real IndexedDB in Chrome,
  validation-before-display, saved/live labels, expired-session denial and the
  under-three-second target with mocked APIs and held report-detail requests.
- Existing browser suites cover moderation, user posting, geographic views and
  dataset/training lifecycle controls against the updated client export.

This improves navigation after data is warmed; it does not guarantee zero latency
for a first visit, a new filter, expired data, or an unavailable backend.
