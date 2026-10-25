-- public.system_settings: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."system_settings" (
  "key" text not null,
  "value" text default ''::text not null,
  "updated_at" timestamp with time zone default now() not null
);

alter table public."system_settings" add constraint "system_settings_key_not_null" NOT NULL key;

alter table public."system_settings" add constraint "system_settings_pkey" PRIMARY KEY (key);

alter table public."system_settings" add constraint "system_settings_updated_at_not_null" NOT NULL updated_at;

alter table public."system_settings" add constraint "system_settings_value_not_null" NOT NULL value;

alter table public."system_settings" enable row level security;

revoke all on table public."system_settings" from public, anon, authenticated, service_role;

grant DELETE on table public."system_settings" to "anon";

grant INSERT on table public."system_settings" to "anon";

grant SELECT on table public."system_settings" to "anon";

grant UPDATE on table public."system_settings" to "anon";

grant DELETE on table public."system_settings" to "authenticated";

grant INSERT on table public."system_settings" to "authenticated";

grant SELECT on table public."system_settings" to "authenticated";

grant UPDATE on table public."system_settings" to "authenticated";

grant DELETE on table public."system_settings" to "service_role";

grant INSERT on table public."system_settings" to "service_role";

grant MAINTAIN on table public."system_settings" to "service_role";

grant REFERENCES on table public."system_settings" to "service_role";

grant SELECT on table public."system_settings" to "service_role";

grant TRIGGER on table public."system_settings" to "service_role";

grant TRUNCATE on table public."system_settings" to "service_role";

grant UPDATE on table public."system_settings" to "service_role";
