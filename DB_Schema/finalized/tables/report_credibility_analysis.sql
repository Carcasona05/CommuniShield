-- public.report_credibility_analysis: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."report_credibility_analysis" (
  "id" uuid default gen_random_uuid() not null,
  "report_id" uuid not null,
  "ai_score" numeric(5,2) default 0 not null,
  "severity" text default 'Medium'::text not null,
  "credibility_level" text default 'Medium'::text not null,
  "credibility_review" text default ''::text not null,
  "ai_model_version" text default ''::text not null,
  "analysis_duration_ms" integer default 0 not null,
  "analyzed_at" timestamp with time zone default now() not null
);

alter table public."report_credibility_analysis" add constraint "report_credibility_analysis_ai_model_version_not_null" NOT NULL ai_model_version;

alter table public."report_credibility_analysis" add constraint "report_credibility_analysis_ai_score_check" CHECK (((ai_score >= (0)::numeric) AND (ai_score <= (100)::numeric)));

alter table public."report_credibility_analysis" add constraint "report_credibility_analysis_ai_score_not_null" NOT NULL ai_score;

alter table public."report_credibility_analysis" add constraint "report_credibility_analysis_analysis_duration_ms_not_null" NOT NULL analysis_duration_ms;

alter table public."report_credibility_analysis" add constraint "report_credibility_analysis_analyzed_at_not_null" NOT NULL analyzed_at;

alter table public."report_credibility_analysis" add constraint "report_credibility_analysis_credibility_level_check" CHECK ((credibility_level = ANY (ARRAY['Low'::text, 'Medium'::text, 'High'::text])));

alter table public."report_credibility_analysis" add constraint "report_credibility_analysis_credibility_level_not_null" NOT NULL credibility_level;

alter table public."report_credibility_analysis" add constraint "report_credibility_analysis_credibility_review_not_null" NOT NULL credibility_review;

alter table public."report_credibility_analysis" add constraint "report_credibility_analysis_id_not_null" NOT NULL id;

alter table public."report_credibility_analysis" add constraint "report_credibility_analysis_pkey" PRIMARY KEY (id);

alter table public."report_credibility_analysis" add constraint "report_credibility_analysis_report_id_key" UNIQUE (report_id);

alter table public."report_credibility_analysis" add constraint "report_credibility_analysis_report_id_not_null" NOT NULL report_id;

alter table public."report_credibility_analysis" add constraint "report_credibility_analysis_severity_check" CHECK ((severity = ANY (ARRAY['Low'::text, 'Medium'::text, 'High'::text, 'Critical'::text])));

alter table public."report_credibility_analysis" add constraint "report_credibility_analysis_severity_not_null" NOT NULL severity;

alter table public."report_credibility_analysis" enable row level security;

revoke all on table public."report_credibility_analysis" from public, anon, authenticated, service_role;

grant DELETE on table public."report_credibility_analysis" to "anon";

grant INSERT on table public."report_credibility_analysis" to "anon";

grant SELECT on table public."report_credibility_analysis" to "anon";

grant UPDATE on table public."report_credibility_analysis" to "anon";

grant DELETE on table public."report_credibility_analysis" to "authenticated";

grant INSERT on table public."report_credibility_analysis" to "authenticated";

grant SELECT on table public."report_credibility_analysis" to "authenticated";

grant UPDATE on table public."report_credibility_analysis" to "authenticated";

grant DELETE on table public."report_credibility_analysis" to "service_role";

grant INSERT on table public."report_credibility_analysis" to "service_role";

grant MAINTAIN on table public."report_credibility_analysis" to "service_role";

grant REFERENCES on table public."report_credibility_analysis" to "service_role";

grant SELECT on table public."report_credibility_analysis" to "service_role";

grant TRIGGER on table public."report_credibility_analysis" to "service_role";

grant TRUNCATE on table public."report_credibility_analysis" to "service_role";

grant UPDATE on table public."report_credibility_analysis" to "service_role";
