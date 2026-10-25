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

-- public.admin_announcement: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."admin_announcement" (
  "id" uuid default gen_random_uuid() not null,
  "admin_id" uuid,
  "type" text default 'Announcement'::text not null,
  "title" text default ''::text not null,
  "location" text,
  "details" text not null,
  "pic_url" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

alter table public."admin_announcement" add constraint "admin_announcement_created_at_not_null" NOT NULL created_at;

alter table public."admin_announcement" add constraint "admin_announcement_details_not_null" NOT NULL details;

alter table public."admin_announcement" add constraint "admin_announcement_id_not_null" NOT NULL id;

alter table public."admin_announcement" add constraint "admin_announcement_pkey" PRIMARY KEY (id);

alter table public."admin_announcement" add constraint "admin_announcement_title_not_null" NOT NULL title;

alter table public."admin_announcement" add constraint "admin_announcement_type_check" CHECK ((type = ANY (ARRAY['Seminar'::text, 'Safety/Tips'::text, 'Curfew'::text, 'Announcement'::text, 'Road Closure'::text, 'Emergency'::text, 'Power Interruption'::text, 'Water Interruption'::text, 'Weather Advisory'::text, 'Public Advisory'::text, 'Medical Advisory'::text, 'Flood Advisory'::text, 'Fire Incident'::text, 'Earthquake'::text, 'Typhoon'::text, 'Others'::text])));

alter table public."admin_announcement" add constraint "admin_announcement_type_not_null" NOT NULL type;

alter table public."admin_announcement" add constraint "admin_announcement_updated_at_not_null" NOT NULL updated_at;

alter table public."admin_announcement" enable row level security;

revoke all on table public."admin_announcement" from public, anon, authenticated, service_role;

grant DELETE on table public."admin_announcement" to "anon";

grant INSERT on table public."admin_announcement" to "anon";

grant SELECT on table public."admin_announcement" to "anon";

grant UPDATE on table public."admin_announcement" to "anon";

grant DELETE on table public."admin_announcement" to "authenticated";

grant INSERT on table public."admin_announcement" to "authenticated";

grant SELECT on table public."admin_announcement" to "authenticated";

grant UPDATE on table public."admin_announcement" to "authenticated";

grant DELETE on table public."admin_announcement" to "service_role";

grant INSERT on table public."admin_announcement" to "service_role";

grant MAINTAIN on table public."admin_announcement" to "service_role";

grant REFERENCES on table public."admin_announcement" to "service_role";

grant SELECT on table public."admin_announcement" to "service_role";

grant TRIGGER on table public."admin_announcement" to "service_role";

grant TRUNCATE on table public."admin_announcement" to "service_role";

grant UPDATE on table public."admin_announcement" to "service_role";

-- public.admin_posts: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."admin_posts" (
  "id" uuid default gen_random_uuid() not null,
  "admin_id" uuid,
  "type" text default 'Safety/Tips'::text not null,
  "location" text,
  "details" text not null,
  "pic_url" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

alter table public."admin_posts" add constraint "admin_posts_created_at_not_null" NOT NULL created_at;

alter table public."admin_posts" add constraint "admin_posts_details_not_null" NOT NULL details;

alter table public."admin_posts" add constraint "admin_posts_id_not_null" NOT NULL id;

alter table public."admin_posts" add constraint "admin_posts_pkey" PRIMARY KEY (id);

alter table public."admin_posts" add constraint "admin_posts_type_check" CHECK ((type = ANY (ARRAY['Seminar'::text, 'Safety/Tips'::text, 'Curfew'::text, 'Announcement'::text])));

alter table public."admin_posts" add constraint "admin_posts_type_not_null" NOT NULL type;

alter table public."admin_posts" add constraint "admin_posts_updated_at_not_null" NOT NULL updated_at;

alter table public."admin_posts" enable row level security;

revoke all on table public."admin_posts" from public, anon, authenticated, service_role;

grant DELETE on table public."admin_posts" to "anon";

grant INSERT on table public."admin_posts" to "anon";

grant SELECT on table public."admin_posts" to "anon";

grant UPDATE on table public."admin_posts" to "anon";

grant DELETE on table public."admin_posts" to "authenticated";

grant INSERT on table public."admin_posts" to "authenticated";

grant SELECT on table public."admin_posts" to "authenticated";

grant UPDATE on table public."admin_posts" to "authenticated";

grant DELETE on table public."admin_posts" to "service_role";

grant INSERT on table public."admin_posts" to "service_role";

grant MAINTAIN on table public."admin_posts" to "service_role";

grant REFERENCES on table public."admin_posts" to "service_role";

grant SELECT on table public."admin_posts" to "service_role";

grant TRIGGER on table public."admin_posts" to "service_role";

grant TRUNCATE on table public."admin_posts" to "service_role";

grant UPDATE on table public."admin_posts" to "service_role";

-- public.app_settings: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."app_settings" (
  "id" uuid default gen_random_uuid() not null,
  "ai_credibility_enabled" boolean default true not null,
  "high_credibility_threshold" smallint default 90 not null,
  "medium_credibility_threshold" smallint default 60 not null,
  "updated_at" timestamp with time zone default now() not null
);

alter table public."app_settings" add constraint "app_settings_ai_credibility_enabled_not_null" NOT NULL ai_credibility_enabled;

alter table public."app_settings" add constraint "app_settings_high_credibility_threshold_check" CHECK (((high_credibility_threshold >= 0) AND (high_credibility_threshold <= 100)));

alter table public."app_settings" add constraint "app_settings_high_credibility_threshold_not_null" NOT NULL high_credibility_threshold;

alter table public."app_settings" add constraint "app_settings_id_not_null" NOT NULL id;

alter table public."app_settings" add constraint "app_settings_medium_credibility_threshold_check" CHECK (((medium_credibility_threshold >= 0) AND (medium_credibility_threshold <= 100)));

alter table public."app_settings" add constraint "app_settings_medium_credibility_threshold_not_null" NOT NULL medium_credibility_threshold;

alter table public."app_settings" add constraint "app_settings_pkey" PRIMARY KEY (id);

alter table public."app_settings" add constraint "app_settings_updated_at_not_null" NOT NULL updated_at;

alter table public."app_settings" enable row level security;

revoke all on table public."app_settings" from public, anon, authenticated, service_role;

grant DELETE on table public."app_settings" to "anon";

grant INSERT on table public."app_settings" to "anon";

grant SELECT on table public."app_settings" to "anon";

grant UPDATE on table public."app_settings" to "anon";

grant DELETE on table public."app_settings" to "authenticated";

grant INSERT on table public."app_settings" to "authenticated";

grant SELECT on table public."app_settings" to "authenticated";

grant UPDATE on table public."app_settings" to "authenticated";

grant DELETE on table public."app_settings" to "service_role";

grant INSERT on table public."app_settings" to "service_role";

grant MAINTAIN on table public."app_settings" to "service_role";

grant REFERENCES on table public."app_settings" to "service_role";

grant SELECT on table public."app_settings" to "service_role";

grant TRIGGER on table public."app_settings" to "service_role";

grant TRUNCATE on table public."app_settings" to "service_role";

grant UPDATE on table public."app_settings" to "service_role";

-- public.audit_logs: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."audit_logs" (
  "id" uuid default gen_random_uuid() not null,
  "actor_id" uuid,
  "actor_name" text default ''::text not null,
  "action_type" text not null,
  "title" text default ''::text not null,
  "details" text default ''::text not null,
  "report_id" uuid,
  "old_value" text,
  "new_value" text,
  "created_at" timestamp with time zone default now() not null
);

alter table public."audit_logs" add constraint "audit_logs_action_type_check" CHECK ((action_type = ANY (ARRAY['Report Verified'::text, 'Report Mapped'::text, 'Report Rejected'::text, 'Report Archived'::text, 'Report Deleted'::text, 'AI Analysis Completed'::text, 'Admin Added'::text, 'Admin Updated'::text, 'Admin Disabled'::text, 'Admin Deleted'::text, 'System Settings Updated'::text, 'Announcement Created'::text, 'Notification Sent'::text])));

alter table public."audit_logs" add constraint "audit_logs_action_type_not_null" NOT NULL action_type;

alter table public."audit_logs" add constraint "audit_logs_actor_name_not_null" NOT NULL actor_name;

alter table public."audit_logs" add constraint "audit_logs_created_at_not_null" NOT NULL created_at;

alter table public."audit_logs" add constraint "audit_logs_details_not_null" NOT NULL details;

alter table public."audit_logs" add constraint "audit_logs_id_not_null" NOT NULL id;

alter table public."audit_logs" add constraint "audit_logs_pkey" PRIMARY KEY (id);

alter table public."audit_logs" add constraint "audit_logs_title_not_null" NOT NULL title;

CREATE INDEX audit_logs_action ON public.audit_logs USING btree (action_type);

CREATE INDEX audit_logs_actor ON public.audit_logs USING btree (actor_id);

CREATE INDEX audit_logs_created ON public.audit_logs USING btree (created_at DESC);

alter table public."audit_logs" enable row level security;

revoke all on table public."audit_logs" from public, anon, authenticated, service_role;

grant DELETE on table public."audit_logs" to "anon";

grant INSERT on table public."audit_logs" to "anon";

grant SELECT on table public."audit_logs" to "anon";

grant UPDATE on table public."audit_logs" to "anon";

grant DELETE on table public."audit_logs" to "authenticated";

grant INSERT on table public."audit_logs" to "authenticated";

grant SELECT on table public."audit_logs" to "authenticated";

grant UPDATE on table public."audit_logs" to "authenticated";

grant DELETE on table public."audit_logs" to "service_role";

grant INSERT on table public."audit_logs" to "service_role";

grant MAINTAIN on table public."audit_logs" to "service_role";

grant REFERENCES on table public."audit_logs" to "service_role";

grant SELECT on table public."audit_logs" to "service_role";

grant TRIGGER on table public."audit_logs" to "service_role";

grant TRUNCATE on table public."audit_logs" to "service_role";

grant UPDATE on table public."audit_logs" to "service_role";

-- public.credibility_events: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."credibility_events" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "event_type" text not null,
  "points" numeric(5,2) not null,
  "reason" text default ''::text not null,
  "report_id" uuid,
  "created_at" timestamp with time zone default now() not null
);

alter table public."credibility_events" add constraint "credibility_events_created_at_not_null" NOT NULL created_at;

alter table public."credibility_events" add constraint "credibility_events_event_type_check" CHECK ((event_type = ANY (ARRAY['report_submitted'::text, 'report_verified'::text, 'report_rejected'::text, 'report_marked_fake'::text, 'report_resolved'::text, 'penalty'::text, 'admin_adjustment'::text, 'system'::text])));

alter table public."credibility_events" add constraint "credibility_events_event_type_not_null" NOT NULL event_type;

alter table public."credibility_events" add constraint "credibility_events_id_not_null" NOT NULL id;

alter table public."credibility_events" add constraint "credibility_events_pkey" PRIMARY KEY (id);

alter table public."credibility_events" add constraint "credibility_events_points_not_null" NOT NULL points;

alter table public."credibility_events" add constraint "credibility_events_reason_not_null" NOT NULL reason;

alter table public."credibility_events" add constraint "credibility_events_user_id_not_null" NOT NULL user_id;

CREATE INDEX credibility_events_user ON public.credibility_events USING btree (user_id);

alter table public."credibility_events" enable row level security;

revoke all on table public."credibility_events" from public, anon, authenticated, service_role;

grant DELETE on table public."credibility_events" to "anon";

grant INSERT on table public."credibility_events" to "anon";

grant SELECT on table public."credibility_events" to "anon";

grant UPDATE on table public."credibility_events" to "anon";

grant DELETE on table public."credibility_events" to "authenticated";

grant INSERT on table public."credibility_events" to "authenticated";

grant SELECT on table public."credibility_events" to "authenticated";

grant UPDATE on table public."credibility_events" to "authenticated";

grant DELETE on table public."credibility_events" to "service_role";

grant INSERT on table public."credibility_events" to "service_role";

grant MAINTAIN on table public."credibility_events" to "service_role";

grant REFERENCES on table public."credibility_events" to "service_role";

grant SELECT on table public."credibility_events" to "service_role";

grant TRIGGER on table public."credibility_events" to "service_role";

grant TRUNCATE on table public."credibility_events" to "service_role";

grant UPDATE on table public."credibility_events" to "service_role";

-- public.emergency_facilities: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."emergency_facilities" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "type" text not null,
  "latitude" double precision not null,
  "longitude" double precision not null,
  "address" text default ''::text not null,
  "phone" text default ''::text not null,
  "created_at" timestamp with time zone default now() not null
);

alter table public."emergency_facilities" add constraint "emergency_facilities_address_not_null" NOT NULL address;

alter table public."emergency_facilities" add constraint "emergency_facilities_created_at_not_null" NOT NULL created_at;

alter table public."emergency_facilities" add constraint "emergency_facilities_id_not_null" NOT NULL id;

alter table public."emergency_facilities" add constraint "emergency_facilities_latitude_not_null" NOT NULL latitude;

alter table public."emergency_facilities" add constraint "emergency_facilities_longitude_not_null" NOT NULL longitude;

alter table public."emergency_facilities" add constraint "emergency_facilities_name_key" UNIQUE (name);

alter table public."emergency_facilities" add constraint "emergency_facilities_name_not_null" NOT NULL name;

alter table public."emergency_facilities" add constraint "emergency_facilities_phone_not_null" NOT NULL phone;

alter table public."emergency_facilities" add constraint "emergency_facilities_pkey" PRIMARY KEY (id);

alter table public."emergency_facilities" add constraint "emergency_facilities_type_check" CHECK ((type = ANY (ARRAY['police'::text, 'fire'::text])));

alter table public."emergency_facilities" add constraint "emergency_facilities_type_not_null" NOT NULL type;

alter table public."emergency_facilities" enable row level security;

revoke all on table public."emergency_facilities" from public, anon, authenticated, service_role;

grant DELETE on table public."emergency_facilities" to "anon";

grant INSERT on table public."emergency_facilities" to "anon";

grant SELECT on table public."emergency_facilities" to "anon";

grant UPDATE on table public."emergency_facilities" to "anon";

grant DELETE on table public."emergency_facilities" to "authenticated";

grant INSERT on table public."emergency_facilities" to "authenticated";

grant SELECT on table public."emergency_facilities" to "authenticated";

grant UPDATE on table public."emergency_facilities" to "authenticated";

grant DELETE on table public."emergency_facilities" to "service_role";

grant INSERT on table public."emergency_facilities" to "service_role";

grant MAINTAIN on table public."emergency_facilities" to "service_role";

grant REFERENCES on table public."emergency_facilities" to "service_role";

grant SELECT on table public."emergency_facilities" to "service_role";

grant TRIGGER on table public."emergency_facilities" to "service_role";

grant TRUNCATE on table public."emergency_facilities" to "service_role";

grant UPDATE on table public."emergency_facilities" to "service_role";

-- public.incident_categories: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."incident_categories" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "created_at" timestamp with time zone default now() not null
);

alter table public."incident_categories" add constraint "incident_categories_created_at_not_null" NOT NULL created_at;

alter table public."incident_categories" add constraint "incident_categories_id_not_null" NOT NULL id;

alter table public."incident_categories" add constraint "incident_categories_name_key" UNIQUE (name);

alter table public."incident_categories" add constraint "incident_categories_name_not_null" NOT NULL name;

alter table public."incident_categories" add constraint "incident_categories_pkey" PRIMARY KEY (id);

revoke all on table public."incident_categories" from public, anon, authenticated, service_role;

grant DELETE on table public."incident_categories" to "anon";

grant INSERT on table public."incident_categories" to "anon";

grant SELECT on table public."incident_categories" to "anon";

grant UPDATE on table public."incident_categories" to "anon";

grant DELETE on table public."incident_categories" to "authenticated";

grant INSERT on table public."incident_categories" to "authenticated";

