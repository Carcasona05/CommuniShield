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
