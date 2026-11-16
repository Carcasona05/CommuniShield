-- public.sentiment_training_events: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."sentiment_training_events" (
  "id" uuid default gen_random_uuid() not null,
  "job_id" uuid,
  "actor_id" uuid,
  "action" text not null,
  "details" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null
);

alter table public."sentiment_training_events" add constraint "sentiment_training_events_pkey" PRIMARY KEY (id);

alter table public."sentiment_training_events" enable row level security;

revoke all on table public."sentiment_training_events" from public, anon, authenticated, service_role;

grant DELETE on table public."sentiment_training_events" to "service_role";

grant INSERT on table public."sentiment_training_events" to "service_role";

grant REFERENCES on table public."sentiment_training_events" to "service_role";

grant SELECT on table public."sentiment_training_events" to "service_role";

grant TRIGGER on table public."sentiment_training_events" to "service_role";

grant TRUNCATE on table public."sentiment_training_events" to "service_role";

grant UPDATE on table public."sentiment_training_events" to "service_role";
