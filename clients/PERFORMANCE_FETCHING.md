# Page loading and background warming

## What changed

- Visible pages make their normal requests first. Optional prefetching yields for
  750 ms before each request and waits while foreground API work is active.
- Only one optional prefetch request runs at once. The worker pauses when the app
  is hidden/backgrounded and stops on logout/account changes.
- The one-minute background sweep skips fresh responses rather than downloading
  the complete plan again. Normal page responses are fresh for two minutes;
  profile responses remain fresh for five minutes.
- Loaded page data stays in the bounded session-scoped memory cache until
  invalidation, denial, logout or account changes. Expired network freshness
  triggers quiet revalidation without discarding displayed data.
- Web pages additionally save a bounded, tab-scoped `sessionStorage` snapshot
  for up to 30 minutes. Ctrl+R restores it only after `/session` verifies the
  account and role. It is bound to the exact login and API backend by a digest;
  no authentication token is stored in this cache. Matching snapshots are
  displayed before background page requests complete.
- Tab snapshots are compressed per payload and reuse compressed output for
  unchanged objects. The raw-page cache and its matching unfiltered query
  snapshot are stored once, then both cache keys are restored. Large report
  pages must not be dropped solely because their uncompressed JSON exceeds the
  browser cache's encoded-size budget. Scope hashing also works on plain HTTP
  origins; it does not depend on secure-context Web Crypto.
- Cached JSON is parsed once and shared with page snapshots, avoiding repeated
  parsing of large cached responses on navigation.
- Known mutations invalidate their dependent endpoints and filter variants, not
  every page. Unknown writes keep conservative full invalidation. Notification
  broadcasts only invalidate notifications. Writes do not start a new preload
  storm.
- User pull-to-refresh and retained-query reloads force the current screen's
  requests. They do not trigger a full-system reload.
- Dataset/model pages consume matching paginated snapshots. Supporting-model
  pages refresh sequentially, verifying a consistent pool generation. Training
  polls quickly only during active jobs; both panels stop polling off-screen.
- Super Admin Dashboard no longer fetches analytics that it does not display.

## Guarantees and limits

Account-status probes remain uncached and independent of the warmer. Real-time
disabled-account detection, server authorization, logout cancellation, account
isolation, filter isolation and forecast date/expiry checks remain in place.

A first visit can still wait if that page has not finished warming. Cache misses,
new filters, expired tab snapshots, failed requests and changed data may also require
a request. Background preparation cannot guarantee every page is ready instantly
on a slow/offline connection. On web, approved page data (including reports) is
temporarily stored in the current browser tab; native caches remain memory-only.
Logout, credential changes in another tab, access denial and invalidations clear
the corresponding saved data. Forecast expiry/date checks are still enforced.
Unavailable browser storage falls back to memory-only operation.

Ctrl+R still reloads the application and briefly verifies the session. It cannot
skip that authorization check, restore a never-loaded filter, or preserve map
tiles/DOM state. Restored snapshots are display data, not cached authorization
or fresh network responses. Background APIs may return complete snapshots;
unchanged data keeps its object references instead of rebuilding page contents.

This change addresses request bursts, repeat downloads and repeat parsing. It
does **not** cap or truncate report results: the report/dashboard endpoints still
return complete result sets. Server-side report pagination and separate map/group
aggregation APIs remain further work for reducing individual large responses
without losing map coverage, validation groups or accurate totals.

## Verification

```powershell
node --test tests/clients/browserPageCache.test.mjs tests/clients/backgroundNavigation.test.mjs tests/clients/sessionLoading.test.mjs tests/clients/sessionData.test.mjs tests/clients/userLogout.test.mjs
```

In browser Network tools, sign in and let the warmer finish. Navigate between
already-warm default pages: they should render cached content without a blocking
skeleton or another identical fresh-data download. Confirm background requests
are staggered, explicit refresh fetches current-page data, and notification reads
do not cause unrelated dashboards/analytics to reload. Test under network
throttling, in a hidden tab, and after logout/account switching as well.
