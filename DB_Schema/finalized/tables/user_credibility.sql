-- public.user_credibility: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."user_credibility" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "score" numeric(5,2) default 60 not null,
  "level" smallint default 3 not null,
  "level_label" text default 'Limited'::text not null,
  "updated_at" timestamp with time zone default now() not null
);

alter table public."user_credibility" add constraint "user_credibility_level_check" CHECK (((level >= 0) AND (level <= 4)));

alter table public."user_credibility" add constraint "user_credibility_level_label_check" CHECK ((level_label = ANY (ARRAY['Suspended'::text, 'At risk'::text, 'Very Limited'::text, 'Limited'::text, 'All good'::text])));

alter table public."user_credibility" add constraint "user_credibility_pkey" PRIMARY KEY (id);

alter table public."user_credibility" add constraint "user_credibility_score_check" CHECK (((score >= (0)::numeric) AND (score <= (100)::numeric)));

alter table public."user_credibility" add constraint "user_credibility_user_id_key" UNIQUE (user_id);

alter table public."user_credibility" enable row level security;

revoke all on table public."user_credibility" from public, anon, authenticated, service_role;

grant SELECT on table public."user_credibility" to "authenticated";

grant DELETE on table public."user_credibility" to "service_role";

grant INSERT on table public."user_credibility" to "service_role";

grant REFERENCES on table public."user_credibility" to "service_role";

grant SELECT on table public."user_credibility" to "service_role";

grant TRIGGER on table public."user_credibility" to "service_role";

grant TRUNCATE on table public."user_credibility" to "service_role";

grant UPDATE on table public."user_credibility" to "service_role";
