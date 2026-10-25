-- public.report_likes: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."report_likes" (
  "report_id" uuid not null,
  "user_id" uuid not null,
  "created_at" timestamp with time zone default now() not null
);

alter table public."report_likes" add constraint "report_likes_created_at_not_null" NOT NULL created_at;

alter table public."report_likes" add constraint "report_likes_pkey" PRIMARY KEY (report_id, user_id);

alter table public."report_likes" add constraint "report_likes_report_id_not_null" NOT NULL report_id;

alter table public."report_likes" add constraint "report_likes_user_id_not_null" NOT NULL user_id;

alter table public."report_likes" enable row level security;

revoke all on table public."report_likes" from public, anon, authenticated, service_role;

grant DELETE on table public."report_likes" to "anon";

grant INSERT on table public."report_likes" to "anon";

grant SELECT on table public."report_likes" to "anon";

grant UPDATE on table public."report_likes" to "anon";

grant DELETE on table public."report_likes" to "authenticated";

grant INSERT on table public."report_likes" to "authenticated";

grant SELECT on table public."report_likes" to "authenticated";

grant UPDATE on table public."report_likes" to "authenticated";

grant DELETE on table public."report_likes" to "service_role";

grant INSERT on table public."report_likes" to "service_role";

grant MAINTAIN on table public."report_likes" to "service_role";

grant REFERENCES on table public."report_likes" to "service_role";

grant SELECT on table public."report_likes" to "service_role";

grant TRIGGER on table public."report_likes" to "service_role";

grant TRUNCATE on table public."report_likes" to "service_role";

grant UPDATE on table public."report_likes" to "service_role";
