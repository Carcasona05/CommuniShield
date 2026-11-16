-- public.admin_analysis_jobs: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."admin_analysis_jobs" (
  "id" uuid default gen_random_uuid() not null,
  "kind" text not null,
  "subject_id" uuid not null,
  "report_id" uuid not null,
  "payload" jsonb default '{}'::jsonb not null,
  "state" text default 'queued'::text not null,
  "attempts" integer default 0 not null,
  "available_at" timestamp with time zone default now() not null,
  "lease_token" uuid,
  "lease_until" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

alter table public."admin_analysis_jobs" add constraint "admin_analysis_jobs_kind_check" CHECK ((kind = ANY (ARRAY['credibility'::text, 'report_sentiment'::text, 'comment_sentiment'::text, 'status_followup'::text])));

alter table public."admin_analysis_jobs" add constraint "admin_analysis_jobs_pkey" PRIMARY KEY (id);

alter table public."admin_analysis_jobs" add constraint "admin_analysis_jobs_state_check" CHECK ((state = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'skipped'::text])));

CREATE UNIQUE INDEX admin_analysis_active_idx ON public.admin_analysis_jobs USING btree (kind, subject_id) WHERE ((state = ANY (ARRAY['queued'::text, 'running'::text])) AND (kind <> 'status_followup'::text));

CREATE INDEX admin_analysis_ready_idx ON public.admin_analysis_jobs USING btree (available_at, created_at) WHERE (state = ANY (ARRAY['queued'::text, 'running'::text]));

CREATE INDEX admin_analysis_report_idx ON public.admin_analysis_jobs USING btree (report_id, created_at DESC);

alter table public."admin_analysis_jobs" enable row level security;

revoke all on table public."admin_analysis_jobs" from public, anon, authenticated, service_role;

grant DELETE on table public."admin_analysis_jobs" to "service_role";

grant INSERT on table public."admin_analysis_jobs" to "service_role";

grant REFERENCES on table public."admin_analysis_jobs" to "service_role";

grant SELECT on table public."admin_analysis_jobs" to "service_role";

grant TRIGGER on table public."admin_analysis_jobs" to "service_role";

grant TRUNCATE on table public."admin_analysis_jobs" to "service_role";

grant UPDATE on table public."admin_analysis_jobs" to "service_role";
