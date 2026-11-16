-- public.notifications: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."notifications" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "type_id" uuid not null,
  "title" text not null,
  "message" text default ''::text not null,
  "priority" text default 'Low'::text not null,
  "is_read" boolean default false not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

alter table public."notifications" add constraint "notifications_pkey" PRIMARY KEY (id);

alter table public."notifications" add constraint "notifications_priority_check" CHECK ((priority = ANY (ARRAY['Low'::text, 'Medium'::text, 'High'::text])));

CREATE INDEX notifications_created ON public.notifications USING btree (created_at DESC);

CREATE INDEX notifications_user ON public.notifications USING btree (user_id);

CREATE INDEX notifications_user_read ON public.notifications USING btree (user_id, is_read);

alter table public."notifications" enable row level security;

revoke all on table public."notifications" from public, anon, authenticated, service_role;

grant SELECT on table public."notifications" to "anon";

grant UPDATE on table public."notifications" to "anon";

grant SELECT on table public."notifications" to "authenticated";

grant UPDATE on table public."notifications" to "authenticated";

grant DELETE on table public."notifications" to "service_role";

grant INSERT on table public."notifications" to "service_role";

grant REFERENCES on table public."notifications" to "service_role";

grant SELECT on table public."notifications" to "service_role";

grant TRIGGER on table public."notifications" to "service_role";

grant TRUNCATE on table public."notifications" to "service_role";

grant UPDATE on table public."notifications" to "service_role";
