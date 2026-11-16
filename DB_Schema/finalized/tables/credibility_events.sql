-- public.credibility_events: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."credibility_events" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "event_type" text not null,
  "points" numeric(5,2) not null,
  "reason" text default ''::text not null,
  "report_id" uuid,
  "created_at" timestamp with time zone default now() not null
);

alter table public."credibility_events" add constraint "credibility_events_event_type_check" CHECK ((event_type = ANY (ARRAY['report_submitted'::text, 'report_verified'::text, 'report_rejected'::text, 'report_marked_fake'::text, 'report_resolved'::text, 'penalty'::text, 'admin_adjustment'::text, 'system'::text])));

alter table public."credibility_events" add constraint "credibility_events_pkey" PRIMARY KEY (id);

CREATE INDEX credibility_events_user ON public.credibility_events USING btree (user_id);

alter table public."credibility_events" enable row level security;

revoke all on table public."credibility_events" from public, anon, authenticated, service_role;

grant SELECT on table public."credibility_events" to "authenticated";

grant DELETE on table public."credibility_events" to "service_role";

grant INSERT on table public."credibility_events" to "service_role";

grant REFERENCES on table public."credibility_events" to "service_role";

grant SELECT on table public."credibility_events" to "service_role";

grant TRIGGER on table public."credibility_events" to "service_role";

grant TRUNCATE on table public."credibility_events" to "service_role";

grant UPDATE on table public."credibility_events" to "service_role";
