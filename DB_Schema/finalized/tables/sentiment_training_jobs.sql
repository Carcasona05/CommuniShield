-- public.sentiment_training_jobs: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."sentiment_training_jobs" (
  "id" uuid default gen_random_uuid() not null,
  "status" text default 'queued'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "available_at" timestamp with time zone default (now() + '00:00:30'::interval) not null,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "lease_token" uuid,
  "lease_until" timestamp with time zone,
  "data_revision" bigint,
  "base_generation" bigint,
  "base_job_id" uuid,
  "snapshot" jsonb,
  "metrics" jsonb,
  "artifact_manifest" jsonb,
  "error" text,
  "training_mode" text default 'continue'::text not null,
  "training_languages" text[]
);

alter table public."sentiment_training_jobs" add constraint "sentiment_training_jobs_available_at_not_null" NOT NULL available_at;

alter table public."sentiment_training_jobs" add constraint "sentiment_training_jobs_created_at_not_null" NOT NULL created_at;

alter table public."sentiment_training_jobs" add constraint "sentiment_training_jobs_id_not_null" NOT NULL id;

alter table public."sentiment_training_jobs" add constraint "sentiment_training_jobs_pkey" PRIMARY KEY (id);

alter table public."sentiment_training_jobs" add constraint "sentiment_training_jobs_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'training'::text, 'evaluating'::text, 'ready'::text, 'failed'::text])));

alter table public."sentiment_training_jobs" add constraint "sentiment_training_jobs_status_not_null" NOT NULL status;

alter table public."sentiment_training_jobs" add constraint "sentiment_training_jobs_training_mode_check" CHECK ((training_mode = ANY (ARRAY['continue'::text, 'fresh'::text])));

alter table public."sentiment_training_jobs" add constraint "sentiment_training_jobs_training_mode_not_null" NOT NULL training_mode;

CREATE UNIQUE INDEX sentiment_one_queued_job ON public.sentiment_training_jobs USING btree ((true)) WHERE (status = 'queued'::text);

CREATE UNIQUE INDEX sentiment_one_running_job ON public.sentiment_training_jobs USING btree ((true)) WHERE (status = ANY (ARRAY['training'::text, 'evaluating'::text]));

alter table public."sentiment_training_jobs" enable row level security;

revoke all on table public."sentiment_training_jobs" from public, anon, authenticated, service_role;

grant DELETE on table public."sentiment_training_jobs" to "service_role";

grant INSERT on table public."sentiment_training_jobs" to "service_role";

grant MAINTAIN on table public."sentiment_training_jobs" to "service_role";

grant REFERENCES on table public."sentiment_training_jobs" to "service_role";

grant SELECT on table public."sentiment_training_jobs" to "service_role";

grant TRIGGER on table public."sentiment_training_jobs" to "service_role";

grant TRUNCATE on table public."sentiment_training_jobs" to "service_role";

grant UPDATE on table public."sentiment_training_jobs" to "service_role";
