# Paginated feeds and asynchronous comments

## Deployment order

1. Back up the database and run `feed_pagination_comment_jobs.sql` in Supabase's
   SQL editor (database owner). It is additive and repeatable. It adds indexes,
   service-role-only pagination/count functions, and a comment-analysis queue.
   It does not delete or rewrite existing reports/comments.
2. Deploy the server, then the client. The feed response adds `total`,
   `statusCounts`, `hasMore`, `nextCursor`, and mixed-feed `order`. Comment pages
   return the newest ten comments in chronological display order, plus their
   complete thread count. The page lookahead reads at most eleven rows.
3. On **Render/long-running Node**, use `npm run dev`/the existing `app.ts`
   entrypoint: it recovers queued work at startup and every 15 seconds.
4. On **Vercel/serverless**, set a strong `CRON_SECRET` and configure a scheduler
   to call `GET /api/jobs/comment-sentiment` every minute with
   `Authorization: Bearer <CRON_SECRET>`. Use Vercel Cron on a plan that supports
   that frequency or an external scheduler. Ordinary requests cannot invoke it.
   Each submission also starts lifecycle-tracked processing immediately, but
   the scheduled recovery call is required for reliable retries after failures.
   Configure the function duration to fit the model runtime/batch size; monitor
   queue age and reduce the recovery batch size if your plan's limit is short.

The AFTER INSERT trigger creates the job in the same transaction as the comment,
so a saved comment cannot lose its job between saving and enqueueing. Workers
claim jobs with `FOR UPDATE SKIP LOCKED`, a ten-minute lease and a unique token.
Failed/unavailable analysis retries indefinitely with capped exponential backoff
(up to one hour). Expired leases recover after a crashed process. Deleted
comments remove their jobs by cascade. Existing pre-migration comments are not
automatically reanalyzed.

## API behavior

- `/reports?period=24h|7d&status=...&source=All|User|Admin&cursor=...` returns
  **ten combined feed items**, not ten of each source. Filters execute before
  pagination. Lightweight nearby-safety metadata is returned separately on the
  first page and is not truncated to the visible feed or its status/source filter.
- `/reports/mine?status=...&cursor=...` derives ownership solely from server
  authentication. Status counts cover every non-archived report belonging to
  that account, independently of the selected status/page.
- `/reports/:id/comments?cursor=...` returns at most ten actual comments plus
  `total`, `hasMore`, `nextCursor`. The cursor preserves database microseconds
  and uses the UUID as a deterministic tie-breaker.
- POST `/reports/:id/comments` retains authentication, complete-profile and
  credibility checks. After persistence it returns the saved `comment`, `total`
  (or null if the optional count failed), and `sentiment_status: pending` without
  waiting for the model. A failed write is never acknowledged as successful.
- `/reports/:id/comment-status?ids=<up to ten UUIDs>` refreshes only sentiment
  metadata for comments in that thread. The client polls pending loaded items
  while focused/visible, without refetching comment text or the whole thread.

Cursor pages are live, not a frozen snapshot. New posts/comments appear after
refresh; new rows cannot shift an older cursor page as they do with offsets.
Totals reflect the database at query time, not a promise of realtime consistency
between independent requests. Refresh revalidates already-loaded feed pages.

## Verification

```powershell
node --test tests/clients/feedPagination.test.mjs
cd server
node --import tsx --test src/FeedPagination.test.ts src/ReportFeed.test.ts src/ReportSubmission.test.ts
```

For actual PostgreSQL semantics without production credentials, install
`@electric-sql/pglite` in a disposable directory and set `PGLITE_MODULE` to its
`dist/index.js` file URL, then run
`node --test tests/database/feedPagination.postgres.mjs` from the repository root.

Monitor retries with:

```sql
select count(*) as unfinished, min(available_at) as earliest_due,
       max(attempts) as most_attempts
from public.comment_sentiment_jobs where completed_at is null;
```

Benchmark real-device first-load and submit latency before/after deployment;
local unit timings do not measure network or production inference performance.
