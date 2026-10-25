-- public.admin_posts: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."admin_posts" (
  "id" uuid default gen_random_uuid() not null,
  "admin_id" uuid,
  "type" text default 'Safety/Tips'::text not null,
  "location" text,
  "details" text not null,
  "pic_url" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

alter table public."admin_posts" add constraint "admin_posts_created_at_not_null" NOT NULL created_at;

alter table public."admin_posts" add constraint "admin_posts_details_not_null" NOT NULL details;

alter table public."admin_posts" add constraint "admin_posts_id_not_null" NOT NULL id;

alter table public."admin_posts" add constraint "admin_posts_pkey" PRIMARY KEY (id);

alter table public."admin_posts" add constraint "admin_posts_type_check" CHECK ((type = ANY (ARRAY['Seminar'::text, 'Safety/Tips'::text, 'Curfew'::text, 'Announcement'::text])));

alter table public."admin_posts" add constraint "admin_posts_type_not_null" NOT NULL type;

alter table public."admin_posts" add constraint "admin_posts_updated_at_not_null" NOT NULL updated_at;

alter table public."admin_posts" enable row level security;

revoke all on table public."admin_posts" from public, anon, authenticated, service_role;

grant DELETE on table public."admin_posts" to "anon";

grant INSERT on table public."admin_posts" to "anon";

grant SELECT on table public."admin_posts" to "anon";

grant UPDATE on table public."admin_posts" to "anon";

grant DELETE on table public."admin_posts" to "authenticated";

grant INSERT on table public."admin_posts" to "authenticated";

grant SELECT on table public."admin_posts" to "authenticated";

grant UPDATE on table public."admin_posts" to "authenticated";

grant DELETE on table public."admin_posts" to "service_role";

grant INSERT on table public."admin_posts" to "service_role";

grant MAINTAIN on table public."admin_posts" to "service_role";

grant REFERENCES on table public."admin_posts" to "service_role";

grant SELECT on table public."admin_posts" to "service_role";

grant TRIGGER on table public."admin_posts" to "service_role";

grant TRUNCATE on table public."admin_posts" to "service_role";

grant UPDATE on table public."admin_posts" to "service_role";
