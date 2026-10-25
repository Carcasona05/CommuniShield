-- public.user_terms_acceptance: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."user_terms_acceptance" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "terms_version" text not null,
  "accepted_at" timestamp with time zone default now() not null
);

alter table public."user_terms_acceptance" add constraint "user_terms_acceptance_accepted_at_not_null" NOT NULL accepted_at;

alter table public."user_terms_acceptance" add constraint "user_terms_acceptance_id_not_null" NOT NULL id;

alter table public."user_terms_acceptance" add constraint "user_terms_acceptance_pkey" PRIMARY KEY (id);

alter table public."user_terms_acceptance" add constraint "user_terms_acceptance_terms_version_not_null" NOT NULL terms_version;

alter table public."user_terms_acceptance" add constraint "user_terms_acceptance_user_id_not_null" NOT NULL user_id;

alter table public."user_terms_acceptance" add constraint "user_terms_acceptance_user_id_terms_version_key" UNIQUE (user_id, terms_version);

CREATE INDEX idx_user_terms_user_id ON public.user_terms_acceptance USING btree (user_id);

CREATE INDEX idx_user_terms_version ON public.user_terms_acceptance USING btree (terms_version);

alter table public."user_terms_acceptance" enable row level security;

revoke all on table public."user_terms_acceptance" from public, anon, authenticated, service_role;

grant DELETE on table public."user_terms_acceptance" to "anon";

grant INSERT on table public."user_terms_acceptance" to "anon";

grant SELECT on table public."user_terms_acceptance" to "anon";

grant UPDATE on table public."user_terms_acceptance" to "anon";

grant DELETE on table public."user_terms_acceptance" to "authenticated";

grant INSERT on table public."user_terms_acceptance" to "authenticated";

grant SELECT on table public."user_terms_acceptance" to "authenticated";

grant UPDATE on table public."user_terms_acceptance" to "authenticated";

grant DELETE on table public."user_terms_acceptance" to "service_role";

grant INSERT on table public."user_terms_acceptance" to "service_role";

grant MAINTAIN on table public."user_terms_acceptance" to "service_role";

grant REFERENCES on table public."user_terms_acceptance" to "service_role";

grant SELECT on table public."user_terms_acceptance" to "service_role";

grant TRIGGER on table public."user_terms_acceptance" to "service_role";

grant TRUNCATE on table public."user_terms_acceptance" to "service_role";

grant UPDATE on table public."user_terms_acceptance" to "service_role";
