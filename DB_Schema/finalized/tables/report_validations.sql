-- public.report_validations: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."report_validations" (
  "id" uuid default gen_random_uuid() not null,
  "report_id" uuid not null,
  "admin_id" uuid,
  "action" text not null,
  "previous_status" text,
  "new_status" text not null,
  "remarks" text default ''::text not null,
  "created_at" timestamp with time zone default now() not null
);

alter table public."report_validations" add constraint "report_validations_action_check" CHECK ((action = ANY (ARRAY['Under Verification'::text, 'Resolved'::text, 'Rejected'::text, 'Archived'::text, 'Marked Fake'::text])));

alter table public."report_validations" add constraint "report_validations_action_not_null" NOT NULL action;

alter table public."report_validations" add constraint "report_validations_created_at_not_null" NOT NULL created_at;

alter table public."report_validations" add constraint "report_validations_id_not_null" NOT NULL id;

alter table public."report_validations" add constraint "report_validations_new_status_not_null" NOT NULL new_status;

alter table public."report_validations" add constraint "report_validations_pkey" PRIMARY KEY (id);

alter table public."report_validations" add constraint "report_validations_remarks_not_null" NOT NULL remarks;

alter table public."report_validations" add constraint "report_validations_report_id_not_null" NOT NULL report_id;

CREATE INDEX report_validations_admin ON public.report_validations USING btree (admin_id);

CREATE INDEX report_validations_created ON public.report_validations USING btree (created_at DESC);

CREATE INDEX report_validations_report ON public.report_validations USING btree (report_id);

alter table public."report_validations" enable row level security;

revoke all on table public."report_validations" from public, anon, authenticated, service_role;

grant DELETE on table public."report_validations" to "anon";

grant INSERT on table public."report_validations" to "anon";

grant SELECT on table public."report_validations" to "anon";

grant UPDATE on table public."report_validations" to "anon";

grant DELETE on table public."report_validations" to "authenticated";

grant INSERT on table public."report_validations" to "authenticated";

grant SELECT on table public."report_validations" to "authenticated";

grant UPDATE on table public."report_validations" to "authenticated";

grant DELETE on table public."report_validations" to "service_role";

grant INSERT on table public."report_validations" to "service_role";

grant MAINTAIN on table public."report_validations" to "service_role";

grant REFERENCES on table public."report_validations" to "service_role";

grant SELECT on table public."report_validations" to "service_role";

grant TRIGGER on table public."report_validations" to "service_role";

grant TRUNCATE on table public."report_validations" to "service_role";

grant UPDATE on table public."report_validations" to "service_role";
