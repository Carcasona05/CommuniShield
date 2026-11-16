-- public.admin_announcement: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."admin_announcement" (
  "id" uuid default gen_random_uuid() not null,
  "admin_id" uuid,
  "type" text default 'Announcement'::text not null,
  "title" text default ''::text not null,
  "location" text,
  "details" text not null,
  "pic_url" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

alter table public."admin_announcement" add constraint "admin_announcement_pkey" PRIMARY KEY (id);

alter table public."admin_announcement" add constraint "admin_announcement_type_check" CHECK ((type = ANY (ARRAY['Seminar'::text, 'Safety/Tips'::text, 'Curfew'::text, 'Announcement'::text, 'Road Closure'::text, 'Emergency'::text, 'Power Interruption'::text, 'Water Interruption'::text, 'Weather Advisory'::text, 'Public Advisory'::text, 'Medical Advisory'::text, 'Flood Advisory'::text, 'Fire Incident'::text, 'Earthquake'::text, 'Typhoon'::text, 'Others'::text])));

CREATE INDEX announcements_feed_cursor_idx ON public.admin_announcement USING btree (created_at DESC, id DESC);

alter table public."admin_announcement" enable row level security;

revoke all on table public."admin_announcement" from public, anon, authenticated, service_role;

grant DELETE on table public."admin_announcement" to "authenticated";

grant INSERT on table public."admin_announcement" to "authenticated";

grant SELECT on table public."admin_announcement" to "authenticated";

grant UPDATE on table public."admin_announcement" to "authenticated";

grant DELETE on table public."admin_announcement" to "service_role";

grant INSERT on table public."admin_announcement" to "service_role";

grant REFERENCES on table public."admin_announcement" to "service_role";

grant SELECT on table public."admin_announcement" to "service_role";

grant TRIGGER on table public."admin_announcement" to "service_role";

grant TRUNCATE on table public."admin_announcement" to "service_role";

grant UPDATE on table public."admin_announcement" to "service_role";
