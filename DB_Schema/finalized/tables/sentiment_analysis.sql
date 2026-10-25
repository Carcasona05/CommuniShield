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
  "updated_at" timestamp with time zone default now() not null
);

alter table public."sentiment_analysis" add constraint "sentiment_analysis_confidence_check" CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)));

alter table public."sentiment_analysis" add constraint "sentiment_analysis_confidence_not_null" NOT NULL confidence;

alter table public."sentiment_analysis" add constraint "sentiment_analysis_created_at_not_null" NOT NULL created_at;

alter table public."sentiment_analysis" add constraint "sentiment_analysis_error_code_not_null" NOT NULL error_code;

alter table public."sentiment_analysis" add constraint "sentiment_analysis_id_not_null" NOT NULL id;

alter table public."sentiment_analysis" add constraint "sentiment_analysis_input_hash_not_null" NOT NULL input_hash;

alter table public."sentiment_analysis" add constraint "sentiment_analysis_label_check" CHECK ((label = ANY (ARRAY['positive'::text, 'neutral'::text, 'negative'::text, 'mixed'::text, 'unclear'::text])));

alter table public."sentiment_analysis" add constraint "sentiment_analysis_label_not_null" NOT NULL label;

alter table public."sentiment_analysis" add constraint "sentiment_analysis_language_check" CHECK ((language = ANY (ARRAY['english'::text, 'filipino'::text, 'cebuano'::text, 'unknown'::text])));

alter table public."sentiment_analysis" add constraint "sentiment_analysis_language_not_null" NOT NULL language;

alter table public."sentiment_analysis" add constraint "sentiment_analysis_model_not_null" NOT NULL model;

alter table public."sentiment_analysis" add constraint "sentiment_analysis_pkey" PRIMARY KEY (id);

alter table public."sentiment_analysis" add constraint "sentiment_analysis_provider_check" CHECK ((provider = ANY (ARRAY['local'::text, 'gemini'::text, 'ensemble'::text, 'none'::text])));

alter table public."sentiment_analysis" add constraint "sentiment_analysis_provider_not_null" NOT NULL provider;

alter table public."sentiment_analysis" add constraint "sentiment_analysis_request_id_not_null" NOT NULL request_id;

alter table public."sentiment_analysis" add constraint "sentiment_analysis_source_text_not_null" NOT NULL source_text;

alter table public."sentiment_analysis" add constraint "sentiment_analysis_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'succeeded'::text, 'failed'::text, 'unavailable'::text, 'skipped'::text])));

alter table public."sentiment_analysis" add constraint "sentiment_analysis_status_not_null" NOT NULL status;

alter table public."sentiment_analysis" add constraint "sentiment_analysis_subject_id_not_null" NOT NULL subject_id;

alter table public."sentiment_analysis" add constraint "sentiment_analysis_subject_type_check" CHECK ((subject_type = ANY (ARRAY['report'::text, 'comment'::text])));

alter table public."sentiment_analysis" add constraint "sentiment_analysis_subject_type_not_null" NOT NULL subject_type;

alter table public."sentiment_analysis" add constraint "sentiment_analysis_updated_at_not_null" NOT NULL updated_at;

CREATE INDEX sentiment_analysis_status_idx ON public.sentiment_analysis USING btree (status, updated_at DESC);

CREATE INDEX sentiment_analysis_subject_idx ON public.sentiment_analysis USING btree (subject_type, subject_id);

CREATE UNIQUE INDEX sentiment_analysis_subject_unique_idx ON public.sentiment_analysis USING btree (subject_type, subject_id);

alter table public."sentiment_analysis" enable row level security;

revoke all on table public."sentiment_analysis" from public, anon, authenticated, service_role;

grant DELETE on table public."sentiment_analysis" to "anon";

grant INSERT on table public."sentiment_analysis" to "anon";

grant SELECT on table public."sentiment_analysis" to "anon";

grant UPDATE on table public."sentiment_analysis" to "anon";

grant DELETE on table public."sentiment_analysis" to "authenticated";

grant INSERT on table public."sentiment_analysis" to "authenticated";

grant SELECT on table public."sentiment_analysis" to "authenticated";

grant UPDATE on table public."sentiment_analysis" to "authenticated";

grant DELETE on table public."sentiment_analysis" to "service_role";

grant INSERT on table public."sentiment_analysis" to "service_role";

grant MAINTAIN on table public."sentiment_analysis" to "service_role";

grant REFERENCES on table public."sentiment_analysis" to "service_role";

grant SELECT on table public."sentiment_analysis" to "service_role";

grant TRIGGER on table public."sentiment_analysis" to "service_role";

grant TRUNCATE on table public."sentiment_analysis" to "service_role";

grant UPDATE on table public."sentiment_analysis" to "service_role";