grant SELECT on table public."incident_categories" to "authenticated";

grant UPDATE on table public."incident_categories" to "authenticated";

grant DELETE on table public."incident_categories" to "service_role";

grant INSERT on table public."incident_categories" to "service_role";

grant MAINTAIN on table public."incident_categories" to "service_role";

grant REFERENCES on table public."incident_categories" to "service_role";

grant SELECT on table public."incident_categories" to "service_role";

grant TRIGGER on table public."incident_categories" to "service_role";

grant TRUNCATE on table public."incident_categories" to "service_role";

grant UPDATE on table public."incident_categories" to "service_role";

-- public.incident_types: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."incident_types" (
  "id" uuid default gen_random_uuid() not null,
  "category_id" uuid not null,
  "name" text not null
);

alter table public."incident_types" add constraint "incident_types_category_id_name_key" UNIQUE (category_id, name);

alter table public."incident_types" add constraint "incident_types_category_id_not_null" NOT NULL category_id;

alter table public."incident_types" add constraint "incident_types_id_not_null" NOT NULL id;

alter table public."incident_types" add constraint "incident_types_name_not_null" NOT NULL name;

alter table public."incident_types" add constraint "incident_types_pkey" PRIMARY KEY (id);

revoke all on table public."incident_types" from public, anon, authenticated, service_role;

grant DELETE on table public."incident_types" to "anon";

grant INSERT on table public."incident_types" to "anon";

grant SELECT on table public."incident_types" to "anon";

grant UPDATE on table public."incident_types" to "anon";

grant DELETE on table public."incident_types" to "authenticated";

grant INSERT on table public."incident_types" to "authenticated";

grant SELECT on table public."incident_types" to "authenticated";

grant UPDATE on table public."incident_types" to "authenticated";

grant DELETE on table public."incident_types" to "service_role";

grant INSERT on table public."incident_types" to "service_role";

grant MAINTAIN on table public."incident_types" to "service_role";

grant REFERENCES on table public."incident_types" to "service_role";

grant SELECT on table public."incident_types" to "service_role";

grant TRIGGER on table public."incident_types" to "service_role";

grant TRUNCATE on table public."incident_types" to "service_role";

grant UPDATE on table public."incident_types" to "service_role";

-- public.login_activities: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."login_activities" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "device" text not null,
  "location" text,
  "is_current" boolean default false not null,
  "created_at" timestamp with time zone default now() not null
);

alter table public."login_activities" add constraint "login_activities_created_at_not_null" NOT NULL created_at;

alter table public."login_activities" add constraint "login_activities_device_not_null" NOT NULL device;

alter table public."login_activities" add constraint "login_activities_id_not_null" NOT NULL id;

alter table public."login_activities" add constraint "login_activities_is_current_not_null" NOT NULL is_current;

alter table public."login_activities" add constraint "login_activities_pkey" PRIMARY KEY (id);

alter table public."login_activities" add constraint "login_activities_user_id_not_null" NOT NULL user_id;

CREATE INDEX login_activities_user ON public.login_activities USING btree (user_id);

CREATE INDEX login_activities_user_current ON public.login_activities USING btree (user_id, is_current);

alter table public."login_activities" enable row level security;

revoke all on table public."login_activities" from public, anon, authenticated, service_role;

grant DELETE on table public."login_activities" to "anon";

grant INSERT on table public."login_activities" to "anon";

grant SELECT on table public."login_activities" to "anon";

grant UPDATE on table public."login_activities" to "anon";

grant DELETE on table public."login_activities" to "authenticated";

grant INSERT on table public."login_activities" to "authenticated";

grant SELECT on table public."login_activities" to "authenticated";

grant UPDATE on table public."login_activities" to "authenticated";

grant DELETE on table public."login_activities" to "service_role";

grant INSERT on table public."login_activities" to "service_role";

grant MAINTAIN on table public."login_activities" to "service_role";

grant REFERENCES on table public."login_activities" to "service_role";

grant SELECT on table public."login_activities" to "service_role";

grant TRIGGER on table public."login_activities" to "service_role";

grant TRUNCATE on table public."login_activities" to "service_role";

grant UPDATE on table public."login_activities" to "service_role";

-- public.notification_nearby_incident: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."notification_nearby_incident" (
  "notification_id" uuid not null,
  "report_id" uuid,
  "distance_meters" numeric,
  "level" text default 'Moderate'::text not null
);

alter table public."notification_nearby_incident" add constraint "notification_nearby_incident_level_check" CHECK ((level = ANY (ARRAY['Low'::text, 'Moderate'::text, 'High'::text])));

alter table public."notification_nearby_incident" add constraint "notification_nearby_incident_level_not_null" NOT NULL level;

alter table public."notification_nearby_incident" add constraint "notification_nearby_incident_notification_id_not_null" NOT NULL notification_id;

alter table public."notification_nearby_incident" add constraint "notification_nearby_incident_pkey" PRIMARY KEY (notification_id);

alter table public."notification_nearby_incident" enable row level security;

revoke all on table public."notification_nearby_incident" from public, anon, authenticated, service_role;

grant DELETE on table public."notification_nearby_incident" to "anon";

grant INSERT on table public."notification_nearby_incident" to "anon";

grant SELECT on table public."notification_nearby_incident" to "anon";

grant UPDATE on table public."notification_nearby_incident" to "anon";

grant DELETE on table public."notification_nearby_incident" to "authenticated";

grant INSERT on table public."notification_nearby_incident" to "authenticated";

grant SELECT on table public."notification_nearby_incident" to "authenticated";

grant UPDATE on table public."notification_nearby_incident" to "authenticated";

grant DELETE on table public."notification_nearby_incident" to "service_role";

grant INSERT on table public."notification_nearby_incident" to "service_role";

grant MAINTAIN on table public."notification_nearby_incident" to "service_role";

grant REFERENCES on table public."notification_nearby_incident" to "service_role";

grant SELECT on table public."notification_nearby_incident" to "service_role";

grant TRIGGER on table public."notification_nearby_incident" to "service_role";

grant TRUNCATE on table public."notification_nearby_incident" to "service_role";

grant UPDATE on table public."notification_nearby_incident" to "service_role";

-- public.notification_report_status: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."notification_report_status" (
  "notification_id" uuid not null,
  "report_id" uuid,
  "location" text,
  "is_verified" boolean default false not null
);

alter table public."notification_report_status" add constraint "notification_report_status_is_verified_not_null" NOT NULL is_verified;

alter table public."notification_report_status" add constraint "notification_report_status_notification_id_not_null" NOT NULL notification_id;

alter table public."notification_report_status" add constraint "notification_report_status_pkey" PRIMARY KEY (notification_id);

alter table public."notification_report_status" enable row level security;

revoke all on table public."notification_report_status" from public, anon, authenticated, service_role;

grant DELETE on table public."notification_report_status" to "anon";

grant INSERT on table public."notification_report_status" to "anon";

grant SELECT on table public."notification_report_status" to "anon";

grant UPDATE on table public."notification_report_status" to "anon";

grant DELETE on table public."notification_report_status" to "authenticated";

grant INSERT on table public."notification_report_status" to "authenticated";

grant SELECT on table public."notification_report_status" to "authenticated";

grant UPDATE on table public."notification_report_status" to "authenticated";

grant DELETE on table public."notification_report_status" to "service_role";

grant INSERT on table public."notification_report_status" to "service_role";

grant MAINTAIN on table public."notification_report_status" to "service_role";

grant REFERENCES on table public."notification_report_status" to "service_role";

grant SELECT on table public."notification_report_status" to "service_role";

grant TRIGGER on table public."notification_report_status" to "service_role";

grant TRUNCATE on table public."notification_report_status" to "service_role";

grant UPDATE on table public."notification_report_status" to "service_role";

-- public.notification_types: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."notification_types" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "created_at" timestamp with time zone default now() not null
);

alter table public."notification_types" add constraint "notification_types_created_at_not_null" NOT NULL created_at;

alter table public."notification_types" add constraint "notification_types_id_not_null" NOT NULL id;

alter table public."notification_types" add constraint "notification_types_name_check" CHECK ((name = ANY (ARRAY['report_status'::text, 'nearby_incident'::text, 'admin_account'::text, 'report_submitted'::text, 'ai_validation'::text, 'report_approved'::text, 'system'::text, 'log'::text])));

alter table public."notification_types" add constraint "notification_types_name_key" UNIQUE (name);

alter table public."notification_types" add constraint "notification_types_name_not_null" NOT NULL name;

alter table public."notification_types" add constraint "notification_types_pkey" PRIMARY KEY (id);

revoke all on table public."notification_types" from public, anon, authenticated, service_role;

grant DELETE on table public."notification_types" to "anon";

grant INSERT on table public."notification_types" to "anon";

grant SELECT on table public."notification_types" to "anon";

grant UPDATE on table public."notification_types" to "anon";

grant DELETE on table public."notification_types" to "authenticated";

grant INSERT on table public."notification_types" to "authenticated";

grant SELECT on table public."notification_types" to "authenticated";

grant UPDATE on table public."notification_types" to "authenticated";

grant DELETE on table public."notification_types" to "service_role";

grant INSERT on table public."notification_types" to "service_role";

grant MAINTAIN on table public."notification_types" to "service_role";

grant REFERENCES on table public."notification_types" to "service_role";

grant SELECT on table public."notification_types" to "service_role";

grant TRIGGER on table public."notification_types" to "service_role";

grant TRUNCATE on table public."notification_types" to "service_role";

grant UPDATE on table public."notification_types" to "service_role";

-- public.notifications: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."notifications" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid,
  "type_id" uuid not null,
  "title" text not null,
  "message" text default ''::text not null,
  "priority" text default 'Low'::text not null,
  "is_read" boolean default false not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

alter table public."notifications" add constraint "notifications_created_at_not_null" NOT NULL created_at;

alter table public."notifications" add constraint "notifications_id_not_null" NOT NULL id;

alter table public."notifications" add constraint "notifications_is_read_not_null" NOT NULL is_read;

alter table public."notifications" add constraint "notifications_message_not_null" NOT NULL message;

alter table public."notifications" add constraint "notifications_pkey" PRIMARY KEY (id);

alter table public."notifications" add constraint "notifications_priority_check" CHECK ((priority = ANY (ARRAY['Low'::text, 'Medium'::text, 'High'::text])));

alter table public."notifications" add constraint "notifications_priority_not_null" NOT NULL priority;

alter table public."notifications" add constraint "notifications_title_not_null" NOT NULL title;

alter table public."notifications" add constraint "notifications_type_id_not_null" NOT NULL type_id;

alter table public."notifications" add constraint "notifications_updated_at_not_null" NOT NULL updated_at;

CREATE INDEX notifications_created ON public.notifications USING btree (created_at DESC);

CREATE INDEX notifications_user ON public.notifications USING btree (user_id);

CREATE INDEX notifications_user_read ON public.notifications USING btree (user_id, is_read);

alter table public."notifications" enable row level security;

revoke all on table public."notifications" from public, anon, authenticated, service_role;

grant DELETE on table public."notifications" to "anon";

grant INSERT on table public."notifications" to "anon";

grant SELECT on table public."notifications" to "anon";

grant UPDATE on table public."notifications" to "anon";

grant DELETE on table public."notifications" to "authenticated";

grant INSERT on table public."notifications" to "authenticated";

grant SELECT on table public."notifications" to "authenticated";

grant UPDATE on table public."notifications" to "authenticated";

grant DELETE on table public."notifications" to "service_role";

grant INSERT on table public."notifications" to "service_role";

grant MAINTAIN on table public."notifications" to "service_role";

grant REFERENCES on table public."notifications" to "service_role";

grant SELECT on table public."notifications" to "service_role";

grant TRIGGER on table public."notifications" to "service_role";

grant TRUNCATE on table public."notifications" to "service_role";

grant UPDATE on table public."notifications" to "service_role";

