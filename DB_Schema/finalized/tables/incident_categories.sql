-- public.incident_categories: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."incident_categories" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "created_at" timestamp with time zone default now() not null
);

alter table public."incident_categories" add constraint "incident_categories_name_key" UNIQUE (name);

alter table public."incident_categories" add constraint "incident_categories_pkey" PRIMARY KEY (id);

revoke all on table public."incident_categories" from public, anon, authenticated, service_role;

grant SELECT on table public."incident_categories" to "anon";

grant SELECT on table public."incident_categories" to "authenticated";

grant DELETE on table public."incident_categories" to "service_role";

grant INSERT on table public."incident_categories" to "service_role";

grant REFERENCES on table public."incident_categories" to "service_role";

grant SELECT on table public."incident_categories" to "service_role";

grant TRIGGER on table public."incident_categories" to "service_role";

grant TRUNCATE on table public."incident_categories" to "service_role";

grant UPDATE on table public."incident_categories" to "service_role";
