-- public.profiles: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."profiles" (
  "id" uuid not null,
  "first_name" text,
  "middle_name" text,
  "last_name" text,
  "fullname" text,
  "user_name" text,
  "role" text default 'user'::text not null,
  "phone" text,
  "birthdate" date,
  "location" text,
  "department" text,
  "notifications_enabled" boolean default true not null,
  "crime_alerts_enabled" boolean default true not null,
  "status" text default 'Active'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

alter table public."profiles" add constraint "profiles_created_at_not_null" NOT NULL created_at;

alter table public."profiles" add constraint "profiles_crime_alerts_enabled_not_null" NOT NULL crime_alerts_enabled;

alter table public."profiles" add constraint "profiles_id_not_null" NOT NULL id;

alter table public."profiles" add constraint "profiles_notifications_enabled_not_null" NOT NULL notifications_enabled;

alter table public."profiles" add constraint "profiles_pkey" PRIMARY KEY (id);

alter table public."profiles" add constraint "profiles_role_check" CHECK ((role = ANY (ARRAY['user'::text, 'admin'::text, 'super_admin'::text])));

alter table public."profiles" add constraint "profiles_role_not_null" NOT NULL role;

alter table public."profiles" add constraint "profiles_status_check" CHECK ((status = ANY (ARRAY['Active'::text, 'Disabled'::text])));

alter table public."profiles" add constraint "profiles_status_not_null" NOT NULL status;

alter table public."profiles" add constraint "profiles_updated_at_not_null" NOT NULL updated_at;

alter table public."profiles" enable row level security;

revoke all on table public."profiles" from public, anon, authenticated, service_role;

grant DELETE on table public."profiles" to "anon";

grant INSERT on table public."profiles" to "anon";

grant SELECT on table public."profiles" to "anon";

grant UPDATE on table public."profiles" to "anon";

grant DELETE on table public."profiles" to "authenticated";

grant INSERT on table public."profiles" to "authenticated";

grant SELECT on table public."profiles" to "authenticated";

grant UPDATE on table public."profiles" to "authenticated";

grant DELETE on table public."profiles" to "service_role";

grant INSERT on table public."profiles" to "service_role";

grant MAINTAIN on table public."profiles" to "service_role";

grant REFERENCES on table public."profiles" to "service_role";

grant SELECT on table public."profiles" to "service_role";

grant TRIGGER on table public."profiles" to "service_role";

grant TRUNCATE on table public."profiles" to "service_role";

grant UPDATE on table public."profiles" to "service_role";