-- public.profiles: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."profiles" (
  "id" uuid not null,
  "first_name" text,
  "middle_name" text,
  "last_name" text,
  "fullname" text,
  "user_name" text,
  "role" text default 'user'::text not null,
  "phone" text,
  "birthdate" date,
  "location" text,
  "department" text,
  "notifications_enabled" boolean default true not null,
  "crime_alerts_enabled" boolean default true not null,
  "status" text default 'Active'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

alter table public."profiles" add constraint "profiles_created_at_not_null" NOT NULL created_at;

alter table public."profiles" add constraint "profiles_crime_alerts_enabled_not_null" NOT NULL crime_alerts_enabled;

alter table public."profiles" add constraint "profiles_id_not_null" NOT NULL id;

alter table public."profiles" add constraint "profiles_notifications_enabled_not_null" NOT NULL notifications_enabled;

alter table public."profiles" add constraint "profiles_pkey" PRIMARY KEY (id);

alter table public."profiles" add constraint "profiles_role_check" CHECK ((role = ANY (ARRAY['user'::text, 'admin'::text, 'super_admin'::text])));

alter table public."profiles" add constraint "profiles_role_not_null" NOT NULL role;

alter table public."profiles" add constraint "profiles_status_check" CHECK ((status = ANY (ARRAY['Active'::text, 'Disabled'::text])));

alter table public."profiles" add constraint "profiles_status_not_null" NOT NULL status;

alter table public."profiles" add constraint "profiles_updated_at_not_null" NOT NULL updated_at;

alter table public."profiles" enable row level security;

revoke all on table public."profiles" from public, anon, authenticated, service_role;

grant DELETE on table public."profiles" to "anon";

grant INSERT on table public."profiles" to "anon";

grant SELECT on table public."profiles" to "anon";

grant UPDATE on table public."profiles" to "anon";

grant DELETE on table public."profiles" to "authenticated";

grant INSERT on table public."profiles" to "authenticated";

grant SELECT on table public."profiles" to "authenticated";

grant UPDATE on table public."profiles" to "authenticated";

grant DELETE on table public."profiles" to "service_role";

grant INSERT on table public."profiles" to "service_role";

grant MAINTAIN on table public."profiles" to "service_role";

grant REFERENCES on table public."profiles" to "service_role";

grant SELECT on table public."profiles" to "service_role";

grant TRIGGER on table public."profiles" to "service_role";

grant TRUNCATE on table public."profiles" to "service_role";

grant UPDATE on table public."profiles" to "service_role";

-- public.report_comments: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."report_comments" (
  "id" uuid default gen_random_uuid() not null,
  "report_id" uuid not null,
  "user_id" uuid,
  "content" text not null,
  "created_at" timestamp with time zone default now() not null
);

alter table public."report_comments" add constraint "report_comments_content_not_null" NOT NULL content;

alter table public."report_comments" add constraint "report_comments_created_at_not_null" NOT NULL created_at;

alter table public."report_comments" add constraint "report_comments_id_not_null" NOT NULL id;

alter table public."report_comments" add constraint "report_comments_pkey" PRIMARY KEY (id);

alter table public."report_comments" add constraint "report_comments_report_id_not_null" NOT NULL report_id;

CREATE INDEX report_comments_report ON public.report_comments USING btree (report_id);

alter table public."report_comments" enable row level security;

revoke all on table public."report_comments" from public, anon, authenticated, service_role;

grant DELETE on table public."report_comments" to "anon";

grant INSERT on table public."report_comments" to "anon";

grant SELECT on table public."report_comments" to "anon";

grant UPDATE on table public."report_comments" to "anon";

grant DELETE on table public."report_comments" to "authenticated";

grant INSERT on table public."report_comments" to "authenticated";

grant SELECT on table public."report_comments" to "authenticated";

grant UPDATE on table public."report_comments" to "authenticated";

grant DELETE on table public."report_comments" to "service_role";

grant INSERT on table public."report_comments" to "service_role";

grant MAINTAIN on table public."report_comments" to "service_role";

grant REFERENCES on table public."report_comments" to "service_role";

grant SELECT on table public."report_comments" to "service_role";

grant TRIGGER on table public."report_comments" to "service_role";

grant TRUNCATE on table public."report_comments" to "service_role";

grant UPDATE on table public."report_comments" to "service_role";

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

-- public.report_images: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."report_images" (
  "id" uuid default gen_random_uuid() not null,
  "report_id" uuid not null,
  "image_url" text not null,
  "position" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null
);

alter table public."report_images" add constraint "report_images_created_at_not_null" NOT NULL created_at;

alter table public."report_images" add constraint "report_images_id_not_null" NOT NULL id;

alter table public."report_images" add constraint "report_images_image_url_not_null" NOT NULL image_url;

alter table public."report_images" add constraint "report_images_pkey" PRIMARY KEY (id);

alter table public."report_images" add constraint "report_images_position_not_null" NOT NULL "position";

alter table public."report_images" add constraint "report_images_report_id_not_null" NOT NULL report_id;

CREATE INDEX report_images_report ON public.report_images USING btree (report_id);

alter table public."report_images" enable row level security;

revoke all on table public."report_images" from public, anon, authenticated, service_role;

grant DELETE on table public."report_images" to "anon";

grant INSERT on table public."report_images" to "anon";

grant SELECT on table public."report_images" to "anon";

grant UPDATE on table public."report_images" to "anon";

grant DELETE on table public."report_images" to "authenticated";

grant INSERT on table public."report_images" to "authenticated";

grant SELECT on table public."report_images" to "authenticated";

grant UPDATE on table public."report_images" to "authenticated";

grant DELETE on table public."report_images" to "service_role";

grant INSERT on table public."report_images" to "service_role";

grant MAINTAIN on table public."report_images" to "service_role";

grant REFERENCES on table public."report_images" to "service_role";

grant SELECT on table public."report_images" to "service_role";

grant TRIGGER on table public."report_images" to "service_role";

grant TRUNCATE on table public."report_images" to "service_role";

grant UPDATE on table public."report_images" to "service_role";

-- public.report_likes: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."report_likes" (
  "report_id" uuid not null,
  "user_id" uuid not null,
  "created_at" timestamp with time zone default now() not null
);

alter table public."report_likes" add constraint "report_likes_created_at_not_null" NOT NULL created_at;

alter table public."report_likes" add constraint "report_likes_pkey" PRIMARY KEY (report_id, user_id);

alter table public."report_likes" add constraint "report_likes_report_id_not_null" NOT NULL report_id;

alter table public."report_likes" add constraint "report_likes_user_id_not_null" NOT NULL user_id;

alter table public."report_likes" enable row level security;

revoke all on table public."report_likes" from public, anon, authenticated, service_role;

grant DELETE on table public."report_likes" to "anon";

grant INSERT on table public."report_likes" to "anon";

grant SELECT on table public."report_likes" to "anon";

grant UPDATE on table public."report_likes" to "anon";

grant DELETE on table public."report_likes" to "authenticated";

grant INSERT on table public."report_likes" to "authenticated";

grant SELECT on table public."report_likes" to "authenticated";

grant UPDATE on table public."report_likes" to "authenticated";

grant DELETE on table public."report_likes" to "service_role";

grant INSERT on table public."report_likes" to "service_role";

grant MAINTAIN on table public."report_likes" to "service_role";

grant REFERENCES on table public."report_likes" to "service_role";

grant SELECT on table public."report_likes" to "service_role";

grant TRIGGER on table public."report_likes" to "service_role";

grant TRUNCATE on table public."report_likes" to "service_role";

grant UPDATE on table public."report_likes" to "service_role";

-- public.report_validations: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."report_validations" (
  "id" uuid default gen_random_uuid() not null,
  "report_id" uuid not null,
  "admin_id" uuid,
  "action" text not null,
  "previous_status" text,
  "new_status" text not null,
  "remarks" text default ''::text not null,
  "created_at" timestamp with time zone default now() not null
);

alter table public."report_validations" add constraint "report_validations_action_check" CHECK ((action = ANY (ARRAY['Under Verification'::text, 'Resolved'::text, 'Rejected'::text, 'Archived'::text, 'Marked Fake'::text])));

alter table public."report_validations" add constraint "report_validations_action_not_null" NOT NULL action;

alter table public."report_validations" add constraint "report_validations_created_at_not_null" NOT NULL created_at;

alter table public."report_validations" add constraint "report_validations_id_not_null" NOT NULL id;

alter table public."report_validations" add constraint "report_validations_new_status_not_null" NOT NULL new_status;

alter table public."report_validations" add constraint "report_validations_pkey" PRIMARY KEY (id);

alter table public."report_validations" add constraint "report_validations_remarks_not_null" NOT NULL remarks;

alter table public."report_validations" add constraint "report_validations_report_id_not_null" NOT NULL report_id;

CREATE INDEX report_validations_admin ON public.report_validations USING btree (admin_id);

CREATE INDEX report_validations_created ON public.report_validations USING btree (created_at DESC);

CREATE INDEX report_validations_report ON public.report_validations USING btree (report_id);

alter table public."report_validations" enable row level security;

revoke all on table public."report_validations" from public, anon, authenticated, service_role;

grant DELETE on table public."report_validations" to "anon";

grant INSERT on table public."report_validations" to "anon";

grant SELECT on table public."report_validations" to "anon";

grant UPDATE on table public."report_validations" to "anon";

grant DELETE on table public."report_validations" to "authenticated";

grant INSERT on table public."report_validations" to "authenticated";

grant SELECT on table public."report_validations" to "authenticated";

grant UPDATE on table public."report_validations" to "authenticated";

grant DELETE on table public."report_validations" to "service_role";

grant INSERT on table public."report_validations" to "service_role";

grant MAINTAIN on table public."report_validations" to "service_role";

grant REFERENCES on table public."report_validations" to "service_role";

grant SELECT on table public."report_validations" to "service_role";

grant TRIGGER on table public."report_validations" to "service_role";

grant TRUNCATE on table public."report_validations" to "service_role";

grant UPDATE on table public."report_validations" to "service_role";

-- public.reports: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."reports" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid,
  "incident_type_id" uuid,
  "location" text,
  "latitude" double precision,
  "longitude" double precision,
  "poster_name" text,
  "display_name_type" text default 'Username'::text not null,
  "details" text default ''::text not null,
  "status" text default 'Pending Review'::text not null,
  "is_verified" boolean default false not null,
  "role" text default 'user'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

alter table public."reports" add constraint "reports_created_at_not_null" NOT NULL created_at;

alter table public."reports" add constraint "reports_details_not_null" NOT NULL details;

alter table public."reports" add constraint "reports_display_name_type_check" CHECK ((display_name_type = ANY (ARRAY['Fullname'::text, 'Username'::text])));

alter table public."reports" add constraint "reports_display_name_type_not_null" NOT NULL display_name_type;

alter table public."reports" add constraint "reports_id_not_null" NOT NULL id;

alter table public."reports" add constraint "reports_is_verified_not_null" NOT NULL is_verified;

alter table public."reports" add constraint "reports_pkey" PRIMARY KEY (id);

alter table public."reports" add constraint "reports_role_check" CHECK ((role = ANY (ARRAY['user'::text, 'admin'::text, 'super_admin'::text])));

alter table public."reports" add constraint "reports_role_not_null" NOT NULL role;

alter table public."reports" add constraint "reports_status_check" CHECK ((status = ANY (ARRAY['Pending Review'::text, 'Under Verification'::text, 'Resolved'::text, 'Rejected'::text, 'Archived'::text, 'Marked Fake'::text])));

alter table public."reports" add constraint "reports_status_not_null" NOT NULL status;

alter table public."reports" add constraint "reports_updated_at_not_null" NOT NULL updated_at;

CREATE INDEX reports_archived_status ON public.reports USING btree (created_at DESC) WHERE (status = 'Archived'::text);

alter table public."reports" enable row level security;

revoke all on table public."reports" from public, anon, authenticated, service_role;

grant DELETE on table public."reports" to "anon";

grant INSERT on table public."reports" to "anon";

grant SELECT on table public."reports" to "anon";

grant UPDATE on table public."reports" to "anon";

grant DELETE on table public."reports" to "authenticated";

grant INSERT on table public."reports" to "authenticated";

grant SELECT on table public."reports" to "authenticated";

grant UPDATE on table public."reports" to "authenticated";

grant DELETE on table public."reports" to "service_role";

grant INSERT on table public."reports" to "service_role";

grant MAINTAIN on table public."reports" to "service_role";

grant REFERENCES on table public."reports" to "service_role";

grant SELECT on table public."reports" to "service_role";

grant TRIGGER on table public."reports" to "service_role";

grant TRUNCATE on table public."reports" to "service_role";

grant UPDATE on table public."reports" to "service_role";

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

-- public.sentiment_dataset_events: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."sentiment_dataset_events" (
  "id" uuid default gen_random_uuid() not null,
  "dataset_id" uuid not null,
  "actor_id" uuid,
  "actor_name" text not null,
  "action" text not null,
  "details" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null
);

alter table public."sentiment_dataset_events" add constraint "sentiment_dataset_events_action_not_null" NOT NULL action;

alter table public."sentiment_dataset_events" add constraint "sentiment_dataset_events_actor_name_not_null" NOT NULL actor_name;

alter table public."sentiment_dataset_events" add constraint "sentiment_dataset_events_created_at_not_null" NOT NULL created_at;

alter table public."sentiment_dataset_events" add constraint "sentiment_dataset_events_dataset_id_not_null" NOT NULL dataset_id;

alter table public."sentiment_dataset_events" add constraint "sentiment_dataset_events_details_not_null" NOT NULL details;

alter table public."sentiment_dataset_events" add constraint "sentiment_dataset_events_id_not_null" NOT NULL id;

alter table public."sentiment_dataset_events" add constraint "sentiment_dataset_events_pkey" PRIMARY KEY (id);

alter table public."sentiment_dataset_events" enable row level security;

revoke all on table public."sentiment_dataset_events" from public, anon, authenticated, service_role;

grant DELETE on table public."sentiment_dataset_events" to "service_role";

grant INSERT on table public."sentiment_dataset_events" to "service_role";

grant MAINTAIN on table public."sentiment_dataset_events" to "service_role";

grant REFERENCES on table public."sentiment_dataset_events" to "service_role";

grant SELECT on table public."sentiment_dataset_events" to "service_role";

grant TRIGGER on table public."sentiment_dataset_events" to "service_role";

grant TRUNCATE on table public."sentiment_dataset_events" to "service_role";

grant UPDATE on table public."sentiment_dataset_events" to "service_role";

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

-- public.sentiment_model_state: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."sentiment_model_state" (
  "id" integer not null,
  "generation" bigint default 0 not null,
  "data_revision" bigint default 0 not null,
  "active_job_id" uuid,
  "previous_job_id" uuid,
  "updated_at" timestamp with time zone default now() not null
);

alter table public."sentiment_model_state" add constraint "sentiment_model_state_data_revision_not_null" NOT NULL data_revision;

alter table public."sentiment_model_state" add constraint "sentiment_model_state_generation_not_null" NOT NULL generation;

alter table public."sentiment_model_state" add constraint "sentiment_model_state_id_check" CHECK ((id = 1));

alter table public."sentiment_model_state" add constraint "sentiment_model_state_id_not_null" NOT NULL id;

alter table public."sentiment_model_state" add constraint "sentiment_model_state_pkey" PRIMARY KEY (id);

alter table public."sentiment_model_state" add constraint "sentiment_model_state_updated_at_not_null" NOT NULL updated_at;

alter table public."sentiment_model_state" enable row level security;

revoke all on table public."sentiment_model_state" from public, anon, authenticated, service_role;

grant DELETE on table public."sentiment_model_state" to "service_role";

grant INSERT on table public."sentiment_model_state" to "service_role";

grant MAINTAIN on table public."sentiment_model_state" to "service_role";

grant REFERENCES on table public."sentiment_model_state" to "service_role";

grant SELECT on table public."sentiment_model_state" to "service_role";

grant TRIGGER on table public."sentiment_model_state" to "service_role";

grant TRUNCATE on table public."sentiment_model_state" to "service_role";

grant UPDATE on table public."sentiment_model_state" to "service_role";

-- public.sentiment_supporting_models: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."sentiment_supporting_models" (
  "id" uuid not null,
  "name" text not null,
  "status" text default 'disabled'::text not null,
  "artifact_manifest" jsonb not null,
  "routing_policy" jsonb default '{}'::jsonb not null,
  "metrics" jsonb not null,
  "datasets" jsonb default '[]'::jsonb not null,
  "use_count" bigint default 0 not null,
  "last_used_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "deleted_at" timestamp with time zone
);

alter table public."sentiment_supporting_models" add constraint "sentiment_supporting_models_artifact_manifest_not_null" NOT NULL artifact_manifest;

alter table public."sentiment_supporting_models" add constraint "sentiment_supporting_models_created_at_not_null" NOT NULL created_at;

alter table public."sentiment_supporting_models" add constraint "sentiment_supporting_models_datasets_not_null" NOT NULL datasets;

alter table public."sentiment_supporting_models" add constraint "sentiment_supporting_models_id_not_null" NOT NULL id;

alter table public."sentiment_supporting_models" add constraint "sentiment_supporting_models_metrics_not_null" NOT NULL metrics;

alter table public."sentiment_supporting_models" add constraint "sentiment_supporting_models_name_not_null" NOT NULL name;

alter table public."sentiment_supporting_models" add constraint "sentiment_supporting_models_pkey" PRIMARY KEY (id);

alter table public."sentiment_supporting_models" add constraint "sentiment_supporting_models_routing_policy_not_null" NOT NULL routing_policy;

alter table public."sentiment_supporting_models" add constraint "sentiment_supporting_models_status_check" CHECK ((status = ANY (ARRAY['disabled'::text, 'enabled'::text, 'archived'::text, 'deleted'::text])));

alter table public."sentiment_supporting_models" add constraint "sentiment_supporting_models_status_not_null" NOT NULL status;

alter table public."sentiment_supporting_models" add constraint "sentiment_supporting_models_updated_at_not_null" NOT NULL updated_at;

alter table public."sentiment_supporting_models" add constraint "sentiment_supporting_models_use_count_not_null" NOT NULL use_count;

alter table public."sentiment_supporting_models" enable row level security;

revoke all on table public."sentiment_supporting_models" from public, anon, authenticated, service_role;

grant DELETE on table public."sentiment_supporting_models" to "service_role";

grant INSERT on table public."sentiment_supporting_models" to "service_role";

grant MAINTAIN on table public."sentiment_supporting_models" to "service_role";

grant REFERENCES on table public."sentiment_supporting_models" to "service_role";

grant SELECT on table public."sentiment_supporting_models" to "service_role";

grant TRIGGER on table public."sentiment_supporting_models" to "service_role";

grant TRUNCATE on table public."sentiment_supporting_models" to "service_role";

grant UPDATE on table public."sentiment_supporting_models" to "service_role";

-- public.sentiment_supporting_settings: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."sentiment_supporting_settings" (
  "id" integer not null,
  "max_enabled" integer default 3 not null
);

alter table public."sentiment_supporting_settings" add constraint "sentiment_supporting_settings_id_check" CHECK ((id = 1));

alter table public."sentiment_supporting_settings" add constraint "sentiment_supporting_settings_id_not_null" NOT NULL id;

alter table public."sentiment_supporting_settings" add constraint "sentiment_supporting_settings_max_enabled_check" CHECK (((max_enabled >= 1) AND (max_enabled <= 3)));

alter table public."sentiment_supporting_settings" add constraint "sentiment_supporting_settings_max_enabled_not_null" NOT NULL max_enabled;

alter table public."sentiment_supporting_settings" add constraint "sentiment_supporting_settings_pkey" PRIMARY KEY (id);

alter table public."sentiment_supporting_settings" enable row level security;

revoke all on table public."sentiment_supporting_settings" from public, anon, authenticated, service_role;

grant DELETE on table public."sentiment_supporting_settings" to "service_role";

grant INSERT on table public."sentiment_supporting_settings" to "service_role";

grant MAINTAIN on table public."sentiment_supporting_settings" to "service_role";

grant REFERENCES on table public."sentiment_supporting_settings" to "service_role";

grant SELECT on table public."sentiment_supporting_settings" to "service_role";

grant TRIGGER on table public."sentiment_supporting_settings" to "service_role";

grant TRUNCATE on table public."sentiment_supporting_settings" to "service_role";

grant UPDATE on table public."sentiment_supporting_settings" to "service_role";

-- public.sentiment_training_events: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."sentiment_training_events" (
  "id" uuid default gen_random_uuid() not null,
  "job_id" uuid,
  "actor_id" uuid,
  "action" text not null,
  "details" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null
);

alter table public."sentiment_training_events" add constraint "sentiment_training_events_action_not_null" NOT NULL action;

alter table public."sentiment_training_events" add constraint "sentiment_training_events_created_at_not_null" NOT NULL created_at;

alter table public."sentiment_training_events" add constraint "sentiment_training_events_details_not_null" NOT NULL details;

alter table public."sentiment_training_events" add constraint "sentiment_training_events_id_not_null" NOT NULL id;

alter table public."sentiment_training_events" add constraint "sentiment_training_events_pkey" PRIMARY KEY (id);

alter table public."sentiment_training_events" enable row level security;

revoke all on table public."sentiment_training_events" from public, anon, authenticated, service_role;

grant DELETE on table public."sentiment_training_events" to "service_role";

grant INSERT on table public."sentiment_training_events" to "service_role";

grant MAINTAIN on table public."sentiment_training_events" to "service_role";

grant REFERENCES on table public."sentiment_training_events" to "service_role";

grant SELECT on table public."sentiment_training_events" to "service_role";

grant TRIGGER on table public."sentiment_training_events" to "service_role";

grant TRUNCATE on table public."sentiment_training_events" to "service_role";

grant UPDATE on table public."sentiment_training_events" to "service_role";

-- public.sentiment_training_jobs: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."sentiment_training_jobs" (
  "id" uuid default gen_random_uuid() not null,
  "status" text default 'queued'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "available_at" timestamp with time zone default (now() + '00:00:30'::interval) not null,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "lease_token" uuid,
  "lease_until" timestamp with time zone,
  "data_revision" bigint,
  "base_generation" bigint,
  "base_job_id" uuid,
  "snapshot" jsonb,
  "metrics" jsonb,
  "artifact_manifest" jsonb,
  "error" text,
  "training_mode" text default 'continue'::text not null,
  "training_languages" text[]
);

alter table public."sentiment_training_jobs" add constraint "sentiment_training_jobs_available_at_not_null" NOT NULL available_at;

alter table public."sentiment_training_jobs" add constraint "sentiment_training_jobs_created_at_not_null" NOT NULL created_at;

alter table public."sentiment_training_jobs" add constraint "sentiment_training_jobs_id_not_null" NOT NULL id;

alter table public."sentiment_training_jobs" add constraint "sentiment_training_jobs_pkey" PRIMARY KEY (id);

alter table public."sentiment_training_jobs" add constraint "sentiment_training_jobs_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'training'::text, 'evaluating'::text, 'ready'::text, 'failed'::text])));

alter table public."sentiment_training_jobs" add constraint "sentiment_training_jobs_status_not_null" NOT NULL status;

alter table public."sentiment_training_jobs" add constraint "sentiment_training_jobs_training_mode_check" CHECK ((training_mode = ANY (ARRAY['continue'::text, 'fresh'::text])));

alter table public."sentiment_training_jobs" add constraint "sentiment_training_jobs_training_mode_not_null" NOT NULL training_mode;

CREATE UNIQUE INDEX sentiment_one_queued_job ON public.sentiment_training_jobs USING btree ((true)) WHERE (status = 'queued'::text);

CREATE UNIQUE INDEX sentiment_one_running_job ON public.sentiment_training_jobs USING btree ((true)) WHERE (status = ANY (ARRAY['training'::text, 'evaluating'::text]));

alter table public."sentiment_training_jobs" enable row level security;

revoke all on table public."sentiment_training_jobs" from public, anon, authenticated, service_role;

grant DELETE on table public."sentiment_training_jobs" to "service_role";

grant INSERT on table public."sentiment_training_jobs" to "service_role";

grant MAINTAIN on table public."sentiment_training_jobs" to "service_role";

grant REFERENCES on table public."sentiment_training_jobs" to "service_role";

grant SELECT on table public."sentiment_training_jobs" to "service_role";

grant TRIGGER on table public."sentiment_training_jobs" to "service_role";

grant TRUNCATE on table public."sentiment_training_jobs" to "service_role";

grant UPDATE on table public."sentiment_training_jobs" to "service_role";

-- public.sentiment_training_samples: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."sentiment_training_samples" (
  "id" uuid default gen_random_uuid() not null,
  "dataset_id" uuid not null,
  "text" text not null,
  "language" text not null,
  "label" text not null,
  "text_key" text not null,
  "active" boolean default true not null
);

alter table public."sentiment_training_samples" add constraint "sentiment_training_samples_active_not_null" NOT NULL active;

alter table public."sentiment_training_samples" add constraint "sentiment_training_samples_dataset_id_not_null" NOT NULL dataset_id;

alter table public."sentiment_training_samples" add constraint "sentiment_training_samples_id_not_null" NOT NULL id;

alter table public."sentiment_training_samples" add constraint "sentiment_training_samples_label_check" CHECK ((label = ANY (ARRAY['positive'::text, 'neutral'::text, 'negative'::text])));

alter table public."sentiment_training_samples" add constraint "sentiment_training_samples_label_not_null" NOT NULL label;

alter table public."sentiment_training_samples" add constraint "sentiment_training_samples_language_check" CHECK ((language = ANY (ARRAY['english'::text, 'filipino'::text, 'cebuano'::text])));

alter table public."sentiment_training_samples" add constraint "sentiment_training_samples_language_not_null" NOT NULL language;

alter table public."sentiment_training_samples" add constraint "sentiment_training_samples_pkey" PRIMARY KEY (id);

alter table public."sentiment_training_samples" add constraint "sentiment_training_samples_text_check" CHECK (((char_length(text) >= 1) AND (char_length(text) <= 2000)));

alter table public."sentiment_training_samples" add constraint "sentiment_training_samples_text_key_check" CHECK ((text_key ~ '^[a-f0-9]{64}$'::text));

alter table public."sentiment_training_samples" add constraint "sentiment_training_samples_text_key_not_null" NOT NULL text_key;

alter table public."sentiment_training_samples" add constraint "sentiment_training_samples_text_not_null" NOT NULL text;

CREATE UNIQUE INDEX sentiment_training_active_key ON public.sentiment_training_samples USING btree (text_key) WHERE active;

CREATE INDEX sentiment_training_dataset_id ON public.sentiment_training_samples USING btree (dataset_id);

alter table public."sentiment_training_samples" enable row level security;

revoke all on table public."sentiment_training_samples" from public, anon, authenticated, service_role;

grant DELETE on table public."sentiment_training_samples" to "service_role";

grant INSERT on table public."sentiment_training_samples" to "service_role";

grant MAINTAIN on table public."sentiment_training_samples" to "service_role";

grant REFERENCES on table public."sentiment_training_samples" to "service_role";

grant SELECT on table public."sentiment_training_samples" to "service_role";

grant TRIGGER on table public."sentiment_training_samples" to "service_role";

grant TRUNCATE on table public."sentiment_training_samples" to "service_role";

grant UPDATE on table public."sentiment_training_samples" to "service_role";

-- public.system_settings: columns, local constraints, indexes, RLS and grants.

-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.

create table public."system_settings" (
  "key" text not null,
  "value" text default ''::text not null,
  "updated_at" timestamp with time zone default now() not null
);

alter table public."system_settings" add constraint "system_settings_key_not_null" NOT NULL key;

alter table public."system_settings" add constraint "system_settings_pkey" PRIMARY KEY (key);

alter table public."system_settings" add constraint "system_settings_updated_at_not_null" NOT NULL updated_at;

alter table public."system_settings" add constraint "system_settings_value_not_null" NOT NULL value;

alter table public."system_settings" enable row level security;

revoke all on table public."system_settings" from public, anon, authenticated, service_role;

grant DELETE on table public."system_settings" to "anon";

grant INSERT on table public."system_settings" to "anon";

grant SELECT on table public."system_settings" to "anon";

grant UPDATE on table public."system_settings" to "anon";

grant DELETE on table public."system_settings" to "authenticated";

grant INSERT on table public."system_settings" to "authenticated";

grant SELECT on table public."system_settings" to "authenticated";

grant UPDATE on table public."system_settings" to "authenticated";

grant DELETE on table public."system_settings" to "service_role";

grant INSERT on table public."system_settings" to "service_role";

grant MAINTAIN on table public."system_settings" to "service_role";

grant REFERENCES on table public."system_settings" to "service_role";

grant SELECT on table public."system_settings" to "service_role";

grant TRIGGER on table public."system_settings" to "service_role";

grant TRUNCATE on table public."system_settings" to "service_role";

grant UPDATE on table public."system_settings" to "service_role";

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

alter table public."user_credibility" add constraint "user_credibility_id_not_null" NOT NULL id;

alter table public."user_credibility" add constraint "user_credibility_level_check" CHECK (((level >= 0) AND (level <= 4)));

alter table public."user_credibility" add constraint "user_credibility_level_label_check" CHECK ((level_label = ANY (ARRAY['Suspended'::text, 'At risk'::text, 'Very Limited'::text, 'Limited'::text, 'All good'::text])));

alter table public."user_credibility" add constraint "user_credibility_level_label_not_null" NOT NULL level_label;

alter table public."user_credibility" add constraint "user_credibility_level_not_null" NOT NULL level;

alter table public."user_credibility" add constraint "user_credibility_pkey" PRIMARY KEY (id);

alter table public."user_credibility" add constraint "user_credibility_score_check" CHECK (((score >= (0)::numeric) AND (score <= (100)::numeric)));

alter table public."user_credibility" add constraint "user_credibility_score_not_null" NOT NULL score;

alter table public."user_credibility" add constraint "user_credibility_updated_at_not_null" NOT NULL updated_at;

alter table public."user_credibility" add constraint "user_credibility_user_id_key" UNIQUE (user_id);

alter table public."user_credibility" add constraint "user_credibility_user_id_not_null" NOT NULL user_id;

alter table public."user_credibility" enable row level security;

revoke all on table public."user_credibility" from public, anon, authenticated, service_role;

grant DELETE on table public."user_credibility" to "anon";

grant INSERT on table public."user_credibility" to "anon";

grant SELECT on table public."user_credibility" to "anon";

grant UPDATE on table public."user_credibility" to "anon";

grant DELETE on table public."user_credibility" to "authenticated";

grant INSERT on table public."user_credibility" to "authenticated";

grant SELECT on table public."user_credibility" to "authenticated";

grant UPDATE on table public."user_credibility" to "authenticated";

grant DELETE on table public."user_credibility" to "service_role";

grant INSERT on table public."user_credibility" to "service_role";

grant MAINTAIN on table public."user_credibility" to "service_role";

grant REFERENCES on table public."user_credibility" to "service_role";

grant SELECT on table public."user_credibility" to "service_role";

grant TRIGGER on table public."user_credibility" to "service_role";

grant TRUNCATE on table public."user_credibility" to "service_role";

grant UPDATE on table public."user_credibility" to "service_role";

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

alter table public."admin_announcement" add constraint "admin_announcement_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public."admin_posts" add constraint "admin_posts_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public."audit_logs" add constraint "audit_logs_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public."audit_logs" add constraint "audit_logs_report_id_fkey" FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE SET NULL;

alter table public."credibility_events" add constraint "credibility_events_report_id_fkey" FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE SET NULL;

alter table public."credibility_events" add constraint "credibility_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public."incident_types" add constraint "incident_types_category_id_fkey" FOREIGN KEY (category_id) REFERENCES incident_categories(id) ON DELETE CASCADE;

alter table public."login_activities" add constraint "login_activities_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public."notification_nearby_incident" add constraint "notification_nearby_incident_notification_id_fkey" FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE;

alter table public."notification_nearby_incident" add constraint "notification_nearby_incident_report_id_fkey" FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE SET NULL;

alter table public."notification_report_status" add constraint "notification_report_status_notification_id_fkey" FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE;

alter table public."notification_report_status" add constraint "notification_report_status_report_id_fkey" FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE SET NULL;

alter table public."notifications" add constraint "notifications_type_id_fkey" FOREIGN KEY (type_id) REFERENCES notification_types(id);

alter table public."notifications" add constraint "notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public."report_comments" add constraint "report_comments_report_id_fkey" FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE;

alter table public."report_comments" add constraint "report_comments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public."report_credibility_analysis" add constraint "report_credibility_analysis_report_id_fkey" FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE;

alter table public."report_images" add constraint "report_images_report_id_fkey" FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE;

alter table public."report_likes" add constraint "report_likes_report_id_fkey" FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE;

alter table public."report_likes" add constraint "report_likes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public."report_validations" add constraint "report_validations_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public."report_validations" add constraint "report_validations_report_id_fkey" FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE;

alter table public."reports" add constraint "reports_incident_type_id_fkey" FOREIGN KEY (incident_type_id) REFERENCES incident_types(id) ON DELETE SET NULL;

alter table public."reports" add constraint "reports_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public."sentiment_dataset_events" add constraint "sentiment_dataset_events_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public."sentiment_dataset_events" add constraint "sentiment_dataset_events_dataset_id_fkey" FOREIGN KEY (dataset_id) REFERENCES sentiment_datasets(id);

alter table public."sentiment_datasets" add constraint "sentiment_datasets_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public."sentiment_datasets" add constraint "sentiment_datasets_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public."sentiment_model_state" add constraint "sentiment_model_state_active_job_id_fkey" FOREIGN KEY (active_job_id) REFERENCES sentiment_training_jobs(id);

alter table public."sentiment_model_state" add constraint "sentiment_model_state_previous_job_id_fkey" FOREIGN KEY (previous_job_id) REFERENCES sentiment_training_jobs(id);

alter table public."sentiment_supporting_models" add constraint "sentiment_supporting_models_id_fkey" FOREIGN KEY (id) REFERENCES sentiment_training_jobs(id);

alter table public."sentiment_training_events" add constraint "sentiment_training_events_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public."sentiment_training_events" add constraint "sentiment_training_events_job_id_fkey" FOREIGN KEY (job_id) REFERENCES sentiment_training_jobs(id);

alter table public."sentiment_training_jobs" add constraint "sentiment_training_jobs_base_job_id_fkey" FOREIGN KEY (base_job_id) REFERENCES sentiment_training_jobs(id);

alter table public."sentiment_training_samples" add constraint "sentiment_training_samples_dataset_id_fkey" FOREIGN KEY (dataset_id) REFERENCES sentiment_datasets(id);

alter table public."user_credibility" add constraint "user_credibility_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public."user_terms_acceptance" add constraint "user_terms_acceptance_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Final functions and required private protocol helpers. Private helper grants remain revoked.

CREATE OR REPLACE FUNCTION public.cleanup_sentiment_analysis()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_table_name = 'reports' then
    delete from public.sentiment_analysis
    where subject_type = 'report' and subject_id = old.id;
  else
    delete from public.sentiment_analysis
    where subject_type = 'comment' and subject_id = old.id;
  end if;
  return old;
end;
$function$;

CREATE OR REPLACE FUNCTION public.current_user_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select role from public.profiles where id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION public.enqueue_sentiment_training(p_mode text DEFAULT 'continue'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare result uuid;
begin
  if p_mode is distinct from 'continue' and p_mode is distinct from 'fresh' then
    raise exception 'Training mode must be "continue" or "fresh"' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(72846102);
  select id into result from public.sentiment_training_jobs where status = 'queued' for update;
  if result is null then
    insert into public.sentiment_training_jobs (training_mode) values (p_mode) returning id into result;
    insert into public.sentiment_training_events(job_id, action) values (result, 'queued');
  else
    -- Coalesce approvals during a short debounce window. The snapshot is taken
    -- when a worker claims the job, not while an approval request is running.
    if p_mode = 'fresh' then
      update public.sentiment_training_jobs set training_mode = 'fresh' where id = result and training_mode is distinct from 'fresh';
    end if;
    update public.sentiment_training_jobs set available_at = least(created_at + interval '2 minutes', now() + interval '30 seconds') where id = result;
  end if;
  return result;
end $function$;

CREATE OR REPLACE FUNCTION public.handle_new_credibility()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.user_credibility (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, first_name, middle_name, last_name, user_name, role)
  values (
    new.id,
    new.raw_user_meta_data->>'firstName',
    new.raw_user_meta_data->>'middleName',
    new.raw_user_meta_data->>'lastName',
    coalesce(new.raw_user_meta_data->>'userName', new.raw_user_meta_data->>'name', ''),
    'user'
  );
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.manage_sentiment_dataset(p_actor uuid, p_action text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  actor public.profiles%rowtype;
  batch public.sentiment_datasets%rowtype;
  sample public.sentiment_training_samples%rowtype;
  item jsonb;
  result_id uuid;
  next_status text;
  note text;
begin
  select * into actor from public.profiles where id = p_actor;
  if actor.id is null or actor.role not in ('admin', 'super_admin') or actor.status = 'Disabled' then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  -- Serialize dataset mutations, including duplicate checks and review/export
  -- snapshots. A database uniqueness constraint provides an additional guard.
  perform pg_advisory_xact_lock(72846102);
  if p_action = 'submit' then
    if (p_payload->>'privacy_reviewed') is distinct from 'true' then raise exception 'Data review confirmation required' using errcode = '22023'; end if;
    if jsonb_typeof(p_payload->'rows') is distinct from 'array' or jsonb_array_length(p_payload->'rows') not between 1 and 1000 then
      raise exception 'Provide 1 to 1000 examples' using errcode = '22023';
    end if;
    insert into public.sentiment_datasets(name, source, created_by, created_by_name)
    values (p_payload->>'name', p_payload->>'source', p_actor, coalesce(actor.fullname, actor.user_name, 'Admin')) returning id into result_id;
    for item in select value from jsonb_array_elements(p_payload->'rows') loop
      insert into public.sentiment_training_samples(dataset_id, text, language, label, text_key)
      values (result_id, item->>'text', item->>'language', item->>'label', item->>'text_key');
    end loop;
    insert into public.sentiment_dataset_events(dataset_id, actor_id, actor_name, action, details)
    values (result_id, p_actor, coalesce(actor.fullname, actor.user_name, 'Admin'), 'submitted', jsonb_build_object('count', jsonb_array_length(p_payload->'rows'), 'source', p_payload->>'source', 'privacy_reviewed', true));
    return jsonb_build_object('id', result_id);
  end if;
  select * into batch from public.sentiment_datasets where id = (p_payload->>'dataset_id')::uuid for update;
  if batch.id is null then raise exception 'Dataset not found' using errcode = 'P0002'; end if;
  if (p_payload->>'version') is null or batch.version <> (p_payload->>'version')::integer then
    raise exception 'Dataset changed. Refresh and try again.' using errcode = '40001';
  end if;
  if p_action = 'export' then
    if actor.role <> 'super_admin' then raise exception 'Only super admins can export training data' using errcode = '42501'; end if;
    if batch.status <> 'approved' then raise exception 'Only approved datasets can be exported' using errcode = '22023'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('text', text, 'language', language, 'label', label) order by id), '[]'::jsonb)
      into item from public.sentiment_training_samples where dataset_id = batch.id and active;
    insert into public.sentiment_dataset_events(dataset_id, actor_id, actor_name, action, details)
      values (batch.id, p_actor, coalesce(actor.fullname, actor.user_name, 'Admin'), 'exported', jsonb_build_object('version', batch.version, 'count', jsonb_array_length(item), 'format', p_payload->>'format'));
    return jsonb_build_object('dataset_id', batch.id, 'version', batch.version, 'status', 'approved', 'samples', item);
  end if;
  if p_action = 'edit' then
    if batch.status <> 'pending' then raise exception 'Only pending examples can be edited' using errcode = '22023'; end if;
    if batch.created_by is distinct from p_actor and actor.role <> 'super_admin' then raise exception 'Only the submitter or super admin can edit' using errcode = '42501'; end if;
    select * into sample from public.sentiment_training_samples where id = (p_payload->>'sample_id')::uuid and dataset_id = batch.id for update;
    if sample.id is null then raise exception 'Example not found' using errcode = 'P0002'; end if;
    item := p_payload->'sample';
    update public.sentiment_training_samples set text = item->>'text', language = item->>'language', label = item->>'label', text_key = item->>'text_key' where id = sample.id;
    insert into public.sentiment_dataset_events(dataset_id, actor_id, actor_name, action, details)
    values (batch.id, p_actor, coalesce(actor.fullname, actor.user_name, 'Admin'), 'edited', jsonb_build_object('sample_id', sample.id, 'before', to_jsonb(sample), 'after', item));
  elsif p_action in ('approve', 'reject', 'archive') then
    note := coalesce(p_payload->>'note', '');
    if char_length(note) > 1000 then raise exception 'Review note is too long' using errcode = '22023'; end if;
    if p_action in ('approve', 'reject') then
      if actor.role <> 'super_admin' then raise exception 'Only super admins can review datasets' using errcode = '42501'; end if;
      if batch.status <> 'pending' then raise exception 'Only pending datasets can be reviewed' using errcode = '22023'; end if;
      if p_action = 'reject' and btrim(note) = '' then raise exception 'A rejection reason is required' using errcode = '22023'; end if;
    else
      if batch.status = 'archived' then raise exception 'Dataset is already archived' using errcode = '22023'; end if;
      if actor.role <> 'super_admin' and (batch.status <> 'pending' or batch.created_by is distinct from p_actor) then
        raise exception 'Only your own pending dataset can be archived' using errcode = '42501';
      end if;
    end if;
    next_status := case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else 'archived' end;
    update public.sentiment_datasets set status = next_status,
      reviewed_by = case when p_action = 'archive' then reviewed_by else p_actor end,
      review_note = case when p_action = 'archive' then review_note else note end
      where id = batch.id;
    update public.sentiment_training_samples set active = (next_status = 'approved') where dataset_id = batch.id;
    insert into public.sentiment_dataset_events(dataset_id, actor_id, actor_name, action, details)
    values (batch.id, p_actor, coalesce(actor.fullname, actor.user_name, 'Admin'), next_status, jsonb_build_object('from', batch.status, 'to', next_status, 'note', note));
  else
    raise exception 'Unsupported action' using errcode = '22023';
  end if;
  update public.sentiment_datasets set version = version + 1, updated_at = now() where id = batch.id;
  return jsonb_build_object('id', batch.id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.manage_sentiment_supporting_model(p_actor uuid, p_action text, p_model uuid, p_generation bigint, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare actor public.profiles%rowtype; model public.sentiment_supporting_models%rowtype;
  state public.sentiment_model_state%rowtype; cap integer; enabled integer; filename text;
begin
  if p_action <> 'enable' then return public.manage_sentiment_supporting_model_independent_legacy(p_actor,p_action,p_model,p_generation,p_payload); end if;
  select * into actor from public.profiles where id=p_actor;
  if actor.id is null or actor.role is distinct from 'super_admin' or actor.status is distinct from 'Active' then raise exception 'Super admin access required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(72846102);
  select * into state from public.sentiment_model_state where id=1 for update;
  if state.generation is distinct from p_generation then raise exception 'Model pool changed. Refresh first.' using errcode='40001'; end if;
  select * into model from public.sentiment_supporting_models where id=p_model for update;
  if model.id is null or model.status <> 'disabled' then raise exception 'Only a disabled model can be enabled' using errcode='22023'; end if;
  select max_enabled into cap from public.sentiment_supporting_settings where id=1;
  select count(*) into enabled from public.sentiment_supporting_models where status='enabled';
  if enabled>=cap then raise exception 'Enabled model limit reached. Disable another model first.' using errcode='22023'; end if;
  if (model.metrics->>'passed') is distinct from 'true' or not public.valid_sentiment_independent_policy(model.routing_policy) then
    raise exception 'Independent quality evaluation required. Retrain legacy candidates first.' using errcode='22023'; end if;
  foreach filename in array array['sentiment_english.onnx','sentiment_filipino.onnx','sentiment_cebuano.onnx','language_id.onnx'] loop
    if model.routing_policy->'builtin_hashes'->>filename is distinct from p_payload->'builtin_hashes'->>filename then
      raise exception 'Built-in fingerprint changed; re-evaluate routing compatibility.' using errcode='22023'; end if;
  end loop;
  update public.sentiment_supporting_models set status='enabled',updated_at=now() where id=p_model;
  update public.sentiment_model_state set generation=generation+1,updated_at=now() where id=1;
  insert into public.sentiment_training_events(job_id,actor_id,action,details) values(p_model,p_actor,'support_enable',jsonb_build_object('admission','independent-v1'));
  return jsonb_build_object('id',p_model);
end $function$;

CREATE OR REPLACE FUNCTION public.manage_sentiment_supporting_model_independent_legacy(p_actor uuid, p_action text, p_model uuid, p_generation bigint, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare actor public.profiles%rowtype; state public.sentiment_model_state%rowtype;
  model public.sentiment_supporting_models%rowtype; cap integer; enabled integer; language text; rule jsonb; filename text;
begin
  select * into actor from public.profiles where id=p_actor;
  if actor.id is null or actor.role is distinct from 'super_admin' or actor.status is distinct from 'Active' then raise exception 'Super admin access required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(72846102);
  select * into state from public.sentiment_model_state where id=1 for update;
  if p_generation is distinct from state.generation then raise exception 'Model pool changed. Refresh first.' using errcode='40001'; end if;
  select count(*) into enabled from public.sentiment_supporting_models where status='enabled';
  select max_enabled into cap from public.sentiment_supporting_settings where id=1;
  if p_action='set_limit' then
    cap := (p_payload->>'limit')::integer;
    if cap is null or cap not between 1 and 3 or enabled>cap then raise exception 'Limit must be 1–3 and cannot be below the enabled count' using errcode='22023'; end if;
    update public.sentiment_supporting_settings set max_enabled=cap where id=1;
  else
    select * into model from public.sentiment_supporting_models where id=p_model for update;
    if model.id is null or model.status='deleted' then raise exception 'Supporting model not found' using errcode='22023'; end if;
    if p_action='enable' then
      if model.status <> 'disabled' then raise exception 'Only a disabled model can be enabled' using errcode='22023'; end if;
      if enabled>=cap then raise exception 'Enabled model limit reached. Disable another model first.' using errcode='22023'; end if;
      if (model.metrics->>'passed') is distinct from 'true' or not public.valid_sentiment_pool_policy(model.routing_policy) then raise exception 'A passing model and verified fallback policy are required' using errcode='22023'; end if;
      foreach filename in array array['sentiment_english.onnx','sentiment_filipino.onnx','sentiment_cebuano.onnx','language_id.onnx'] loop
        if model.routing_policy->'builtin_hashes'->>filename is distinct from p_payload->'builtin_hashes'->>filename then
          raise exception 'Built-in model differs from the evaluated policy. Re-evaluate first.' using errcode='22023';
        end if;
      end loop;
      -- Full-pool validation must include exactly the currently enabled IDs.
      if coalesce((select jsonb_agg(id::text order by id::text) from public.sentiment_supporting_models where status='enabled'),'[]'::jsonb)
        is distinct from coalesce(model.routing_policy->'evaluated_pool_ids','[]'::jsonb) then
        raise exception 'Enabled pool differs from this model’s evaluated combination. Queue fresh evaluation.' using errcode='22023';
      end if;
      update public.sentiment_supporting_models set status='enabled',updated_at=now() where id=p_model;
    elsif p_action='disable' then
      if model.status <> 'enabled' then raise exception 'Only an enabled model can be disabled' using errcode='22023'; end if;
      update public.sentiment_supporting_models set status='disabled',updated_at=now() where id=p_model;
      -- Remove dependent combinations too; removing a disagreeing participant
      -- must not silently turn an unvalidated remaining vote into a result.
      loop
        update public.sentiment_supporting_models m set status='disabled',updated_at=now()
        where m.status='enabled' and exists(select 1 from jsonb_array_elements_text(m.routing_policy->'evaluated_pool_ids') dependency
          where not exists(select 1 from public.sentiment_supporting_models parent where parent.id::text=dependency and parent.status='enabled'));
        exit when not found;
      end loop;
    elsif p_action='archive' then
      if model.status <> 'disabled' then raise exception 'Disable the model before archiving' using errcode='22023'; end if;
      update public.sentiment_supporting_models set status='archived',updated_at=now() where id=p_model;
    elsif p_action='restore' then
      if model.status <> 'archived' then raise exception 'Only an archived model can be restored to disabled' using errcode='22023'; end if;
      update public.sentiment_supporting_models set status='disabled',updated_at=now() where id=p_model;
    elsif p_action='delete' then
      if model.status <> 'archived' then raise exception 'Archive the disabled model before deleting' using errcode='22023'; end if;
      if exists(select 1 from public.sentiment_training_jobs j where j.status in ('training','evaluating') and j.lease_until>now()
         and (j.base_job_id=p_model or j.snapshot->'supporting_models' @> jsonb_build_array(jsonb_build_object('id',p_model)))) then
        raise exception 'A live training/evaluation still references this model. Wait for it to finish.' using errcode='22023';
      end if;
      -- Logical permanent removal. Private artifacts/audit are retained so an
      -- in-flight inference cannot lose files. No blind storage deletion.
      update public.sentiment_supporting_models set status='deleted',deleted_at=now(),updated_at=now() where id=p_model;
    else raise exception 'Unsupported model action' using errcode='22023'; end if;
  end if;
  update public.sentiment_model_state set generation=generation+1,updated_at=now() where id=1;
  insert into public.sentiment_training_events(job_id,actor_id,action,details) values(p_model,p_actor,'support_'||p_action,p_payload-'builtin_hashes');
  return jsonb_build_object('id',p_model);
end $function$;

CREATE OR REPLACE FUNCTION public.manage_sentiment_training(p_actor uuid, p_action text, p_job uuid DEFAULT NULL::uuid, p_generation bigint DEFAULT NULL::bigint, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare actor public.profiles%rowtype; target uuid; selected text[]; ids uuid[];
begin
  select * into actor from public.profiles where id=p_actor;
  if actor.id is null or actor.role is distinct from 'super_admin' or actor.status is distinct from 'Active' then raise exception 'Super admin access required' using errcode='42501'; end if;
  if p_action <> 'queue' then raise exception 'Built-in models are permanent.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(72846102);
  if p_payload ? 'dataset_ids' then
    if jsonb_typeof(p_payload->'dataset_ids') <> 'array' or jsonb_array_length(p_payload->'dataset_ids')=0 then raise exception 'Select approved datasets.' using errcode='22023'; end if;
    select array_agg(value::uuid) into ids from jsonb_array_elements_text(p_payload->'dataset_ids');
    if exists(select 1 from unnest(ids) i where not exists(select 1 from public.sentiment_datasets d where d.id=i and d.status='approved')) then raise exception 'Only approved datasets can be selected.' using errcode='22023'; end if;
  else
    -- Scope new work from newly approved dataset versions, not baseline languages
    -- or older attempted uploads. Retry with no new approvals keeps the last scope.
    select array_agg(d.id) into ids from public.sentiment_datasets d where d.status='approved' and not exists(
      select 1 from public.sentiment_training_jobs j where j.status in ('ready','failed') and j.finished_at is not null
      and j.snapshot->'datasets' @> jsonb_build_array(jsonb_build_object('id',d.id,'version',d.version)));
    if ids is null then
      select training_languages into selected from public.sentiment_training_jobs
      where training_languages is not null order by created_at desc limit 1;
    end if;
  end if;
  select array_agg(distinct s.language order by s.language) into selected from public.sentiment_training_samples s
    join public.sentiment_datasets d on d.id=s.dataset_id where s.active and d.status='approved' and (ids is null or d.id=any(ids))
    and (selected is null or s.language=any(selected));
  if selected is null then raise exception 'Approve at least one training example before queueing.' using errcode='22023'; end if;
  target := public.enqueue_sentiment_training(coalesce(p_payload->>'mode','continue'));
  update public.sentiment_training_jobs set training_languages=selected where id=target;
  return jsonb_build_object('job_id',target,'requested_languages',selected);
end $function$;

CREATE OR REPLACE FUNCTION public.queue_approved_sentiment_training()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform pg_advisory_xact_lock(72846102);
  update public.sentiment_model_state set data_revision=data_revision+1 where id=1;
  insert into public.sentiment_dataset_events(dataset_id,actor_id,actor_name,action,details)
    values(new.id,new.reviewed_by,'Reviewed training pool','training_pool_updated',jsonb_build_object('reason',new.status,'automatic_training',false));
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.record_sentiment_support_usage(p_ids uuid[])
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.sentiment_supporting_models set use_count=use_count+1,last_used_at=now()
  where id=any(p_ids) and status <> 'deleted';
$function$;

CREATE OR REPLACE FUNCTION public.sentiment_training_capabilities()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object('continued_training',true,'automatic_activation',false,'supporting_pool',true,'fresh_candidates',true,
    'independent_admission',true,'manual_training',true,'manual_enable',true,'language_scoped_training',true);
$function$;

CREATE OR REPLACE FUNCTION public.sentiment_training_pool_summary()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with approved as (
    select s.*,d.version from public.sentiment_training_samples s
    join public.sentiment_datasets d on d.id=s.dataset_id where d.status='approved' and s.active
  ), pending as (
    select a.* from approved a where not exists (
      select 1 from public.sentiment_training_jobs j
      where (j.status='ready'
        or (j.status in ('training','evaluating') and j.lease_until>now())
        or (j.status='failed' and jsonb_typeof(j.metrics->'training')='object'))
      and j.snapshot->'datasets' @> jsonb_build_array(jsonb_build_object('id',a.dataset_id,'version',a.version))
    )
  ), distribution as (
    select language,jsonb_build_object('total',count(*),'negative',count(*) filter(where label='negative'),
      'neutral',count(*) filter(where label='neutral'),'positive',count(*) filter(where label='positive')) counts
    from pending group by language
  ), recent as (
    select d.id,d.name,d.version,d.updated_at approved_at,count(*) example_count,
      coalesce(p.fullname,p.user_name,'Super admin') approved_by
    from pending a join public.sentiment_datasets d on d.id=a.dataset_id
    left join public.profiles p on p.id=d.reviewed_by
    group by d.id,d.name,d.version,d.updated_at,p.fullname,p.user_name
    order by d.updated_at desc,d.id limit 10
  )
  select jsonb_build_object('queueSummaryVersion',1,
    'approvedExamples',(select count(*) from approved),
    'approvedDatasets',(select count(*) from public.sentiment_datasets where status='approved'),
    'pendingDatasets',(select count(*) from public.sentiment_datasets where status='pending'),
    'newExamples',(select count(*) from pending),
    'readyToQueueExamples',(select count(*) from pending),
    'readyToQueueDatasets',(select count(distinct dataset_id) from pending),
    'languages',coalesce((select jsonb_object_agg(language,counts) from distribution),'{}'::jsonb),
    'readyDatasets',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'version',version,
      'exampleCount',example_count,'approvedAt',approved_at,'approvedBy',approved_by)
      order by approved_at desc,id) from recent),'[]'::jsonb));
$function$;

CREATE OR REPLACE FUNCTION public.sentiment_training_worker(p_action text, p_job uuid DEFAULT NULL::uuid, p_lease uuid DEFAULT NULL::uuid, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare job public.sentiment_training_jobs%rowtype; state public.sentiment_model_state%rowtype;
  result jsonb; policy jsonb; manifest jsonb; filename text; file jsonb; language text; qualified text[]; required text[];
begin
  -- protocol: supporting-pool-v1; protocol: supporting-pool-v2; admission: independent-v1; language-scope-v1
  if p_action='capabilities' then return public.sentiment_training_capabilities(); end if;
  perform pg_advisory_xact_lock(72846102);
  if p_action='claim' then
    if p_payload->>'language_scope_protocol' is distinct from '1' then raise exception 'Updated language-scoped worker required. Restart the worker.' using errcode='22023'; end if;
    result := public.sentiment_training_worker_scope_legacy(p_action,p_job,p_lease,p_payload);
    if result is null then return null; end if;
    select * into job from public.sentiment_training_jobs where id=(result->>'id')::uuid;
    if job.training_languages is null then
      select array_agg(distinct s->>'language' order by s->>'language') into job.training_languages from jsonb_array_elements(job.snapshot->'samples') s;
    end if;
    if job.training_languages is null or cardinality(job.training_languages) not between 1 and 3 or exists(
      select 1 from unnest(job.training_languages) l where l not in ('cebuano','english','filipino') or
      not exists(select 1 from jsonb_array_elements(job.snapshot->'samples') s where s->>'language'=l)) then
      raise exception 'Training scope no longer has approved examples; queue a new run.' using errcode='22023'; end if;
    update public.sentiment_training_jobs set training_languages=job.training_languages,
      snapshot=snapshot || jsonb_build_object('scope_version',1,'requested_languages',job.training_languages)
      where id=job.id returning * into job;
    return to_jsonb(job);
  end if;
  if p_action <> 'complete' then return public.sentiment_training_worker_scope_legacy(p_action,p_job,p_lease,p_payload); end if;
  select * into job from public.sentiment_training_jobs where id=p_job for update;
  if job.id is null or job.status <> 'evaluating' or job.lease_token is distinct from p_lease or job.lease_until is null or job.lease_until<now() then raise exception 'Training lease is stale or invalid' using errcode='40001'; end if;
  select * into state from public.sentiment_model_state where id=1 for update;
  if state.active_job_id is not null or job.data_revision is distinct from state.data_revision then raise exception 'Approved data changed during evaluation' using errcode='40001'; end if;
  policy := p_payload->'metrics'->'routing_policy'; manifest := p_payload->'manifest';
  if job.snapshot->'scope_version' is distinct from '1'::jsonb or policy->'scope_version' is distinct from '1'::jsonb
    or policy->'requested_languages' is distinct from job.snapshot->'requested_languages'
    or p_payload->'metrics'->'requested_languages' is distinct from job.snapshot->'requested_languages'
    or (p_payload->'metrics'->>'admission') is distinct from 'independent-v1'
    or (p_payload->'metrics'->>'passed') is distinct from 'true' or (p_payload->'metrics'->>'pool_protocol') is distinct from '1'
    or p_payload->'metrics'->>'training_mode' is distinct from job.training_mode
    or not public.valid_sentiment_independent_policy(policy) or policy->'builtin_hashes' is distinct from job.snapshot->'builtin_hashes' then
    raise exception 'Valid language-scoped held-out quality evidence required' using errcode='22023'; end if;
  select array_agg(key order by key) into qualified from jsonb_object_keys(policy->'languages') key;
  if manifest->'languages' is distinct from to_jsonb(qualified) or p_payload->'metrics'->'qualified_languages' is distinct from to_jsonb(qualified) then raise exception 'Qualified languages and artifacts differ' using errcode='22023'; end if;
  required := array['language_id.onnx'];
  foreach language in array qualified loop required := required || array['sentiment_'||language||'.onnx','sentiment_'||language||'.joblib']; end loop;
  foreach filename in array required loop
    file := case when filename like '%.joblib' then manifest->'training_files'->filename else manifest->'files'->filename end;
    if file is null or coalesce(file->>'sha256','') !~ '^[a-f0-9]{64}$' or coalesce((file->>'size')::bigint,0) not between 1 and 104857600
      or file->>'path' is distinct from job.id::text||'/'||job.lease_token::text||'/'||filename then raise exception 'Complete qualified-language artifacts required' using errcode='22023'; end if;
  end loop;
  if (select count(*) from jsonb_object_keys(manifest->'files')) <> cardinality(qualified)+1 or
     (select count(*) from jsonb_object_keys(manifest->'training_files')) <> cardinality(qualified) then raise exception 'Unexpected unqualified artifacts' using errcode='22023'; end if;
  update public.sentiment_training_jobs set status='ready',metrics=p_payload->'metrics',artifact_manifest=manifest,finished_at=now(),lease_until=null where id=job.id;
  insert into public.sentiment_supporting_models(id,name,status,artifact_manifest,routing_policy,metrics,datasets)
    values(job.id,'Supporting model '||left(job.id::text,8),'disabled',manifest,policy,p_payload->'metrics',coalesce(job.snapshot->'datasets','[]'::jsonb));
  update public.sentiment_model_state set generation=generation+1,updated_at=now() where id=1;
  insert into public.sentiment_training_events(job_id,action,details) values(job.id,'support_registered',jsonb_build_object('qualified_languages',qualified,'enabled',false,'manual_review_required',true));
  return jsonb_build_object('id',job.id,'qualified_languages',qualified,'support_enabled',false,'built_in_unchanged',true);
end $function$;

CREATE OR REPLACE FUNCTION public.sentiment_training_worker_independent_legacy(p_action text, p_job uuid DEFAULT NULL::uuid, p_lease uuid DEFAULT NULL::uuid, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare job public.sentiment_training_jobs%rowtype; state public.sentiment_model_state%rowtype;
  result jsonb; manifest jsonb; policy jsonb; filename text; file jsonb; cap integer; enabled integer; auto_enable boolean;
begin
  -- protocol: supporting-pool-v1
  -- protocol: supporting-pool-v2
  if p_action='capabilities' then return public.sentiment_training_capabilities(); end if;
  perform pg_advisory_xact_lock(72846102);
  if p_action='claim' then
    if (p_payload->>'pool_protocol') is distinct from '1' then raise exception 'Updated supporting-pool worker required' using errcode='22023'; end if;
    if (p_payload->>'worker_protocol') is distinct from 'supporting-pool-v2' then raise exception 'Updated fresh-candidate worker required. Restart the worker after applying sentiment_fresh_candidates.sql.' using errcode='22023'; end if;
    foreach filename in array array['sentiment_english.onnx','sentiment_filipino.onnx','sentiment_cebuano.onnx','language_id.onnx'] loop
      if coalesce(p_payload->'builtin_hashes'->>filename,'') !~ '^[a-f0-9]{64}$' then raise exception 'Built-in hashes required' using errcode='22023'; end if;
    end loop;
    if exists(select 1 from public.sentiment_model_state where active_job_id is not null) then raise exception 'Legacy primary pointer must be cleared by the pool migration' using errcode='22023'; end if;
    result := public.sentiment_training_worker_pool_legacy(p_action,p_job,p_lease,p_payload);
    if result is null then return null; end if;
    update public.sentiment_training_jobs set base_job_id=null,
      snapshot=snapshot || jsonb_build_object('pool_protocol',1,'builtin_hashes',p_payload->'builtin_hashes',
        'supporting_models',coalesce((select jsonb_agg(jsonb_build_object('id',id,'artifact_manifest',artifact_manifest,'routing_policy',routing_policy) order by id)
          from public.sentiment_supporting_models where status='enabled'),'[]'::jsonb))
      where id=(result->>'id')::uuid returning * into job;
    return to_jsonb(job);
  end if;
  if p_action <> 'complete' then return public.sentiment_training_worker_pool_legacy(p_action,p_job,p_lease,p_payload); end if;
  select * into job from public.sentiment_training_jobs where id=p_job for update;
  if job.id is null or job.status <> 'evaluating' or job.lease_token is distinct from p_lease or job.lease_until is null or job.lease_until<now() then
    raise exception 'Training lease is stale or invalid' using errcode='40001';
  end if;
  select * into state from public.sentiment_model_state where id=1 for update;
  if state.active_job_id is not null or job.base_generation is distinct from state.generation or job.data_revision is distinct from state.data_revision then
    raise exception 'Pool or approved data changed during evaluation' using errcode='40001';
  end if;
  if (p_payload->'metrics'->>'passed') is distinct from 'true' or
     (p_payload->'metrics'->>'pool_protocol') is distinct from '1' or
     (job.snapshot->>'pool_protocol') is distinct from '1' then
    raise exception 'A passing supporting-pool evaluation is required' using errcode='22023';
  end if;
  -- Fresh jobs must carry fresh-training evidence from an updated worker;
  -- continue jobs may omit it (outdated workers default to continued training).
  if coalesce(job.training_mode,'continue') = 'fresh' then
    if (p_payload->'metrics'->>'training_mode') is distinct from 'fresh' then
      raise exception 'Fresh training evidence required. Restart the worker and queue this job again.' using errcode='22023';
    end if;
  elsif (p_payload->'metrics'->>'training_mode') is not null and (p_payload->'metrics'->>'training_mode') is distinct from coalesce(job.training_mode,'continue') then
    raise exception 'Training mode mismatch between job and worker' using errcode='22023';
  end if;
  manifest := p_payload->'manifest';
  foreach filename in array array['sentiment_english.onnx','sentiment_filipino.onnx','sentiment_cebuano.onnx','language_id.onnx','sentiment_english.joblib','sentiment_filipino.joblib','sentiment_cebuano.joblib'] loop
    file := case when filename like '%.joblib' then manifest->'training_files'->filename else manifest->'files'->filename end;
    if file is null or coalesce(file->>'sha256','') !~ '^[a-f0-9]{64}$' or coalesce((file->>'size')::bigint,0) not between 1 and 104857600
      or (file->>'path') is distinct from (job.id::text||'/'||job.lease_token::text||'/'||filename) then
      raise exception 'Complete checked inference/training artifacts required' using errcode='22023';
    end if;
  end loop;
  policy := coalesce(p_payload->'metrics'->'routing_policy','{}'::jsonb);
  if policy->'builtin_hashes' is distinct from job.snapshot->'builtin_hashes' then raise exception 'Built-in fingerprint differs' using errcode='22023'; end if;
  select max_enabled into cap from public.sentiment_supporting_settings where id=1;
  select count(*) into enabled from public.sentiment_supporting_models where status='enabled';
  auto_enable := public.valid_sentiment_pool_policy(policy) and enabled<cap;
  if auto_enable and coalesce(policy->'evaluated_pool_ids','[]'::jsonb) is distinct from
     coalesce((select jsonb_agg(id::text order by id::text) from public.sentiment_supporting_models where status='enabled'),'[]'::jsonb) then
    raise exception 'Evaluated pool does not match enabled models' using errcode='40001';
  end if;
  update public.sentiment_training_jobs set status='ready',metrics=p_payload->'metrics',artifact_manifest=manifest,finished_at=now(),lease_until=null where id=job.id;
  insert into public.sentiment_supporting_models(id,name,status,artifact_manifest,routing_policy,metrics,datasets)
    values(job.id,'Supporting model '||left(job.id::text,8),case when coalesce(auto_enable,false) then 'enabled' else 'disabled' end,
      manifest,policy,p_payload->'metrics',coalesce(job.snapshot->'datasets','[]'::jsonb));
  update public.sentiment_model_state set generation=generation+1,active_job_id=null,previous_job_id=null,updated_at=now() where id=1;
  insert into public.sentiment_training_events(job_id,action,details) values(job.id,'support_registered',jsonb_build_object('enabled',coalesce(auto_enable,false),'built_in_unchanged',true));
  return jsonb_build_object('id',job.id,'support_enabled',coalesce(auto_enable,false),'built_in_unchanged',true);
end $function$;

CREATE OR REPLACE FUNCTION public.sentiment_training_worker_pool_legacy(p_action text, p_job uuid DEFAULT NULL::uuid, p_lease uuid DEFAULT NULL::uuid, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  job public.sentiment_training_jobs%rowtype;
  state public.sentiment_model_state%rowtype;
  inputs jsonb;
  filename text;
  file jsonb;
begin
  -- protocol: continued-training-v1
  if p_action = 'capabilities' then
    return jsonb_build_object('continued_training', true, 'automatic_activation', true);
  end if;
  perform pg_advisory_xact_lock(72846102);
  if p_action = 'claim' then
    update public.sentiment_training_jobs set status = 'failed', error = 'Worker lease expired. Queue a retry.', finished_at = now()
      where status in ('training','evaluating') and lease_until < now();
    if exists (select 1 from public.sentiment_training_jobs where status in ('training','evaluating')) then return null; end if;
    select * into job from public.sentiment_training_jobs where status = 'queued' and available_at <= now() order by created_at limit 1 for update;
    if job.id is null then return null; end if;
    select * into state from public.sentiment_model_state where id = 1;
    if (select count(*) from (select 1 from public.sentiment_training_samples s join public.sentiment_datasets d on d.id = s.dataset_id where d.status = 'approved' and s.active limit 50001) pool) > 50000 then
      update public.sentiment_training_jobs set status='failed', error='Approved pool exceeds the 50,000-example worker limit.', finished_at=now() where id=job.id;
      return null;
    end if;
    select jsonb_build_object(
      'datasets', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'version', version) order by id) from public.sentiment_datasets where status = 'approved'), '[]'::jsonb),
      'samples', coalesce((select jsonb_agg(jsonb_build_object('text', s.text, 'language', s.language, 'label', s.label) order by s.id)
        from public.sentiment_training_samples s join public.sentiment_datasets d on d.id = s.dataset_id where d.status = 'approved' and s.active), '[]'::jsonb)
    ) into inputs;
    update public.sentiment_training_jobs set status='training', started_at=now(), lease_token=gen_random_uuid(), lease_until=now()+interval '5 minutes',
      snapshot=inputs, data_revision=state.data_revision, base_generation=state.generation, base_job_id=state.active_job_id
      where id=job.id returning * into job;
    insert into public.sentiment_training_events(job_id, action) values (job.id, 'training');
    return to_jsonb(job);
  end if;
  select * into job from public.sentiment_training_jobs where id=p_job for update;
  if job.id is null or job.status not in ('training','evaluating') or job.lease_token is distinct from p_lease or job.lease_until < now() then
    raise exception 'Training lease is stale or invalid' using errcode='40001';
  end if;
  if p_action = 'heartbeat' then
    update public.sentiment_training_jobs set lease_until=now()+interval '5 minutes' where id=job.id;
  elsif p_action = 'evaluating' then
    update public.sentiment_training_jobs set status='evaluating', lease_until=now()+interval '5 minutes' where id=job.id;
  elsif p_action = 'fail' then
    update public.sentiment_training_jobs set status='failed', error=left(coalesce(p_payload->>'error','Training failed'),1000), metrics=p_payload->'metrics', finished_at=now(), lease_until=null where id=job.id;
  elsif p_action = 'complete' then
    if job.status <> 'evaluating' or (p_payload->'metrics'->>'passed') is distinct from 'true' then
      raise exception 'A passing evaluation is required' using errcode='22023';
    end if;
    if (p_payload->'metrics'->'training'->>'mode') is distinct from 'continued' then
      raise exception 'Updated continued-training worker required. Cold-trained bundles cannot auto-activate.' using errcode='22023';
    end if;
    foreach filename in array array['sentiment_english.onnx','sentiment_filipino.onnx','sentiment_cebuano.onnx','language_id.onnx'] loop
      file := p_payload->'manifest'->'files'->filename;
      if file is null or coalesce(file->>'sha256','') !~ '^[a-f0-9]{64}$' or coalesce((file->>'size')::bigint,0) not between 1 and 104857600
        or (file->>'path') is distinct from (job.id::text || '/' || job.lease_token::text || '/' || filename) then
        raise exception 'Incomplete or invalid model manifest' using errcode='22023';
      end if;
    end loop;
    foreach filename in array array['sentiment_english.joblib','sentiment_filipino.joblib','sentiment_cebuano.joblib'] loop
      file := p_payload->'manifest'->'training_files'->filename;
      if file is null or coalesce(file->>'sha256','') !~ '^[a-f0-9]{64}$' or coalesce((file->>'size')::bigint,0) not between 1 and 104857600
        or (file->>'path') is distinct from (job.id::text || '/' || job.lease_token::text || '/' || filename) then
        raise exception 'Complete checksummed training state is required' using errcode='22023';
      end if;
    end loop;
    select * into state from public.sentiment_model_state where id=1 for update;
    if job.base_generation is distinct from state.generation or job.base_job_id is distinct from state.active_job_id
      or job.data_revision is distinct from state.data_revision then
      raise exception 'Training result is stale. New approved data or model state must be trained first.' using errcode='40001';
    end if;
    -- Publish and switch the pointer in ONE transaction. A failure anywhere
    -- leaves both the old pointer and the candidate job unchanged.
    update public.sentiment_training_jobs set status='ready', metrics=p_payload->'metrics', artifact_manifest=p_payload->'manifest',
      finished_at=now(), lease_until=null where id=job.id;
    update public.sentiment_model_state set previous_job_id=state.active_job_id, active_job_id=job.id,
      generation=generation+1, updated_at=now() where id=1;
    insert into public.sentiment_training_events(job_id, action, details)
      values (job.id, 'auto_activate', jsonb_build_object('previous_job_id',state.active_job_id,'previous_generation',state.generation,'mode','continued'));
  else
    raise exception 'Unsupported worker action' using errcode='22023';
  end if;
  if p_action <> 'heartbeat' then insert into public.sentiment_training_events(job_id, action) values (job.id,p_action); end if;
  return jsonb_build_object('id',job.id,'auto_activated',p_action='complete');
