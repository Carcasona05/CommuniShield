-- public.notification_types: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."notification_types" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "created_at" timestamp with time zone default now() not null
);

alter table public."notification_types" add constraint "notification_types_created_at_not_null" NOT NULL created_at;

alter table public."notification_types" add constraint "notification_types_id_not_null" NOT NULL id;

alter table public."notification_types" add constraint "notification_types_name_check" CHECK ((name = ANY (ARRAY['report_status'::text, 'nearby_incident'::text, 'admin_account'::text, 'report_submitted'::text, 'ai_validation'::text, 'report_approved'::text, 'system'::text, 'log'::text])));

alter table public."notification_types" add constraint "notification_types_name_key" UNIQUE (name);

alter table public."notification_types" add constraint "notification_types_name_not_null" NOT NULL name;

alter table public."notification_types" add constraint "notification_types_pkey" PRIMARY KEY (id);

revoke all on table public."notification_types" from public, anon, authenticated, service_role;

grant DELETE on table public."notification_types" to "anon";

grant INSERT on table public."notification_types" to "anon";

grant SELECT on table public."notification_types" to "anon";

grant UPDATE on table public."notification_types" to "anon";

grant DELETE on table public."notification_types" to "authenticated";

grant INSERT on table public."notification_types" to "authenticated";

grant SELECT on table public."notification_types" to "authenticated";

grant UPDATE on table public."notification_types" to "authenticated";

grant DELETE on table public."notification_types" to "service_role";

grant INSERT on table public."notification_types" to "service_role";

grant MAINTAIN on table public."notification_types" to "service_role";

grant REFERENCES on table public."notification_types" to "service_role";

grant SELECT on table public."notification_types" to "service_role";

grant TRIGGER on table public."notification_types" to "service_role";

grant TRUNCATE on table public."notification_types" to "service_role";

grant UPDATE on table public."notification_types" to "service_role";
