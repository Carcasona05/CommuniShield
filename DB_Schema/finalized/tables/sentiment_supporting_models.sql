-- public.sentiment_supporting_models: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."sentiment_supporting_models" (
  "id" uuid not null,
  "name" text not null,
  "status" text default 'disabled'::text not null,
  "artifact_manifest" jsonb not null,
  "routing_policy" jsonb default '{}'::jsonb not null,
  "metrics" jsonb not null,
  "datasets" jsonb default '[]'::jsonb not null,
  "use_count" bigint default 0 not null,
  "last_used_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "deleted_at" timestamp with time zone
);

alter table public."sentiment_supporting_models" add constraint "sentiment_supporting_models_pkey" PRIMARY KEY (id);

alter table public."sentiment_supporting_models" add constraint "sentiment_supporting_models_status_check" CHECK ((status = ANY (ARRAY['disabled'::text, 'enabled'::text, 'archived'::text, 'deleted'::text])));

alter table public."sentiment_supporting_models" enable row level security;

revoke all on table public."sentiment_supporting_models" from public, anon, authenticated, service_role;

grant DELETE on table public."sentiment_supporting_models" to "service_role";

grant INSERT on table public."sentiment_supporting_models" to "service_role";

grant REFERENCES on table public."sentiment_supporting_models" to "service_role";

grant SELECT on table public."sentiment_supporting_models" to "service_role";

grant TRIGGER on table public."sentiment_supporting_models" to "service_role";

grant TRUNCATE on table public."sentiment_supporting_models" to "service_role";

grant UPDATE on table public."sentiment_supporting_models" to "service_role";