end $function$;

CREATE OR REPLACE FUNCTION public.sentiment_training_worker_scope_legacy(p_action text, p_job uuid DEFAULT NULL::uuid, p_lease uuid DEFAULT NULL::uuid, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare job public.sentiment_training_jobs%rowtype; state public.sentiment_model_state%rowtype;
  result jsonb; policy jsonb; manifest jsonb; filename text; file jsonb;
begin
  -- protocol: supporting-pool-v1; protocol: supporting-pool-v2; admission: independent-v1
  if p_action='capabilities' then return public.sentiment_training_capabilities(); end if;
  perform pg_advisory_xact_lock(72846102);
  if p_action='claim' then
    if (p_payload->>'admission_protocol') is distinct from 'independent-v1' then
      raise exception 'Updated independent-quality worker required. Restart the worker.' using errcode='22023'; end if;
    result := public.sentiment_training_worker_independent_legacy(p_action,p_job,p_lease,p_payload);
    if result is null then return null; end if;
    update public.sentiment_training_jobs set snapshot=snapshot || jsonb_build_object('admission','independent-v1','supporting_models','[]'::jsonb)
      where id=(result->>'id')::uuid returning * into job;
    return to_jsonb(job);
  end if;
  if p_action <> 'complete' then return public.sentiment_training_worker_independent_legacy(p_action,p_job,p_lease,p_payload); end if;
  select * into job from public.sentiment_training_jobs where id=p_job for update;
  if job.id is null or job.status <> 'evaluating' or job.lease_token is distinct from p_lease or job.lease_until is null or job.lease_until<now() then
    raise exception 'Training lease is stale or invalid' using errcode='40001'; end if;
  select * into state from public.sentiment_model_state where id=1 for update;
  if state.active_job_id is not null or job.data_revision is distinct from state.data_revision then
    raise exception 'Approved data changed during evaluation' using errcode='40001'; end if;
  if (job.snapshot->>'admission') is distinct from 'independent-v1' or (p_payload->'metrics'->>'admission') is distinct from 'independent-v1'
    or (p_payload->'metrics'->>'pool_protocol') is distinct from '1' or (p_payload->'metrics'->>'passed') is distinct from 'true'
    or (p_payload->'metrics'->>'training_mode') is distinct from job.training_mode then
    raise exception 'Independent held-out evaluation and matching training evidence required' using errcode='22023'; end if;
  policy := p_payload->'metrics'->'routing_policy';
  if not public.valid_sentiment_independent_policy(policy) or policy->'builtin_hashes' is distinct from job.snapshot->'builtin_hashes' then
    raise exception 'Independent quality evidence or built-in fingerprint invalid' using errcode='22023'; end if;
  manifest := p_payload->'manifest';
  foreach filename in array array['sentiment_english.onnx','sentiment_filipino.onnx','sentiment_cebuano.onnx','language_id.onnx','sentiment_english.joblib','sentiment_filipino.joblib','sentiment_cebuano.joblib'] loop
    file := case when filename like '%.joblib' then manifest->'training_files'->filename else manifest->'files'->filename end;
    if file is null or coalesce(file->>'sha256','') !~ '^[a-f0-9]{64}$' or coalesce((file->>'size')::bigint,0) not between 1 and 104857600
      or file->>'path' is distinct from job.id::text||'/'||job.lease_token::text||'/'||filename then
      raise exception 'Complete checked inference/training artifacts required' using errcode='22023'; end if;
  end loop;
  update public.sentiment_training_jobs set status='ready',metrics=p_payload->'metrics',artifact_manifest=manifest,finished_at=now(),lease_until=null where id=job.id;
  insert into public.sentiment_supporting_models(id,name,status,artifact_manifest,routing_policy,metrics,datasets)
    values(job.id,'Supporting model '||left(job.id::text,8),'disabled',manifest,policy,p_payload->'metrics',coalesce(job.snapshot->'datasets','[]'::jsonb));
  update public.sentiment_model_state set generation=generation+1,updated_at=now() where id=1;
  insert into public.sentiment_training_events(job_id,action,details) values(job.id,'support_registered',jsonb_build_object('enabled',false,'manual_review_required',true,'built_in_unchanged',true));
  return jsonb_build_object('id',job.id,'support_enabled',false,'manual_review_required',true,'built_in_unchanged',true);
end $function$;

CREATE OR REPLACE FUNCTION public.set_credibility_level()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.score = 100 then
    new.level := 4;
    new.level_label := 'All good';
  elsif new.score >= 60 then
    new.level := 3;
    new.level_label := 'Limited';
  elsif new.score >= 40 then
    new.level := 2;
    new.level_label := 'Very Limited';
  elsif new.score >= 20 then
    new.level := 1;
    new.level_label := 'At risk';
  else
    new.level := 0;
    new.level_label := 'Suspended';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_fullname()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.fullname = nullif(btrim(concat_ws(' ', nullif(new.first_name, ''), nullif(new.middle_name, ''), nullif(new.last_name, ''))), '');
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_sentiment_analysis_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.valid_sentiment_independent_metrics(m jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare label text; c jsonb;
begin
  if jsonb_typeof(m->'macro_f1') is distinct from 'number' or (m->>'macro_f1')::numeric not between 0.6 and 1 then return false; end if;
  foreach label in array array['negative','neutral','positive'] loop
    c := m->'per_class'->label;
    if jsonb_typeof(c->'support') is distinct from 'number' or (c->>'support')::numeric<10
      or trunc((c->>'support')::numeric)<>(c->>'support')::numeric
      or jsonb_typeof(c->'precision') is distinct from 'number' or (c->>'precision')::numeric not between 0.5 and 1
      or jsonb_typeof(c->'recall') is distinct from 'number' or (c->>'recall')::numeric not between 0.5 and 1 then return false; end if;
  end loop;
  return true;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end $function$;

CREATE OR REPLACE FUNCTION public.valid_sentiment_independent_policy(policy jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare language text; expanded jsonb; rule jsonb; evidence jsonb; requested jsonb;
begin
  if not (policy ? 'scope_version') then return public.valid_sentiment_independent_policy_all_languages(policy); end if;
  if policy->'scope_version' is distinct from '1'::jsonb or jsonb_typeof(policy->'languages') is distinct from 'object'
    or jsonb_typeof(policy->'requested_languages') is distinct from 'array' then return false; end if;
  requested := policy->'requested_languages';
  if jsonb_array_length(requested) not between 1 and 3 or
    exists(select 1 from jsonb_array_elements_text(requested) l where l not in ('cebuano','english','filipino')) or
    (select count(distinct l) from jsonb_array_elements_text(requested) l) <> jsonb_array_length(requested) or
    (select count(*) from jsonb_object_keys(policy->'languages')) not between 1 and 3 then return false; end if;
  for language,rule in select * from jsonb_each(policy->'languages') loop
    if language not in ('cebuano','english','filipino') or not requested @> jsonb_build_array(language) then return false; end if;
    evidence := policy->'independent_test'->'languages'->language;
    -- Internally repeat this one language's measurements under the three keys
    -- expected by the original validator. This does not fabricate stored scores.
    expanded := policy || jsonb_build_object('languages',jsonb_build_object('cebuano',rule,'english',rule,'filipino',rule),
      'independent_test',jsonb_build_object('passed',true,'languages',jsonb_build_object('cebuano',evidence,'english',evidence,'filipino',evidence)));
    if not public.valid_sentiment_independent_policy_all_languages(expanded) then return false; end if;
  end loop;
  return coalesce((policy->>'passed')='true' and (policy->'independent_test'->>'passed')='true',false);
exception when invalid_parameter_value or invalid_text_representation then return false;
end $function$;

CREATE OR REPLACE FUNCTION public.valid_sentiment_independent_policy_all_languages(policy jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare language text; rule jsonb; check_result jsonb; filename text; field text;
begin
  if (policy->>'version') is distinct from '2' or (policy->>'admission') is distinct from 'independent-v1'
    or (policy->>'passed') is distinct from 'true' or (policy->'independent_test'->>'passed') is distinct from 'true'
    or jsonb_typeof(policy->'languages') is distinct from 'object'
    or policy->'evaluated_pool_ids' is distinct from '[]'::jsonb then return false; end if;
  foreach filename in array array['sentiment_english.onnx','sentiment_filipino.onnx','sentiment_cebuano.onnx','language_id.onnx'] loop
    if coalesce(policy->'builtin_hashes'->>filename,'') !~ '^[a-f0-9]{64}$' then return false; end if;
  end loop;
  if (select count(*) from jsonb_object_keys(policy->'languages')) <> 3 then return false; end if;
  foreach language in array array['cebuano','english','filipino'] loop
    rule := policy->'languages'->language;
    check_result := policy->'independent_test'->'languages'->language;
    if rule is null or (check_result->>'passed') is distinct from 'true'
      or not public.valid_sentiment_independent_metrics(check_result->'metrics')
      or not public.valid_sentiment_independent_metrics(check_result->'validation_metrics') then return false; end if;
    if (rule->'primary_confidence') is distinct from '0.85'::jsonb or (rule->'primary_margin') is distinct from '0.2'::jsonb then return false; end if;
    foreach field in array array['support_confidence','support_margin','validation_precision'] loop
      if jsonb_typeof(rule->field) is distinct from 'number' or (rule->>field)::numeric not between 0 and 1 then return false; end if;
    end loop;
    if (rule->>'support_confidence')::numeric<0.5 or (rule->>'support_margin')::numeric<0.05
      or (rule->>'validation_precision')::numeric<0.75
      or jsonb_typeof(rule->'validation_support') is distinct from 'number' or (rule->>'validation_support')::numeric<20
      or trunc((rule->>'validation_support')::numeric)<>(rule->>'validation_support')::numeric
      or jsonb_typeof(check_result->'precision') is distinct from 'number' or (check_result->>'precision')::numeric not between 0.75 and 1
      or jsonb_typeof(check_result->'support') is distinct from 'number' or (check_result->>'support')::numeric<10
      or trunc((check_result->>'support')::numeric)<>(check_result->>'support')::numeric then return false; end if;
  end loop;
  return true;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end $function$;

CREATE OR REPLACE FUNCTION public.valid_sentiment_pool_policy(policy jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare language text; rule jsonb; key text;
begin
  if policy is null or (policy->>'version') is distinct from '1' or (policy->>'passed') is distinct from 'true'
    or (policy->'cascade_test'->>'passed') is distinct from 'true' or jsonb_typeof(policy->'languages') is distinct from 'object'
    or policy->'languages'='{}'::jsonb or jsonb_typeof(policy->'evaluated_pool_ids') is distinct from 'array' then return false; end if;
  foreach key in array array['sentiment_english.onnx','sentiment_filipino.onnx','sentiment_cebuano.onnx','language_id.onnx'] loop
    if coalesce(policy->'builtin_hashes'->>key,'') !~ '^[a-f0-9]{64}$' then return false; end if;
  end loop;
  for language,rule in select * from jsonb_each(policy->'languages') loop
    if language not in ('cebuano','english','filipino') then return false; end if;
    foreach key in array array['primary_confidence','primary_margin','support_confidence','support_margin','validation_precision'] loop
      if jsonb_typeof(rule->key) is distinct from 'number' or (rule->>key)::numeric not between 0 and 1 then return false; end if;
    end loop;
    if (rule->>'validation_precision')::numeric < 0.75 or jsonb_typeof(rule->'validation_support') is distinct from 'number'
      or (rule->>'validation_support')::numeric<20 or trunc((rule->>'validation_support')::numeric)<>(rule->>'validation_support')::numeric then return false; end if;
  end loop;
  return true;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end $function$;

revoke all on function public."cleanup_sentiment_analysis"() from public, anon, authenticated, service_role;

revoke all on function public."current_user_role"() from public, anon, authenticated, service_role;

revoke all on function public."enqueue_sentiment_training"(p_mode text) from public, anon, authenticated, service_role;

revoke all on function public."handle_new_credibility"() from public, anon, authenticated, service_role;

revoke all on function public."handle_new_user"() from public, anon, authenticated, service_role;

revoke all on function public."manage_sentiment_dataset"(p_actor uuid, p_action text, p_payload jsonb) from public, anon, authenticated, service_role;

revoke all on function public."manage_sentiment_supporting_model"(p_actor uuid, p_action text, p_model uuid, p_generation bigint, p_payload jsonb) from public, anon, authenticated, service_role;

revoke all on function public."manage_sentiment_supporting_model_independent_legacy"(p_actor uuid, p_action text, p_model uuid, p_generation bigint, p_payload jsonb) from public, anon, authenticated, service_role;

revoke all on function public."manage_sentiment_training"(p_actor uuid, p_action text, p_job uuid, p_generation bigint, p_payload jsonb) from public, anon, authenticated, service_role;

revoke all on function public."queue_approved_sentiment_training"() from public, anon, authenticated, service_role;

revoke all on function public."record_sentiment_support_usage"(p_ids uuid[]) from public, anon, authenticated, service_role;

revoke all on function public."sentiment_training_capabilities"() from public, anon, authenticated, service_role;

revoke all on function public."sentiment_training_pool_summary"() from public, anon, authenticated, service_role;

revoke all on function public."sentiment_training_worker"(p_action text, p_job uuid, p_lease uuid, p_payload jsonb) from public, anon, authenticated, service_role;

revoke all on function public."sentiment_training_worker_independent_legacy"(p_action text, p_job uuid, p_lease uuid, p_payload jsonb) from public, anon, authenticated, service_role;

revoke all on function public."sentiment_training_worker_pool_legacy"(p_action text, p_job uuid, p_lease uuid, p_payload jsonb) from public, anon, authenticated, service_role;

revoke all on function public."sentiment_training_worker_scope_legacy"(p_action text, p_job uuid, p_lease uuid, p_payload jsonb) from public, anon, authenticated, service_role;

revoke all on function public."set_credibility_level"() from public, anon, authenticated, service_role;

revoke all on function public."set_fullname"() from public, anon, authenticated, service_role;

revoke all on function public."set_sentiment_analysis_updated_at"() from public, anon, authenticated, service_role;

revoke all on function public."set_updated_at"() from public, anon, authenticated, service_role;

revoke all on function public."valid_sentiment_independent_metrics"(m jsonb) from public, anon, authenticated, service_role;

revoke all on function public."valid_sentiment_independent_policy"(policy jsonb) from public, anon, authenticated, service_role;

revoke all on function public."valid_sentiment_independent_policy_all_languages"(policy jsonb) from public, anon, authenticated, service_role;

revoke all on function public."valid_sentiment_pool_policy"(policy jsonb) from public, anon, authenticated, service_role;

grant EXECUTE on function public."cleanup_sentiment_analysis"() to public;

grant EXECUTE on function public."current_user_role"() to public;

grant EXECUTE on function public."enqueue_sentiment_training"(p_mode text) to "service_role";

grant EXECUTE on function public."handle_new_credibility"() to public;

grant EXECUTE on function public."handle_new_user"() to public;

grant EXECUTE on function public."manage_sentiment_dataset"(p_actor uuid, p_action text, p_payload jsonb) to "service_role";

grant EXECUTE on function public."manage_sentiment_supporting_model"(p_actor uuid, p_action text, p_model uuid, p_generation bigint, p_payload jsonb) to "service_role";

grant EXECUTE on function public."manage_sentiment_training"(p_actor uuid, p_action text, p_job uuid, p_generation bigint, p_payload jsonb) to "service_role";

grant EXECUTE on function public."queue_approved_sentiment_training"() to "service_role";

grant EXECUTE on function public."record_sentiment_support_usage"(p_ids uuid[]) to "service_role";

grant EXECUTE on function public."sentiment_training_capabilities"() to "service_role";

grant EXECUTE on function public."sentiment_training_pool_summary"() to "service_role";

grant EXECUTE on function public."sentiment_training_worker"(p_action text, p_job uuid, p_lease uuid, p_payload jsonb) to "service_role";

grant EXECUTE on function public."set_credibility_level"() to public;

grant EXECUTE on function public."set_fullname"() to public;

grant EXECUTE on function public."set_sentiment_analysis_updated_at"() to public;

grant EXECUTE on function public."set_updated_at"() to public;

grant EXECUTE on function public."valid_sentiment_independent_metrics"(m jsonb) to "service_role";

grant EXECUTE on function public."valid_sentiment_independent_policy"(policy jsonb) to "service_role";

grant EXECUTE on function public."valid_sentiment_pool_policy"(policy jsonb) to "service_role";

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE TRIGGER set_admin_announcement_updated_at BEFORE UPDATE ON public.admin_announcement FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_admin_posts_updated_at BEFORE UPDATE ON public.admin_posts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_app_settings_updated_at BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_notifications_updated_at BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER on_profile_created_credibility AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION handle_new_credibility();

CREATE TRIGGER set_profiles_fullname BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_fullname();

CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER cleanup_comment_sentiment AFTER DELETE ON public.report_comments FOR EACH ROW EXECUTE FUNCTION cleanup_sentiment_analysis();

CREATE TRIGGER cleanup_comment_sentiment_on_text_change AFTER UPDATE OF content ON public.report_comments FOR EACH ROW WHEN ((old.content IS DISTINCT FROM new.content)) EXECUTE FUNCTION cleanup_sentiment_analysis();

CREATE TRIGGER cleanup_report_sentiment AFTER DELETE ON public.reports FOR EACH ROW EXECUTE FUNCTION cleanup_sentiment_analysis();

CREATE TRIGGER cleanup_report_sentiment_on_text_change AFTER UPDATE OF details ON public.reports FOR EACH ROW WHEN ((old.details IS DISTINCT FROM new.details)) EXECUTE FUNCTION cleanup_sentiment_analysis();

CREATE TRIGGER set_reports_updated_at BEFORE UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_sentiment_analysis_updated_at BEFORE UPDATE ON public.sentiment_analysis FOR EACH ROW EXECUTE FUNCTION set_sentiment_analysis_updated_at();

CREATE TRIGGER sentiment_dataset_approval_training AFTER UPDATE OF status ON public.sentiment_datasets FOR EACH ROW WHEN (((old.status IS DISTINCT FROM new.status) AND ((new.status = 'approved'::text) OR (old.status = 'approved'::text)))) EXECUTE FUNCTION queue_approved_sentiment_training();

CREATE TRIGGER set_system_settings_updated_at BEFORE UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_credibility_level_trigger BEFORE INSERT OR UPDATE ON public.user_credibility FOR EACH ROW EXECUTE FUNCTION set_credibility_level();

CREATE TRIGGER set_user_credibility_updated_at BEFORE UPDATE ON public.user_credibility FOR EACH ROW EXECUTE FUNCTION set_updated_at();

create policy "admin_delete_announcements" on public."admin_announcement" as PERMISSIVE
    for DELETE to "authenticated" using ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

create policy "admin_update_announcements" on public."admin_announcement" as PERMISSIVE
    for UPDATE to "authenticated" using ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text]))) with check ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

create policy "admin_write_announcements" on public."admin_announcement" as PERMISSIVE
    for INSERT to "authenticated" with check ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

create policy "read_all_admin_announcements" on public."admin_announcement" as PERMISSIVE
    for SELECT to "authenticated" using (true);

create policy "admin_delete_posts" on public."admin_posts" as PERMISSIVE
    for DELETE to public using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));

