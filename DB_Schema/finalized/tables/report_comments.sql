-- public.report_comments: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."report_comments" (
  "id" uuid default gen_random_uuid() not null,
  "report_id" uuid not null,
  "user_id" uuid,
  "content" text not null,
  "created_at" timestamp with time zone default now() not null
);

alter table public."report_comments" add constraint "report_comments_content_not_null" NOT NULL content;

alter table public."report_comments" add constraint "report_comments_created_at_not_null" NOT NULL created_at;

alter table public."report_comments" add constraint "report_comments_id_not_null" NOT NULL id;

alter table public."report_comments" add constraint "report_comments_pkey" PRIMARY KEY (id);

alter table public."report_comments" add constraint "report_comments_report_id_not_null" NOT NULL report_id;

CREATE INDEX report_comments_report ON public.report_comments USING btree (report_id);

alter table public."report_comments" enable row level security;

revoke all on table public."report_comments" from public, anon, authenticated, service_role;

grant DELETE on table public."report_comments" to "anon";

grant INSERT on table public."report_comments" to "anon";

grant SELECT on table public."report_comments" to "anon";

grant UPDATE on table public."report_comments" to "anon";

grant DELETE on table public."report_comments" to "authenticated";

grant INSERT on table public."report_comments" to "authenticated";

grant SELECT on table public."report_comments" to "authenticated";

grant UPDATE on table public."report_comments" to "authenticated";

grant DELETE on table public."report_comments" to "service_role";

grant INSERT on table public."report_comments" to "service_role";

grant MAINTAIN on table public."report_comments" to "service_role";

grant REFERENCES on table public."report_comments" to "service_role";

grant SELECT on table public."report_comments" to "service_role";

grant TRIGGER on table public."report_comments" to "service_role";

grant TRUNCATE on table public."report_comments" to "service_role";

grant UPDATE on table public."report_comments" to "service_role";
