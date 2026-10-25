-- public.notification_report_status: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."notification_report_status" (
  "notification_id" uuid not null,
  "report_id" uuid,
  "location" text,
  "is_verified" boolean default false not null
);

alter table public."notification_report_status" add constraint "notification_report_status_is_verified_not_null" NOT NULL is_verified;

alter table public."notification_report_status" add constraint "notification_report_status_notification_id_not_null" NOT NULL notification_id;

alter table public."notification_report_status" add constraint "notification_report_status_pkey" PRIMARY KEY (notification_id);

alter table public."notification_report_status" enable row level security;

revoke all on table public."notification_report_status" from public, anon, authenticated, service_role;

grant DELETE on table public."notification_report_status" to "anon";

grant INSERT on table public."notification_report_status" to "anon";

grant SELECT on table public."notification_report_status" to "anon";

grant UPDATE on table public."notification_report_status" to "anon";

grant DELETE on table public."notification_report_status" to "authenticated";

grant INSERT on table public."notification_report_status" to "authenticated";

grant SELECT on table public."notification_report_status" to "authenticated";

grant UPDATE on table public."notification_report_status" to "authenticated";

grant DELETE on table public."notification_report_status" to "service_role";

grant INSERT on table public."notification_report_status" to "service_role";

grant MAINTAIN on table public."notification_report_status" to "service_role";

grant REFERENCES on table public."notification_report_status" to "service_role";

grant SELECT on table public."notification_report_status" to "service_role";

grant TRIGGER on table public."notification_report_status" to "service_role";

grant TRUNCATE on table public."notification_report_status" to "service_role";

grant UPDATE on table public."notification_report_status" to "service_role";
