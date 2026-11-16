-- public.sentiment_model_state: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."sentiment_model_state" (
  "id" integer not null,
  "generation" bigint default 0 not null,
  "data_revision" bigint default 0 not null,
  "active_job_id" uuid,
  "previous_job_id" uuid,
  "updated_at" timestamp with time zone default now() not null
);

alter table public."sentiment_model_state" add constraint "sentiment_model_state_id_check" CHECK ((id = 1));

alter table public."sentiment_model_state" add constraint "sentiment_model_state_pkey" PRIMARY KEY (id);

alter table public."sentiment_model_state" enable row level security;

revoke all on table public."sentiment_model_state" from public, anon, authenticated, service_role;

grant DELETE on table public."sentiment_model_state" to "service_role";

grant INSERT on table public."sentiment_model_state" to "service_role";

grant REFERENCES on table public."sentiment_model_state" to "service_role";

grant SELECT on table public."sentiment_model_state" to "service_role";

grant TRIGGER on table public."sentiment_model_state" to "service_role";

grant TRUNCATE on table public."sentiment_model_state" to "service_role";

grant UPDATE on table public."sentiment_model_state" to "service_role";
