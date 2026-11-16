-- public.incident_types: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."incident_types" (
  "id" uuid default gen_random_uuid() not null,
  "category_id" uuid not null,
  "name" text not null
);

alter table public."incident_types" add constraint "incident_types_category_id_name_key" UNIQUE (category_id, name);

alter table public."incident_types" add constraint "incident_types_pkey" PRIMARY KEY (id);

revoke all on table public."incident_types" from public, anon, authenticated, service_role;

grant SELECT on table public."incident_types" to "anon";

grant SELECT on table public."incident_types" to "authenticated";

grant DELETE on table public."incident_types" to "service_role";

grant INSERT on table public."incident_types" to "service_role";

grant REFERENCES on table public."incident_types" to "service_role";

grant SELECT on table public."incident_types" to "service_role";

grant TRIGGER on table public."incident_types" to "service_role";

grant TRUNCATE on table public."incident_types" to "service_role";

grant UPDATE on table public."incident_types" to "service_role";
