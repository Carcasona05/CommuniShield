-- public.credibility_report_effects: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."credibility_report_effects" (
  "report_id" uuid not null,
  "user_id" uuid not null,
  "event_type" text not null,
  "applied" numeric default 0 not null,
  "active" boolean default true not null,
  "corrected" boolean default false not null
);

alter table public."credibility_report_effects" add constraint "credibility_report_effects_event_type_check" CHECK ((event_type = ANY (ARRAY['report_verified'::text, 'report_rejected'::text, 'report_marked_fake'::text])));

alter table public."credibility_report_effects" add constraint "credibility_report_effects_pkey" PRIMARY KEY (report_id, event_type);

alter table public."credibility_report_effects" enable row level security;

revoke all on table public."credibility_report_effects" from public, anon, authenticated, service_role;

grant DELETE on table public."credibility_report_effects" to "service_role";

grant INSERT on table public."credibility_report_effects" to "service_role";

grant REFERENCES on table public."credibility_report_effects" to "service_role";

grant SELECT on table public."credibility_report_effects" to "service_role";

grant TRIGGER on table public."credibility_report_effects" to "service_role";

grant TRUNCATE on table public."credibility_report_effects" to "service_role";

grant UPDATE on table public."credibility_report_effects" to "service_role";
