-- public.admin_analysis_batch_jobs: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."admin_analysis_batch_jobs" (
  "batch_id" uuid not null,
  "job_id" uuid not null
);

alter table public."admin_analysis_batch_jobs" add constraint "admin_analysis_batch_jobs_pkey" PRIMARY KEY (batch_id, job_id);

alter table public."admin_analysis_batch_jobs" enable row level security;

revoke all on table public."admin_analysis_batch_jobs" from public, anon, authenticated, service_role;

grant DELETE on table public."admin_analysis_batch_jobs" to "service_role";

grant INSERT on table public."admin_analysis_batch_jobs" to "service_role";

grant REFERENCES on table public."admin_analysis_batch_jobs" to "service_role";

grant SELECT on table public."admin_analysis_batch_jobs" to "service_role";

grant TRIGGER on table public."admin_analysis_batch_jobs" to "service_role";

grant TRUNCATE on table public."admin_analysis_batch_jobs" to "service_role";

grant UPDATE on table public."admin_analysis_batch_jobs" to "service_role";
