-- public.notification_nearby_incident: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."notification_nearby_incident" (
  "notification_id" uuid not null,
  "report_id" uuid,
  "distance_meters" numeric,
  "level" text default 'Moderate'::text not null
);

alter table public."notification_nearby_incident" add constraint "notification_nearby_incident_level_check" CHECK ((level = ANY (ARRAY['Low'::text, 'Moderate'::text, 'High'::text])));

alter table public."notification_nearby_incident" add constraint "notification_nearby_incident_level_not_null" NOT NULL level;

alter table public."notification_nearby_incident" add constraint "notification_nearby_incident_notification_id_not_null" NOT NULL notification_id;

alter table public."notification_nearby_incident" add constraint "notification_nearby_incident_pkey" PRIMARY KEY (notification_id);

alter table public."notification_nearby_incident" enable row level security;

revoke all on table public."notification_nearby_incident" from public, anon, authenticated, service_role;

grant DELETE on table public."notification_nearby_incident" to "anon";

grant INSERT on table public."notification_nearby_incident" to "anon";

grant SELECT on table public."notification_nearby_incident" to "anon";

grant UPDATE on table public."notification_nearby_incident" to "anon";

grant DELETE on table public."notification_nearby_incident" to "authenticated";

grant INSERT on table public."notification_nearby_incident" to "authenticated";

grant SELECT on table public."notification_nearby_incident" to "authenticated";

grant UPDATE on table public."notification_nearby_incident" to "authenticated";

grant DELETE on table public."notification_nearby_incident" to "service_role";

grant INSERT on table public."notification_nearby_incident" to "service_role";

grant MAINTAIN on table public."notification_nearby_incident" to "service_role";

grant REFERENCES on table public."notification_nearby_incident" to "service_role";

grant SELECT on table public."notification_nearby_incident" to "service_role";

grant TRIGGER on table public."notification_nearby_incident" to "service_role";

grant TRUNCATE on table public."notification_nearby_incident" to "service_role";

grant UPDATE on table public."notification_nearby_incident" to "service_role";
