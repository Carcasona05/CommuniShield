-- public.sentiment_datasets: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."sentiment_datasets" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "source" text not null,
  "status" text default 'pending'::text not null,
  "created_by" uuid,
  "created_by_name" text not null,
  "reviewed_by" uuid,
  "review_note" text default ''::text not null,
  "version" integer default 1 not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

alter table public."sentiment_datasets" add constraint "sentiment_datasets_created_at_not_null" NOT NULL created_at;

alter table public."sentiment_datasets" add constraint "sentiment_datasets_created_by_name_not_null" NOT NULL created_by_name;

alter table public."sentiment_datasets" add constraint "sentiment_datasets_id_not_null" NOT NULL id;

alter table public."sentiment_datasets" add constraint "sentiment_datasets_name_check" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 120)));

alter table public."sentiment_datasets" add constraint "sentiment_datasets_name_not_null" NOT NULL name;

alter table public."sentiment_datasets" add constraint "sentiment_datasets_pkey" PRIMARY KEY (id);

alter table public."sentiment_datasets" add constraint "sentiment_datasets_review_note_not_null" NOT NULL review_note;

alter table public."sentiment_datasets" add constraint "sentiment_datasets_source_check" CHECK ((source = ANY (ARRAY['manual'::text, 'csv'::text])));

alter table public."sentiment_datasets" add constraint "sentiment_datasets_source_not_null" NOT NULL source;

alter table public."sentiment_datasets" add constraint "sentiment_datasets_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'archived'::text])));

alter table public."sentiment_datasets" add constraint "sentiment_datasets_status_not_null" NOT NULL status;

alter table public."sentiment_datasets" add constraint "sentiment_datasets_updated_at_not_null" NOT NULL updated_at;

alter table public."sentiment_datasets" add constraint "sentiment_datasets_version_not_null" NOT NULL version;

CREATE INDEX sentiment_datasets_created_at ON public.sentiment_datasets USING btree (created_at DESC);

alter table public."sentiment_datasets" enable row level security;

revoke all on table public."sentiment_datasets" from public, anon, authenticated, service_role;

grant DELETE on table public."sentiment_datasets" to "service_role";

grant INSERT on table public."sentiment_datasets" to "service_role";

grant MAINTAIN on table public."sentiment_datasets" to "service_role";

grant REFERENCES on table public."sentiment_datasets" to "service_role";

grant SELECT on table public."sentiment_datasets" to "service_role";

grant TRIGGER on table public."sentiment_datasets" to "service_role";

grant TRUNCATE on table public."sentiment_datasets" to "service_role";

grant UPDATE on table public."sentiment_datasets" to "service_role";
