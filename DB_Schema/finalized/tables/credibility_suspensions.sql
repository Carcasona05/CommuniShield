-- public.credibility_suspensions: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."credibility_suspensions" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "occurrence" integer not null,
  "duration_days" integer not null,
  "started_at" timestamp with time zone default now() not null,
  "ends_at" timestamp with time zone not null,
  "released_at" timestamp with time zone,
  "reason" text not null
);

alter table public."credibility_suspensions" add constraint "credibility_suspensions_check" CHECK ((ends_at > started_at));

alter table public."credibility_suspensions" add constraint "credibility_suspensions_duration_days_check" CHECK ((duration_days = ANY (ARRAY[1, 3, 7, 14, 30])));

alter table public."credibility_suspensions" add constraint "credibility_suspensions_occurrence_check" CHECK ((occurrence > 0));

alter table public."credibility_suspensions" add constraint "credibility_suspensions_pkey" PRIMARY KEY (id);

CREATE UNIQUE INDEX credibility_one_open_suspension ON public.credibility_suspensions USING btree (user_id) WHERE (released_at IS NULL);

CREATE INDEX credibility_suspensions_user_date ON public.credibility_suspensions USING btree (user_id, started_at DESC);

alter table public."credibility_suspensions" enable row level security;

revoke all on table public."credibility_suspensions" from public, anon, authenticated, service_role;

grant DELETE on table public."credibility_suspensions" to "service_role";

grant INSERT on table public."credibility_suspensions" to "service_role";

grant REFERENCES on table public."credibility_suspensions" to "service_role";

grant SELECT on table public."credibility_suspensions" to "service_role";

grant TRIGGER on table public."credibility_suspensions" to "service_role";

grant TRUNCATE on table public."credibility_suspensions" to "service_role";

grant UPDATE on table public."credibility_suspensions" to "service_role";
