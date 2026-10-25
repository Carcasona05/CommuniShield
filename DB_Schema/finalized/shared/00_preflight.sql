-- GENERATED FINAL SCHEMA. See README.md. Fresh, empty Supabase projects ONLY.

-- Not a migration/reset script. Existing deployments must use the preserved migrations.

-- No auth users, reports, datasets or trained model artifacts are included.

begin;

do $$ begin
      if to_regclass('auth.users') is null or to_regclass('storage.buckets') is null then
        raise exception 'Supabase-managed auth.users and storage.buckets must exist first';
      end if;
      if to_regclass('public.admin_announcement') is not null or to_regclass('public.admin_posts') is not null or to_regclass('public.app_settings') is not null or to_regclass('public.audit_logs') is not null or to_regclass('public.credibility_events') is not null or to_regclass('public.emergency_facilities') is not null or to_regclass('public.incident_categories') is not null or to_regclass('public.incident_types') is not null or to_regclass('public.login_activities') is not null or to_regclass('public.notification_nearby_incident') is not null or to_regclass('public.notification_report_status') is not null or to_regclass('public.notification_types') is not null or to_regclass('public.notifications') is not null or to_regclass('public.profiles') is not null or to_regclass('public.report_comments') is not null or to_regclass('public.report_credibility_analysis') is not null or to_regclass('public.report_images') is not null or to_regclass('public.report_likes') is not null or to_regclass('public.report_validations') is not null or to_regclass('public.reports') is not null or to_regclass('public.sentiment_analysis') is not null or to_regclass('public.sentiment_dataset_events') is not null or to_regclass('public.sentiment_datasets') is not null or to_regclass('public.sentiment_model_state') is not null or to_regclass('public.sentiment_supporting_models') is not null or to_regclass('public.sentiment_supporting_settings') is not null or to_regclass('public.sentiment_training_events') is not null or to_regclass('public.sentiment_training_jobs') is not null or to_regclass('public.sentiment_training_samples') is not null or to_regclass('public.system_settings') is not null or to_regclass('public.user_credibility') is not null or to_regclass('public.user_terms_acceptance') is not null then
        raise exception 'Application tables already exist. Use ordered migrations, not the fresh-install schema.';
      end if;
    end $$;

create extension if not exists pgcrypto;

set local check_function_bodies = false;

grant usage on schema public to anon, authenticated, service_role;


-- Tables: final columns, with constraints added after all tables exist.