create policy "admin_update_posts" on public."admin_posts" as PERMISSIVE
    for UPDATE to public using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));

create policy "admin_write_posts" on public."admin_posts" as PERMISSIVE
    for INSERT to public with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));

create policy "read_all_admin_posts" on public."admin_posts" as PERMISSIVE
    for SELECT to public using (true);

create policy "admin_read_audit_logs" on public."audit_logs" as PERMISSIVE
    for SELECT to "authenticated" using ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

create policy "admin_write_audit_logs" on public."audit_logs" as PERMISSIVE
    for INSERT to "authenticated" with check ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

create policy "read_all_credibility_events" on public."credibility_events" as PERMISSIVE
    for SELECT to "authenticated" using ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

create policy "read_own_credibility_events" on public."credibility_events" as PERMISSIVE
    for SELECT to "authenticated" using ((auth.uid() = user_id));

create policy "read_all_emergency_facilities" on public."emergency_facilities" as PERMISSIVE
    for SELECT to public using (true);

create policy "read_own_login_activities" on public."login_activities" as PERMISSIVE
    for SELECT to public using ((auth.uid() = user_id));

create policy "read_own_nearby_incidents" on public."notification_nearby_incident" as PERMISSIVE
    for SELECT to public using ((EXISTS ( SELECT 1
   FROM notifications n
  WHERE ((n.id = notification_nearby_incident.notification_id) AND (n.user_id = auth.uid())))));

