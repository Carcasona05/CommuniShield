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

alter table public."audit_logs" add constraint "audit_logs_pkey" PRIMARY KEY (id);

CREATE INDEX audit_logs_action ON public.audit_logs USING btree (action_type);

CREATE INDEX audit_logs_actor ON public.audit_logs USING btree (actor_id);

CREATE INDEX audit_logs_browse_idx ON public.audit_logs USING btree (created_at DESC, id DESC);

CREATE INDEX audit_logs_created ON public.audit_logs USING btree (created_at DESC);

CREATE INDEX audit_logs_report_browse_idx ON public.audit_logs USING btree (report_id, created_at DESC, id DESC);

alter table public."audit_logs" enable row level security;

revoke all on table public."audit_logs" from public, anon, authenticated, service_role;

grant INSERT on table public."audit_logs" to "authenticated";

grant SELECT on table public."audit_logs" to "authenticated";

grant DELETE on table public."audit_logs" to "service_role";

grant INSERT on table public."audit_logs" to "service_role";

grant REFERENCES on table public."audit_logs" to "service_role";

grant SELECT on table public."audit_logs" to "service_role";

grant TRIGGER on table public."audit_logs" to "service_role";

grant TRUNCATE on table public."audit_logs" to "service_role";

grant UPDATE on table public."audit_logs" to "service_role";
