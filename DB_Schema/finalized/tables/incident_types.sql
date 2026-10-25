-- public.incident_types: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."incident_types" (
  "id" uuid default gen_random_uuid() not null,
  "category_id" uuid not null,
  "name" text not null
);

alter table public."incident_types" add constraint "incident_types_category_id_name_key" UNIQUE (category_id, name);

alter table public."incident_types" add constraint "incident_types_category_id_not_null" NOT NULL category_id;

alter table public."incident_types" add constraint "incident_types_id_not_null" NOT NULL id;

alter table public."incident_types" add constraint "incident_types_name_not_null" NOT NULL name;

alter table public."incident_types" add constraint "incident_types_pkey" PRIMARY KEY (id);

revoke all on table public."incident_types" from public, anon, authenticated, service_role;

grant DELETE on table public."incident_types" to "anon";

grant INSERT on table public."incident_types" to "anon";

grant SELECT on table public."incident_types" to "anon";

grant UPDATE on table public."incident_types" to "anon";

grant DELETE on table public."incident_types" to "authenticated";

grant INSERT on table public."incident_types" to "authenticated";

grant SELECT on table public."incident_types" to "authenticated";

grant UPDATE on table public."incident_types" to "authenticated";

grant DELETE on table public."incident_types" to "service_role";

grant INSERT on table public."incident_types" to "service_role";

grant MAINTAIN on table public."incident_types" to "service_role";

grant REFERENCES on table public."incident_types" to "service_role";

grant SELECT on table public."incident_types" to "service_role";

grant TRIGGER on table public."incident_types" to "service_role";

grant TRUNCATE on table public."incident_types" to "service_role";

grant UPDATE on table public."incident_types" to "service_role";