create policy "read_own_report_status" on public."notification_report_status" as PERMISSIVE
    for SELECT to public using ((EXISTS ( SELECT 1
   FROM notifications n
  WHERE ((n.id = notification_report_status.notification_id) AND (n.user_id = auth.uid())))));

create policy "admin_read_all_notifications" on public."notifications" as PERMISSIVE
    for SELECT to "authenticated" using ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

create policy "admin_update_all_notifications" on public."notifications" as PERMISSIVE
    for UPDATE to "authenticated" using ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text]))) with check ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

create policy "read_own_notifications" on public."notifications" as PERMISSIVE
    for SELECT to public using ((auth.uid() = user_id));

create policy "update_own_notifications" on public."notifications" as PERMISSIVE
    for UPDATE to public using ((auth.uid() = user_id));

create policy "admin_select_all_profiles" on public."profiles" as PERMISSIVE
    for SELECT to "authenticated" using ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

create policy "select_own_profile" on public."profiles" as PERMISSIVE
    for SELECT to "authenticated" using ((auth.uid() = id));

create policy "super_admin_delete_profiles" on public."profiles" as PERMISSIVE
    for DELETE to "authenticated" using ((current_user_role() = 'super_admin'::text));

create policy "super_admin_insert_profiles" on public."profiles" as PERMISSIVE
    for INSERT to "authenticated" with check ((current_user_role() = 'super_admin'::text));

