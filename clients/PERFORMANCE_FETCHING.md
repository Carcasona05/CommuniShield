# Page loading and background warming

## What changed

- Visible pages make their normal requests first. Optional prefetching yields for
  750 ms before each request and waits while foreground API work is active.
- Only one optional prefetch request runs at once. The worker pauses when the app
  is hidden/backgrounded and stops on logout/account changes.
- The one-minute background sweep skips fresh responses rather than downloading
  the complete plan again. Normal page responses are fresh for two minutes;
  profile responses remain fresh for five minutes.
- Page data stays in the existing session-scoped memory cache for up to five
  minutes. Warm pages render from that cache; expired freshness triggers quiet
  revalidation without intentionally discarding the displayed data.
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
new filters, expired retention, failed requests and changed data may also require
a request. Background preparation cannot guarantee every page is ready instantly
on a slow/offline connection. No sensitive page data is persisted to disk.

This change addresses request bursts, repeat downloads and repeat parsing. It
does **not** cap or truncate report results: the report/dashboard endpoints still
return complete result sets. Server-side report pagination and separate map/group
aggregation APIs remain further work for reducing individual large responses
without losing map coverage, validation groups or accurate totals.

## Verification

```powershell
node --test tests/clients/backgroundNavigation.test.mjs tests/clients/sessionLoading.test.mjs tests/clients/sessionData.test.mjs tests/clients/profileRequests.test.mjs tests/clients/accountStatusRealtime.test.mjs
```

In browser Network tools, sign in and let the warmer finish. Navigate between
already-warm default pages: they should render cached content without a blocking
skeleton or another identical fresh-data download. Confirm background requests
are staggered, explicit refresh fetches current-page data, and notification reads
do not cause unrelated dashboards/analytics to reload. Test under network
throttling, in a hidden tab, and after logout/account switching as well.
