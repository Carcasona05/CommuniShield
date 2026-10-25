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

alter table public."sentiment_supporting_models" add constraint "sentiment_supporting_models_artifact_manifest_not_null" NOT NULL artifact_manifest;

alter table public."sentiment_supporting_models" add constraint "sentiment_supporting_models_created_at_not_null" NOT NULL created_at;

alter table public."sentiment_supporting_models" add constraint "sentiment_supporting_models_datasets_not_null" NOT NULL datasets;

alter table public."sentiment_supporting_models" add constraint "sentiment_supporting_models_id_not_null" NOT NULL id;

alter table public."sentiment_supporting_models" add constraint "sentiment_supporting_models_metrics_not_null" NOT NULL metrics;

alter table public."sentiment_supporting_models" add constraint "sentiment_supporting_models_name_not_null" NOT NULL name;

alter table public."sentiment_supporting_models" add constraint "sentiment_supporting_models_pkey" PRIMARY KEY (id);

alter table public."sentiment_supporting_models" add constraint "sentiment_supporting_models_routing_policy_not_null" NOT NULL routing_policy;

alter table public."sentiment_supporting_models" add constraint "sentiment_supporting_models_status_check" CHECK ((status = ANY (ARRAY['disabled'::text, 'enabled'::text, 'archived'::text, 'deleted'::text])));

alter table public."sentiment_supporting_models" add constraint "sentiment_supporting_models_status_not_null" NOT NULL status;

alter table public."sentiment_supporting_models" add constraint "sentiment_supporting_models_updated_at_not_null" NOT NULL updated_at;

alter table public."sentiment_supporting_models" add constraint "sentiment_supporting_models_use_count_not_null" NOT NULL use_count;

alter table public."sentiment_supporting_models" enable row level security;

revoke all on table public."sentiment_supporting_models" from public, anon, authenticated, service_role;

grant DELETE on table public."sentiment_supporting_models" to "service_role";

grant INSERT on table public."sentiment_supporting_models" to "service_role";

grant MAINTAIN on table public."sentiment_supporting_models" to "service_role";

grant REFERENCES on table public."sentiment_supporting_models" to "service_role";

grant SELECT on table public."sentiment_supporting_models" to "service_role";

grant TRIGGER on table public."sentiment_supporting_models" to "service_role";

grant TRUNCATE on table public."sentiment_supporting_models" to "service_role";

grant UPDATE on table public."sentiment_supporting_models" to "service_role";
