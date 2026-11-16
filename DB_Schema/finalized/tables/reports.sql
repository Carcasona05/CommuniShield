-- public.reports: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."reports" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid,
  "incident_type_id" uuid,
  "location" text,
  "latitude" double precision,
  "longitude" double precision,
  "poster_name" text,
  "display_name_type" text default 'Username'::text not null,
  "details" text default ''::text not null,
  "status" text default 'Pending Review'::text not null,
  "is_verified" boolean default false not null,
  "role" text default 'user'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

alter table public."reports" add constraint "reports_display_name_type_check" CHECK ((display_name_type = ANY (ARRAY['Fullname'::text, 'Username'::text])));

alter table public."reports" add constraint "reports_pkey" PRIMARY KEY (id);

alter table public."reports" add constraint "reports_role_check" CHECK ((role = ANY (ARRAY['user'::text, 'admin'::text, 'super_admin'::text])));

alter table public."reports" add constraint "reports_status_check" CHECK ((status = ANY (ARRAY['Pending Review'::text, 'Under Verification'::text, 'Verified'::text, 'Resolved'::text, 'Rejected'::text, 'Archived'::text, 'Marked Fake'::text])));

CREATE INDEX reports_admin_browse_idx ON public.reports USING btree (role, created_at DESC, id DESC) WHERE (status <> 'Archived'::text);

CREATE INDEX reports_archived_status ON public.reports USING btree (created_at DESC) WHERE (status = 'Archived'::text);

CREATE INDEX reports_feed_cursor_idx ON public.reports USING btree (created_at DESC, id DESC) WHERE (status <> 'Archived'::text);

CREATE INDEX reports_owner_feed_idx ON public.reports USING btree (user_id, created_at DESC, id DESC) WHERE (status <> 'Archived'::text);

CREATE INDEX reports_owner_status_feed_idx ON public.reports USING btree (user_id, status, created_at DESC, id DESC);

CREATE INDEX reports_status_created_idx ON public.reports USING btree (status, created_at DESC, id DESC);

alter table public."reports" enable row level security;

revoke all on table public."reports" from public, anon, authenticated, service_role;

grant DELETE on table public."reports" to "anon";

grant INSERT on table public."reports" to "anon";

grant SELECT on table public."reports" to "anon";

grant UPDATE on table public."reports" to "anon";

grant DELETE on table public."reports" to "authenticated";

grant INSERT on table public."reports" to "authenticated";

grant SELECT on table public."reports" to "authenticated";

grant UPDATE on table public."reports" to "authenticated";

grant DELETE on table public."reports" to "service_role";

grant INSERT on table public."reports" to "service_role";

grant REFERENCES on table public."reports" to "service_role";

grant SELECT on table public."reports" to "service_role";

grant TRIGGER on table public."reports" to "service_role";

grant TRUNCATE on table public."reports" to "service_role";

grant UPDATE on table public."reports" to "service_role";
