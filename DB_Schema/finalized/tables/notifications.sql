-- public.notifications: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."notifications" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid,
  "type_id" uuid not null,
  "title" text not null,
  "message" text default ''::text not null,
  "priority" text default 'Low'::text not null,
  "is_read" boolean default false not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

alter table public."notifications" add constraint "notifications_created_at_not_null" NOT NULL created_at;

alter table public."notifications" add constraint "notifications_id_not_null" NOT NULL id;

alter table public."notifications" add constraint "notifications_is_read_not_null" NOT NULL is_read;

alter table public."notifications" add constraint "notifications_message_not_null" NOT NULL message;

alter table public."notifications" add constraint "notifications_pkey" PRIMARY KEY (id);

alter table public."notifications" add constraint "notifications_priority_check" CHECK ((priority = ANY (ARRAY['Low'::text, 'Medium'::text, 'High'::text])));

alter table public."notifications" add constraint "notifications_priority_not_null" NOT NULL priority;

alter table public."notifications" add constraint "notifications_title_not_null" NOT NULL title;

alter table public."notifications" add constraint "notifications_type_id_not_null" NOT NULL type_id;

alter table public."notifications" add constraint "notifications_updated_at_not_null" NOT NULL updated_at;

CREATE INDEX notifications_created ON public.notifications USING btree (created_at DESC);

CREATE INDEX notifications_user ON public.notifications USING btree (user_id);

CREATE INDEX notifications_user_read ON public.notifications USING btree (user_id, is_read);

alter table public."notifications" enable row level security;

revoke all on table public."notifications" from public, anon, authenticated, service_role;

grant DELETE on table public."notifications" to "anon";

grant INSERT on table public."notifications" to "anon";

grant SELECT on table public."notifications" to "anon";

grant UPDATE on table public."notifications" to "anon";

grant DELETE on table public."notifications" to "authenticated";

grant INSERT on table public."notifications" to "authenticated";

grant SELECT on table public."notifications" to "authenticated";

grant UPDATE on table public."notifications" to "authenticated";

grant DELETE on table public."notifications" to "service_role";

grant INSERT on table public."notifications" to "service_role";

grant MAINTAIN on table public."notifications" to "service_role";

grant REFERENCES on table public."notifications" to "service_role";

grant SELECT on table public."notifications" to "service_role";

grant TRIGGER on table public."notifications" to "service_role";

grant TRUNCATE on table public."notifications" to "service_role";

grant UPDATE on table public."notifications" to "service_role";
