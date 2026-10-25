-- public.login_activities: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."login_activities" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "device" text not null,
  "location" text,
  "is_current" boolean default false not null,
  "created_at" timestamp with time zone default now() not null
);

alter table public."login_activities" add constraint "login_activities_created_at_not_null" NOT NULL created_at;

alter table public."login_activities" add constraint "login_activities_device_not_null" NOT NULL device;

alter table public."login_activities" add constraint "login_activities_id_not_null" NOT NULL id;

alter table public."login_activities" add constraint "login_activities_is_current_not_null" NOT NULL is_current;

alter table public."login_activities" add constraint "login_activities_pkey" PRIMARY KEY (id);

alter table public."login_activities" add constraint "login_activities_user_id_not_null" NOT NULL user_id;

CREATE INDEX login_activities_user ON public.login_activities USING btree (user_id);

CREATE INDEX login_activities_user_current ON public.login_activities USING btree (user_id, is_current);

alter table public."login_activities" enable row level security;

revoke all on table public."login_activities" from public, anon, authenticated, service_role;

grant DELETE on table public."login_activities" to "anon";

grant INSERT on table public."login_activities" to "anon";

grant SELECT on table public."login_activities" to "anon";

grant UPDATE on table public."login_activities" to "anon";

grant DELETE on table public."login_activities" to "authenticated";

grant INSERT on table public."login_activities" to "authenticated";

grant SELECT on table public."login_activities" to "authenticated";

grant UPDATE on table public."login_activities" to "authenticated";

grant DELETE on table public."login_activities" to "service_role";

grant INSERT on table public."login_activities" to "service_role";

grant MAINTAIN on table public."login_activities" to "service_role";

grant REFERENCES on table public."login_activities" to "service_role";

grant SELECT on table public."login_activities" to "service_role";

grant TRIGGER on table public."login_activities" to "service_role";

grant TRUNCATE on table public."login_activities" to "service_role";

grant UPDATE on table public."login_activities" to "service_role";
