-- public.admin_analysis_batches: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."admin_analysis_batches" (
  "id" uuid default gen_random_uuid() not null,
  "actor_id" uuid not null,
  "report_ids" uuid[] not null,
  "created_at" timestamp with time zone default now() not null
);

alter table public."admin_analysis_batches" add constraint "admin_analysis_batches_pkey" PRIMARY KEY (id);

CREATE INDEX admin_analysis_batch_actor_idx ON public.admin_analysis_batches USING btree (actor_id, created_at DESC);

alter table public."admin_analysis_batches" enable row level security;

revoke all on table public."admin_analysis_batches" from public, anon, authenticated, service_role;

grant DELETE on table public."admin_analysis_batches" to "service_role";

grant INSERT on table public."admin_analysis_batches" to "service_role";

grant REFERENCES on table public."admin_analysis_batches" to "service_role";

grant SELECT on table public."admin_analysis_batches" to "service_role";

grant TRIGGER on table public."admin_analysis_batches" to "service_role";

grant TRUNCATE on table public."admin_analysis_batches" to "service_role";

grant UPDATE on table public."admin_analysis_batches" to "service_role";