create policy "super_admin_update_all" on public."profiles" as PERMISSIVE
    for UPDATE to "authenticated" using ((current_user_role() = 'super_admin'::text)) with check ((current_user_role() = 'super_admin'::text));

create policy "update_own_profile" on public."profiles" as PERMISSIVE
    for UPDATE to "authenticated" using ((auth.uid() = id)) with check ((auth.uid() = id));

create policy "delete_own_comment" on public."report_comments" as PERMISSIVE
    for DELETE to public using ((auth.uid() = user_id));

create policy "insert_comment" on public."report_comments" as PERMISSIVE
    for INSERT to public with check ((auth.uid() = user_id));

create policy "read_all_comments" on public."report_comments" as PERMISSIVE
    for SELECT to public using (true);

create policy "read_all_report_credibility" on public."report_credibility_analysis" as PERMISSIVE
    for SELECT to "authenticated" using (true);

create policy "delete_report_images" on public."report_images" as PERMISSIVE
    for DELETE to public using ((EXISTS ( SELECT 1
   FROM reports r
  WHERE ((r.id = report_images.report_id) AND (r.user_id = auth.uid())))));

create policy "insert_report_images" on public."report_images" as PERMISSIVE
    for INSERT to public with check ((EXISTS ( SELECT 1
   FROM reports r
  WHERE ((r.id = report_images.report_id) AND (r.user_id = auth.uid())))));

