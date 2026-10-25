-- public.audit_logs: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."audit_logs" (
  "id" uuid default gen_random_uuid() not null,
  "actor_id" uuid,
  "actor_name" text default ''::text not null,
  "action_type" text not null,
  "title" text default ''::text not null,
  "details" text default ''::text not null,
  "report_id" uuid,
  "old_value" text,
  "new_value" text,
  "created_at" timestamp with time zone default now() not null
);

alter table public."audit_logs" add constraint "audit_logs_action_type_check" CHECK ((action_type = ANY (ARRAY['Report Verified'::text, 'Report Mapped'::text, 'Report Rejected'::text, 'Report Archived'::text, 'Report Deleted'::text, 'AI Analysis Completed'::text, 'Admin Added'::text, 'Admin Updated'::text, 'Admin Disabled'::text, 'Admin Deleted'::text, 'System Settings Updated'::text, 'Announcement Created'::text, 'Notification Sent'::text])));

alter table public."audit_logs" add constraint "audit_logs_action_type_not_null" NOT NULL action_type;

alter table public."audit_logs" add constraint "audit_logs_actor_name_not_null" NOT NULL actor_name;

alter table public."audit_logs" add constraint "audit_logs_created_at_not_null" NOT NULL created_at;

alter table public."audit_logs" add constraint "audit_logs_details_not_null" NOT NULL details;

alter table public."audit_logs" add constraint "audit_logs_id_not_null" NOT NULL id;

alter table public."audit_logs" add constraint "audit_logs_pkey" PRIMARY KEY (id);

alter table public."audit_logs" add constraint "audit_logs_title_not_null" NOT NULL title;

CREATE INDEX audit_logs_action ON public.audit_logs USING btree (action_type);

CREATE INDEX audit_logs_actor ON public.audit_logs USING btree (actor_id);

CREATE INDEX audit_logs_created ON public.audit_logs USING btree (created_at DESC);

alter table public."audit_logs" enable row level security;

revoke all on table public."audit_logs" from public, anon, authenticated, service_role;

grant DELETE on table public."audit_logs" to "anon";

grant INSERT on table public."audit_logs" to "anon";

grant SELECT on table public."audit_logs" to "anon";

grant UPDATE on table public."audit_logs" to "anon";

grant DELETE on table public."audit_logs" to "authenticated";

grant INSERT on table public."audit_logs" to "authenticated";

grant SELECT on table public."audit_logs" to "authenticated";

grant UPDATE on table public."audit_logs" to "authenticated";

grant DELETE on table public."audit_logs" to "service_role";

grant INSERT on table public."audit_logs" to "service_role";

grant MAINTAIN on table public."audit_logs" to "service_role";

grant REFERENCES on table public."audit_logs" to "service_role";

grant SELECT on table public."audit_logs" to "service_role";

grant TRIGGER on table public."audit_logs" to "service_role";

grant TRUNCATE on table public."audit_logs" to "service_role";

grant UPDATE on table public."audit_logs" to "service_role";
