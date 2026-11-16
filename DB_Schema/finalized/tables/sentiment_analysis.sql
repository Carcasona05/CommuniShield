-- public.sentiment_analysis: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."sentiment_analysis" (
  "id" uuid default gen_random_uuid() not null,
  "subject_type" text default 'report'::text not null,
  "subject_id" uuid not null,
  "label" text default 'unclear'::text not null,
  "confidence" numeric(5,4) default 0 not null,
  "language" text default 'unknown'::text not null,
  "provider" text default 'none'::text not null,
  "model" text default ''::text not null,
  "status" text default 'pending'::text not null,
  "input_hash" text default ''::text not null,
  "source_text" text default ''::text not null,
  "error_code" text default ''::text not null,
  "analyzed_at" timestamp with time zone,
  "request_id" text default ''::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "decision" jsonb
);

alter table public."sentiment_analysis" add constraint "sentiment_analysis_confidence_check" CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)));

alter table public."sentiment_analysis" add constraint "sentiment_analysis_label_check" CHECK ((label = ANY (ARRAY['positive'::text, 'neutral'::text, 'negative'::text, 'mixed'::text, 'unclear'::text])));

alter table public."sentiment_analysis" add constraint "sentiment_analysis_language_check" CHECK ((language = ANY (ARRAY['english'::text, 'filipino'::text, 'cebuano'::text, 'unknown'::text])));

alter table public."sentiment_analysis" add constraint "sentiment_analysis_pkey" PRIMARY KEY (id);

alter table public."sentiment_analysis" add constraint "sentiment_analysis_provider_check" CHECK ((provider = ANY (ARRAY['local'::text, 'gemini'::text, 'ensemble'::text, 'none'::text])));

alter table public."sentiment_analysis" add constraint "sentiment_analysis_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'succeeded'::text, 'failed'::text, 'unavailable'::text, 'skipped'::text])));

alter table public."sentiment_analysis" add constraint "sentiment_analysis_subject_type_check" CHECK ((subject_type = ANY (ARRAY['report'::text, 'comment'::text])));

CREATE INDEX sentiment_analysis_status_idx ON public.sentiment_analysis USING btree (status, updated_at DESC);

CREATE INDEX sentiment_analysis_subject_idx ON public.sentiment_analysis USING btree (subject_type, subject_id);

CREATE UNIQUE INDEX sentiment_analysis_subject_unique_idx ON public.sentiment_analysis USING btree (subject_type, subject_id);

alter table public."sentiment_analysis" enable row level security;

revoke all on table public."sentiment_analysis" from public, anon, authenticated, service_role;

grant SELECT on table public."sentiment_analysis" to "authenticated";

grant DELETE on table public."sentiment_analysis" to "service_role";

grant INSERT on table public."sentiment_analysis" to "service_role";

grant REFERENCES on table public."sentiment_analysis" to "service_role";

grant SELECT on table public."sentiment_analysis" to "service_role";

grant TRIGGER on table public."sentiment_analysis" to "service_role";

grant TRUNCATE on table public."sentiment_analysis" to "service_role";

grant UPDATE on table public."sentiment_analysis" to "service_role";
