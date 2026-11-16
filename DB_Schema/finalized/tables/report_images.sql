-- public.report_images: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."report_images" (
  "id" uuid default gen_random_uuid() not null,
  "report_id" uuid not null,
  "image_url" text not null,
  "position" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null
);

alter table public."report_images" add constraint "report_images_pkey" PRIMARY KEY (id);

CREATE INDEX report_images_report ON public.report_images USING btree (report_id);

alter table public."report_images" enable row level security;

revoke all on table public."report_images" from public, anon, authenticated, service_role;

grant DELETE on table public."report_images" to "anon";

grant INSERT on table public."report_images" to "anon";

grant SELECT on table public."report_images" to "anon";

grant DELETE on table public."report_images" to "authenticated";

grant INSERT on table public."report_images" to "authenticated";

grant SELECT on table public."report_images" to "authenticated";

grant DELETE on table public."report_images" to "service_role";

grant INSERT on table public."report_images" to "service_role";

grant REFERENCES on table public."report_images" to "service_role";

grant SELECT on table public."report_images" to "service_role";

grant TRIGGER on table public."report_images" to "service_role";

grant TRUNCATE on table public."report_images" to "service_role";

grant UPDATE on table public."report_images" to "service_role";
