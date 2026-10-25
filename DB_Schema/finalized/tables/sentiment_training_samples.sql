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
