-- public.admin_blotters: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."admin_blotters" (
  "id" uuid default gen_random_uuid() not null,
  "admin_id" uuid,
  "blotter_no" text not null,
  "barangay" text,
  "location" text not null,
  "incident_type" text not null,
  "incident_datetime" timestamp with time zone,
  "complainant_name" text not null,
  "complainant_age" text,
  "complainant_contact" text,
  "respondent" text not null,
  "incident_description" text not null,
  "action_taken" text not null,
  "status" text default 'Pending Review'::text not null,
  "reported_by" text not null,
  "blotter_officer" text not null,
  "date_reported" timestamp with time zone,
  "date_recorded" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null
);

alter table public."admin_blotters" add constraint "admin_blotters_blotter_no_key" UNIQUE (blotter_no);

alter table public."admin_blotters" add constraint "admin_blotters_pkey" PRIMARY KEY (id);

CREATE INDEX admin_blotters_created_at_idx ON public.admin_blotters USING btree (created_at DESC);

alter table public."admin_blotters" enable row level security;

revoke all on table public."admin_blotters" from public, anon, authenticated, service_role;

grant DELETE on table public."admin_blotters" to "service_role";

grant INSERT on table public."admin_blotters" to "service_role";

grant REFERENCES on table public."admin_blotters" to "service_role";

grant SELECT on table public."admin_blotters" to "service_role";

grant TRIGGER on table public."admin_blotters" to "service_role";

grant TRUNCATE on table public."admin_blotters" to "service_role";

grant UPDATE on table public."admin_blotters" to "service_role";
