-- public.comment_sentiment_jobs: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."comment_sentiment_jobs" (
  "comment_id" uuid not null,
  "attempts" integer default 0 not null,
  "available_at" timestamp with time zone default now() not null,
  "lease_token" uuid,
  "lease_until" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "last_error" text
);

alter table public."comment_sentiment_jobs" add constraint "comment_sentiment_jobs_pkey" PRIMARY KEY (comment_id);

CREATE INDEX comment_jobs_due_idx ON public.comment_sentiment_jobs USING btree (available_at) WHERE (completed_at IS NULL);

alter table public."comment_sentiment_jobs" enable row level security;

revoke all on table public."comment_sentiment_jobs" from public, anon, authenticated, service_role;

grant DELETE on table public."comment_sentiment_jobs" to "service_role";

grant INSERT on table public."comment_sentiment_jobs" to "service_role";

grant REFERENCES on table public."comment_sentiment_jobs" to "service_role";

grant SELECT on table public."comment_sentiment_jobs" to "service_role";

grant TRIGGER on table public."comment_sentiment_jobs" to "service_role";

grant TRUNCATE on table public."comment_sentiment_jobs" to "service_role";

grant UPDATE on table public."comment_sentiment_jobs" to "service_role";
