# Admin fetching update

## Integrated changes

- Admin and Super Admin dashboards use `/admin/overview`: exact database counts and at most 12 recent report rows. Super Admin management counts and five recent logs are included only after the server verifies that role. Dashboard charts no longer download account lists or complete report threads.
- Incident maps and the dashboard map use `/admin/map-reports`. It contains only location/filter/marker metadata, not narratives, images, comments or sentiment threads. Complete geographic counts are retained; map points are not arbitrarily truncated to the first database page.
- Validation uses `/admin/validation-groups` and returns ten **whole groups** per page. Summaries describe all matching reports, not just the visible page. Both roles share `ValidationPage.jsx`. Notification links can open a report outside the current page.
- `/admin/report-details?ids=...` hydrates selected reports only. Requests are deduplicated, cached in the signed-in session, batched at 50 IDs, and made sequentially for large compiled groups. Detail batches stop after account changes. Busy threads/images are explicitly paginated so database response caps do not silently hide evidence.
- Risk/hotspot endpoints calculate sentiment evidence on the server but send lightweight report metadata rather than every thread/narrative. They retain the existing clustering rules, report-count semantics and severity weighting.
- Heatmaps retain their heat canvas and SVG markers, update only changed groups, and skip identical payloads. The original pin colors, sizes, shadows and hover outline are preserved. Pins use a dedicated pane above the non-interactive heat canvas. Background refresh does not repeatedly fly the viewport back to its initial location. Leaflet.heat's existing zoom-based aggregation remains unchanged.
- Idle prefetching warms only overview/profile/options/notifications/settings, not complete datasets, training screens or hidden analytics. Existing focus-aware refresh, session-scoped caching, bounded retries and write invalidation remain active.
- CSV export explicitly loads **all matching groups** with narratives, rather than exporting only the current page. Export requests use `cacheMode: "no-store"` so a large export cannot replace a normal page snapshot.

## Rollout

1. Apply `DB_Schema/migrations/admin_fetch_performance.sql` in Supabase. It adds indexes only, without changing data, grants or RLS. Schedule index creation during a quiet period on a large live database because ordinary index creation can block writes while building.
2. Deploy the **backend first**, including the new routes, and then deploy/rebuild the frontend. Old clients can continue using the legacy endpoints during rollout.
3. Sign in with each role and verify dashboard counts, validation filters and pagination, an off-page notification, group actions, CSV exports, map selection, and risk/hotspot evidence.

No migration or production deployment is performed by the code changes themselves.

## Verification and timing

Run `npm run test:admin-fetch` in both `clients/` and `server/`. Build the web client with `npm run build:web`.

`server/tests/adminFetching.browser.mjs` tests both roles against an exported web build, using mocked API/map responses, pagination, lazy inspection, notification targets, and complete CSV downloads. Set `WEB_EXPORT_DIR`, `PLAYWRIGHT_MODULE` (if Playwright is installed outside the repo) and `CHROME_PATH` before running it with Node. Browser fixtures test integration, not production latency or real tile rendering.

`server/tests/heatmapPins.browser.mjs` separately uses real Leaflet and the pinned production heat plugin to verify all five pin styles, shadows, hover outlines, hit targets, popups, and marker/canvas reuse at desktop and mobile widths. It supplies blank tiles to avoid dependence on a tile server. Set `PLAYWRIGHT_MODULE` and `CHROME_PATH`; optionally set `LEAFLET_HEAT_PATH` to an existing copy of `leaflet-heat.js` to run without downloading the plugin from its production CDN.

The overview, map and validation-group endpoints return `Server-Timing: admin-data;dur=...`. In browser DevTools, compare response duration and transferred bytes for cold login, repeat navigation, filter changes, and map inspection. Check tile/CDN requests separately from API timings. Use the same account/data/filter/device/network for before-and-after measurements; no production speedup percentage is claimed without those measurements.

## Deliberate limits

- Validation compilation runs over complete **compact server-side metadata** before paginating whole groups; it does not pretend that paginating individual reports would preserve compilation semantics. Up to 50,000 eligible reports are supported per complete snapshot, with explicit errors rather than partial totals above that limit or on incomplete reads. For substantially larger deployments, move compilation/aggregation into a database materialized read model.
- No cross-user/global payload cache was introduced. Existing per-session freshness and mutation invalidation avoid serving another account's data or indefinitely stale counts.
- Record Management's combined incident/announcement/blotter/activity workflow and existing audit/account-management list APIs remain compatible; they have not been rewritten into a new unified pagination model in this release.
- Map libraries and OpenStreetMap tiles still use their existing providers. No bulk tile prefetching/offline caching or changed tile-provider policy is introduced.
- Existing unrelated full-suite/type-check failures are not hidden or bypassed by these focused checks.