create policy "read_all_report_images" on public."report_images" as PERMISSIVE
    for SELECT to public using (true);

create policy "delete_own_like" on public."report_likes" as PERMISSIVE
    for DELETE to public using ((auth.uid() = user_id));

create policy "insert_own_like" on public."report_likes" as PERMISSIVE
    for INSERT to public with check ((auth.uid() = user_id));

create policy "read_all_likes" on public."report_likes" as PERMISSIVE
    for SELECT to public using (true);

create policy "admin_read_report_validations" on public."report_validations" as PERMISSIVE
    for SELECT to "authenticated" using ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

create policy "admin_write_report_validations" on public."report_validations" as PERMISSIVE
    for INSERT to "authenticated" with check ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

create policy "delete_own_report" on public."reports" as PERMISSIVE
    for DELETE to public using ((auth.uid() = user_id));

create policy "insert_own_report" on public."reports" as PERMISSIVE
    for INSERT to public with check ((auth.uid() = user_id));

create policy "read_all_reports" on public."reports" as PERMISSIVE
    for SELECT to public using (true);

create policy "update_own_report" on public."reports" as PERMISSIVE
    for UPDATE to public using ((auth.uid() = user_id));

create policy "read_all_sentiment_analysis" on public."sentiment_analysis" as PERMISSIVE
    for SELECT to "authenticated" using (true);

create policy "read_system_settings" on public."system_settings" as PERMISSIVE
    for SELECT to "authenticated" using (true);

create policy "super_admin_write_system_settings" on public."system_settings" as PERMISSIVE
    for UPDATE to "authenticated" using ((current_user_role() = 'super_admin'::text)) with check ((current_user_role() = 'super_admin'::text));

create policy "read_all_credibility" on public."user_credibility" as PERMISSIVE
    for SELECT to "authenticated" using ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

create policy "read_own_credibility" on public."user_credibility" as PERMISSIVE
    for SELECT to "authenticated" using ((auth.uid() = user_id));

create policy "admin_select_all_terms" on public."user_terms_acceptance" as PERMISSIVE
    for SELECT to "authenticated" using ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

create policy "insert_own_terms" on public."user_terms_acceptance" as PERMISSIVE
    for INSERT to "authenticated" with check ((auth.uid() = user_id));

create policy "select_own_terms" on public."user_terms_acceptance" as PERMISSIVE
    for SELECT to "authenticated" using ((auth.uid() = user_id));

NOTIFY pgrst,'reload schema';

commit;

