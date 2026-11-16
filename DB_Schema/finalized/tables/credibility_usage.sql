-- public.credibility_usage: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."credibility_usage" (
  "kind" text not null,
  "source_id" uuid not null,
  "user_id" uuid not null,
  "used_at" timestamp with time zone default now() not null
);

alter table public."credibility_usage" add constraint "credibility_usage_kind_check" CHECK ((kind = ANY (ARRAY['report'::text, 'comment'::text])));

alter table public."credibility_usage" add constraint "credibility_usage_pkey" PRIMARY KEY (kind, source_id);

CREATE INDEX credibility_usage_user_day ON public.credibility_usage USING btree (user_id, kind, used_at);

alter table public."credibility_usage" enable row level security;

revoke all on table public."credibility_usage" from public, anon, authenticated, service_role;

grant DELETE on table public."credibility_usage" to "service_role";

grant INSERT on table public."credibility_usage" to "service_role";

grant REFERENCES on table public."credibility_usage" to "service_role";

grant SELECT on table public."credibility_usage" to "service_role";

grant TRIGGER on table public."credibility_usage" to "service_role";

grant TRUNCATE on table public."credibility_usage" to "service_role";

grant UPDATE on table public."credibility_usage" to "service_role";
