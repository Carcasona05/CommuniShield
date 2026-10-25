-- public.app_settings: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."app_settings" (
  "id" uuid default gen_random_uuid() not null,
  "ai_credibility_enabled" boolean default true not null,
  "high_credibility_threshold" smallint default 90 not null,
  "medium_credibility_threshold" smallint default 60 not null,
  "updated_at" timestamp with time zone default now() not null
);

alter table public."app_settings" add constraint "app_settings_ai_credibility_enabled_not_null" NOT NULL ai_credibility_enabled;

alter table public."app_settings" add constraint "app_settings_high_credibility_threshold_check" CHECK (((high_credibility_threshold >= 0) AND (high_credibility_threshold <= 100)));

alter table public."app_settings" add constraint "app_settings_high_credibility_threshold_not_null" NOT NULL high_credibility_threshold;

alter table public."app_settings" add constraint "app_settings_id_not_null" NOT NULL id;

alter table public."app_settings" add constraint "app_settings_medium_credibility_threshold_check" CHECK (((medium_credibility_threshold >= 0) AND (medium_credibility_threshold <= 100)));

alter table public."app_settings" add constraint "app_settings_medium_credibility_threshold_not_null" NOT NULL medium_credibility_threshold;

alter table public."app_settings" add constraint "app_settings_pkey" PRIMARY KEY (id);

alter table public."app_settings" add constraint "app_settings_updated_at_not_null" NOT NULL updated_at;

alter table public."app_settings" enable row level security;

revoke all on table public."app_settings" from public, anon, authenticated, service_role;

grant DELETE on table public."app_settings" to "anon";

grant INSERT on table public."app_settings" to "anon";

grant SELECT on table public."app_settings" to "anon";

grant UPDATE on table public."app_settings" to "anon";

grant DELETE on table public."app_settings" to "authenticated";

grant INSERT on table public."app_settings" to "authenticated";

grant SELECT on table public."app_settings" to "authenticated";

grant UPDATE on table public."app_settings" to "authenticated";

grant DELETE on table public."app_settings" to "service_role";

grant INSERT on table public."app_settings" to "service_role";

grant MAINTAIN on table public."app_settings" to "service_role";

grant REFERENCES on table public."app_settings" to "service_role";

grant SELECT on table public."app_settings" to "service_role";

grant TRIGGER on table public."app_settings" to "service_role";

grant TRUNCATE on table public."app_settings" to "service_role";

grant UPDATE on table public."app_settings" to "service_role";
