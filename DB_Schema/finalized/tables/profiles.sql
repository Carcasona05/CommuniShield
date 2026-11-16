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

alter table public."profiles" add constraint "profiles_pkey" PRIMARY KEY (id);

alter table public."profiles" add constraint "profiles_role_check" CHECK ((role = ANY (ARRAY['user'::text, 'admin'::text, 'super_admin'::text])));

alter table public."profiles" add constraint "profiles_status_check" CHECK ((status = ANY (ARRAY['Active'::text, 'Disabled'::text])));

CREATE INDEX profiles_role_status_idx ON public.profiles USING btree (role, status);

alter table public."profiles" enable row level security;

revoke all on table public."profiles" from public, anon, authenticated, service_role;

grant DELETE on table public."profiles" to "authenticated";

grant INSERT on table public."profiles" to "authenticated";

grant SELECT on table public."profiles" to "authenticated";

grant UPDATE on table public."profiles" to "authenticated";

grant DELETE on table public."profiles" to "service_role";

grant INSERT on table public."profiles" to "service_role";

grant REFERENCES on table public."profiles" to "service_role";

grant SELECT on table public."profiles" to "service_role";

grant TRIGGER on table public."profiles" to "service_role";

grant TRUNCATE on table public."profiles" to "service_role";

grant UPDATE on table public."profiles" to "service_role";
