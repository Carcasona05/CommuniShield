-- public.emergency_facilities: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."emergency_facilities" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "type" text not null,
  "latitude" double precision not null,
  "longitude" double precision not null,
  "address" text default ''::text not null,
  "phone" text default ''::text not null,
  "created_at" timestamp with time zone default now() not null
);

alter table public."emergency_facilities" add constraint "emergency_facilities_name_key" UNIQUE (name);

alter table public."emergency_facilities" add constraint "emergency_facilities_pkey" PRIMARY KEY (id);

alter table public."emergency_facilities" add constraint "emergency_facilities_type_check" CHECK ((type = ANY (ARRAY['police'::text, 'fire'::text])));

alter table public."emergency_facilities" enable row level security;

revoke all on table public."emergency_facilities" from public, anon, authenticated, service_role;

grant SELECT on table public."emergency_facilities" to "anon";

grant SELECT on table public."emergency_facilities" to "authenticated";

grant DELETE on table public."emergency_facilities" to "service_role";

grant INSERT on table public."emergency_facilities" to "service_role";

grant REFERENCES on table public."emergency_facilities" to "service_role";

grant SELECT on table public."emergency_facilities" to "service_role";

grant TRIGGER on table public."emergency_facilities" to "service_role";

grant TRUNCATE on table public."emergency_facilities" to "service_role";

grant UPDATE on table public."emergency_facilities" to "service_role";
