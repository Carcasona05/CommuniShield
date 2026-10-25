// Development-only: materialize the migration chain in isolated PostgreSQL,
// then export its final definitions. Never connects to Supabase or reads .env.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

export const directory = dirname(fileURLToPath(import.meta.url));
export const root = resolve(directory, '../..');
export const sources = [
  'profiles_schema.sql', 'reports_schema.sql', 'admins_schema.sql',
  'credibility_schema.sql', 'notifications_schema.sql', 'emergency_facilities_schema.sql',
  'user_terms_acceptance_schema.sql', 'ai_model_tracking_migration.sql',
  'migrations/add_role_to_reports.sql', 'migrations/add_unified_sentiment_analysis.sql',
  'migrations/report_archiving.sql', 'migrations/user_notification_preferences.sql',
  'migrations/sentiment_datasets.sql', 'migrations/sentiment_training_jobs.sql',
  'migrations/sentiment_continued_training.sql', 'migrations/sentiment_supporting_pool.sql',
  'migrations/sentiment_fresh_candidates.sql', 'migrations/sentiment_independent_admission.sql',
  'migrations/sentiment_pending_training_summary.sql', 'migrations/sentiment_language_scoped_training.sql',
];
export const quote = value => '"' + value.replaceAll('"', '""') + '"';
const literal = value => value === null ? 'null' : typeof value === 'boolean' || typeof value === 'number' ? String(value) : "'" + String(value).replaceAll("'", "''") + "'";
const hash = text => createHash('sha256').update(text).digest('hex');

export async function postgres() {
  const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
  const db = new PGlite();
  // Minimal Supabase-managed fixtures. These are NOT included in the SQL export.
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    grant usage on schema public to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to service_role;
    alter default privileges in schema public grant select,insert,update,delete on tables to anon,authenticated;`);
  return db;
}

export async function applySources(db) {
  const manifest = [];
  for (const source of sources) {
    const text = await readFile(resolve(root, 'DB_Schema', source), 'utf8');
    manifest.push({ path: 'DB_Schema/' + source, sha256: hash(text) });
    // PGlite has gen_random_uuid in core; production Supabase supplies pgcrypto.
    await db.exec(text.replace(/create extension if not exists pgcrypto;/gi, ''));
  }
  return manifest;
}

export async function catalog(db) {
  const tables = (await db.query(`select c.relname name,c.relrowsecurity rls from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' order by c.relname`)).rows;
  const columns = (await db.query(`select c.relname table_name,a.attname name,format_type(a.atttypid,a.atttypmod) type,
    a.attnotnull required,pg_get_expr(d.adbin,d.adrelid) default_value from pg_attribute a join pg_class c on c.oid=a.attrelid
    join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
    where n.nspname='public' and c.relkind='r' and a.attnum>0 and not a.attisdropped order by c.relname,a.attnum`)).rows;
  const constraints = (await db.query(`select c.relname table_name,con.conname name,con.contype type,pg_get_constraintdef(con.oid) definition
    from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' order by c.relname,con.conname`)).rows;
  const functions = (await db.query(`select p.proname name,pg_get_function_identity_arguments(p.oid) arguments,pg_get_functiondef(p.oid) definition,
    p.prosecdef security_definer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' order by p.proname,pg_get_function_identity_arguments(p.oid)`)).rows;
  const indexes = (await db.query(`select t.relname table_name,i.relname name,pg_get_indexdef(i.oid) definition from pg_index ix
    join pg_class i on i.oid=ix.indexrelid join pg_class t on t.oid=ix.indrelid join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public' and not exists(select 1 from pg_constraint con where con.conindid=i.oid)
    order by t.relname,i.relname`)).rows;
  const triggers = (await db.query(`select n.nspname schema_name,c.relname table_name,t.tgname name,pg_get_triggerdef(t.oid) definition
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal and (n.nspname='public' or (n.nspname='auth' and t.tgname='on_auth_user_created'))
    order by n.nspname,c.relname,t.tgname`)).rows;
  const policies = (await db.query(`select tablename table_name,policyname name,permissive,roles,cmd,qual,with_check
    from pg_policies where schemaname='public' order by tablename,policyname`)).rows;
  const tableGrants = (await db.query(`select c.relname table_name,case when x.grantee=0 then 'PUBLIC' else r.rolname end grantee,
    x.privilege_type privilege from pg_class c join pg_namespace n on n.oid=c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x left join pg_roles r on r.oid=x.grantee
    where n.nspname='public' and c.relkind='r' and (x.grantee=0 or r.rolname in ('anon','authenticated','service_role'))
    order by c.relname,grantee,x.privilege_type`)).rows;
  const functionGrants = (await db.query(`select p.proname name,pg_get_function_identity_arguments(p.oid) arguments,
    case when x.grantee=0 then 'PUBLIC' else r.rolname end grantee,x.privilege_type privilege from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x
    left join pg_roles r on r.oid=x.grantee where n.nspname='public' and p.prokind='f'
    and (x.grantee=0 or r.rolname in ('anon','authenticated','service_role')) order by p.proname,arguments,grantee`)).rows;
  return { tables, columns, constraints, functions, indexes, triggers, policies, tableGrants, functionGrants };
}

export function renderSchemaParts(c) {
  const parts = {};
  const sql = [
    '-- GENERATED FINAL SCHEMA. See README.md. Fresh, empty Supabase projects ONLY.',
    '-- Not a migration/reset script. Existing deployments must use the preserved migrations.',
    '-- No auth users, reports, datasets or trained model artifacts are included.',
    'begin;',
    `do $$ begin
      if to_regclass('auth.users') is null or to_regclass('storage.buckets') is null then
        raise exception 'Supabase-managed auth.users and storage.buckets must exist first';
      end if;
      if ${c.tables.map(t => `to_regclass('public.${t.name}') is not null`).join(' or ')} then
        raise exception 'Application tables already exist. Use ordered migrations, not the fresh-install schema.';
      end if;
    end $$;`,
    'create extension if not exists pgcrypto;',
    'set local check_function_bodies = false;',
    'grant usage on schema public to anon, authenticated, service_role;',
    '\n-- Tables: final columns, with constraints added after all tables exist.',
  ];
  parts['shared/00_preflight.sql'] = sql.splice(0).join('\n\n') + '\n';
  for (const table of c.tables) {
    const name = table.name;
    const statements = [
      `-- public.${name}: columns, local constraints, indexes, RLS and grants.`,
      '-- Generated file. Install through install.psql, or follow README.md; not a standalone migration.',
      `create table public.${quote(name)} (\n${c.columns.filter(col => col.table_name === name)
        .map(col => `  ${quote(col.name)} ${col.type}${col.default_value !== null ? ' default ' + col.default_value : ''}${col.required ? ' not null' : ''}`).join(',\n')}\n);`,
    ];
    for (const con of c.constraints.filter(con => con.table_name === name && con.type !== 'f')) {
      statements.push(`alter table public.${quote(name)} add constraint ${quote(con.name)} ${con.definition};`);
    }
    for (const index of c.indexes.filter(index => index.table_name === name)) statements.push(index.definition + ';');
    if (table.rls) statements.push(`alter table public.${quote(name)} enable row level security;`);
    statements.push(`revoke all on table public.${quote(name)} from public, anon, authenticated, service_role;`);
    for (const g of c.tableGrants.filter(g => g.table_name === name)) {
      statements.push(`grant ${g.privilege} on table public.${quote(name)} to ${g.grantee === 'PUBLIC' ? 'public' : quote(g.grantee)};`);
    }
    parts[`tables/${name}.sql`] = statements.join('\n\n') + '\n';
  }
  // Foreign keys need their target PK/unique constraints to exist already.
  for (const con of c.constraints.filter(con => con.type === 'f')) {
    sql.push(`alter table public.${quote(con.table_name)} add constraint ${quote(con.name)} ${con.definition};`);
  }
  parts['shared/01_foreign_keys.sql'] = sql.splice(0).join('\n\n') + '\n';
  sql.push('-- Final functions and required private protocol helpers. Private helper grants remain revoked.');
  for (const f of c.functions) sql.push(f.definition.trim().replace(/;?$/, ';'));
  for (const f of c.functions) sql.push(`revoke all on function public.${quote(f.name)}(${f.arguments}) from public, anon, authenticated, service_role;`);
  for (const g of c.functionGrants) sql.push(`grant ${g.privilege} on function public.${quote(g.name)}(${g.arguments}) to ${g.grantee === 'PUBLIC' ? 'public' : quote(g.grantee)};`);
  parts['shared/02_functions.sql'] = sql.splice(0).join('\n\n') + '\n';
  for (const trigger of c.triggers) sql.push(trigger.definition + ';');
  for (const p of c.policies) sql.push(`create policy ${quote(p.name)} on public.${quote(p.table_name)} as ${p.permissive}
    for ${p.cmd} to ${p.roles.map(r => r === 'public' ? 'public' : quote(r)).join(', ')}${p.qual ? ' using (' + p.qual + ')' : ''}${p.with_check ? ' with check (' + p.with_check + ')' : ''};`);
  parts['shared/03_triggers_and_policies.sql'] = sql.splice(0).join('\n\n') + '\n';
  sql.push("NOTIFY pgrst,'reload schema';", 'commit;', '');
  parts['shared/04_finish.sql'] = sql.join('\n\n');
  return parts;
}

export function renderSchema(c) {
  return Object.values(renderSchemaParts(c)).join('\n');
}

export async function renderDefaults(db) {
  const sql = ['-- Reference/default data only; no users, sample reports or trained models.', 'begin;'];
  for (const [table, columns, conflict] of [
    ['incident_categories',['name'],'name'],
    ['system_settings',['key','value'],'key'],
    ['emergency_facilities',['name','type','latitude','longitude','address','phone'],'name'],
    ['sentiment_model_state',['id','generation','data_revision'],'id'],
    ['sentiment_supporting_settings',['id','max_enabled'],'id'],
  ]) {
    const rows = (await db.query(`select ${columns.map(quote).join(',')} from public.${quote(table)} order by ${quote(columns[0])}`)).rows;
    if (rows.length) sql.push(`insert into public.${quote(table)} (${columns.map(quote).join(',')}) values\n${rows.map(r => '(' + columns.map(col => literal(r[col])).join(',') + ')').join(',\n')}\non conflict (${quote(conflict)}) do nothing;`);
  }
  const types = (await db.query('select c.name category,t.name from public.incident_types t join public.incident_categories c on c.id=t.category_id order by c.name,t.name')).rows;
  sql.push(`insert into public.incident_types(category_id,name) select c.id,t.name from (values\n${types.map(t => '(' + literal(t.category) + ',' + literal(t.name) + ')').join(',\n')}) t(category,name) join public.incident_categories c on c.name=t.category on conflict(category_id,name) do nothing;`);
  sql.push(`insert into public.app_settings(ai_credibility_enabled,high_credibility_threshold,medium_credibility_threshold) select true,90,60 where not exists(select 1 from public.app_settings);`);
  const buckets = (await db.query('select id,name,public,file_size_limit,allowed_mime_types from storage.buckets order by id')).rows;
  for (const bucket of buckets) sql.push(`insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values(${literal(bucket.id)},${literal(bucket.name)},${literal(bucket.public)},${literal(bucket.file_size_limit)},array[${bucket.allowed_mime_types.map(literal).join(',')}]::text[]) on conflict(id) do nothing;`);
  sql.push('commit;', '');
  return sql.join('\n\n');
}

export async function build({check = false} = {}) {
  const db = await postgres();
  try {
    const sourceManifest = await applySources(db);
    const c = await catalog(db);
    const parts = renderSchemaParts(c);
    const schema = renderSchema(c), defaults = await renderDefaults(db);
    const installer = '-- Fresh empty Supabase project only. Run with psql, not the Supabase SQL editor.\n\\set ON_ERROR_STOP on\n'
      + [...Object.keys(parts), '02_reference_data.sql', '03_verify.sql'].map(name => `\\ir ${name}`).join('\n') + '\n';
    const outputs = { ...parts, '01_schema.sql': schema, '02_reference_data.sql': defaults, 'install.psql': installer };
    const metadata = JSON.stringify({ format: 2, source: 'Repository schemas + ordered migrations, not a live database export',
      sources: sourceManifest, tables: c.tables.length, functions: c.functions.length,
      schema_install_order: Object.keys(parts),
      outputs: Object.fromEntries(Object.entries(outputs).map(([name, content]) => [name, hash(content)])) }, null, 2) + '\n';
    for (const [name, content] of Object.entries({ ...outputs, 'manifest.json': metadata })) {
      const path = resolve(directory,name);
      if (check) {
        if (await readFile(path,'utf8') !== content) throw new Error(`Finalized schema is stale: ${name}. Run build.mjs to regenerate.`);
      } else {
        await mkdir(dirname(path),{recursive:true}); await writeFile(path,content,'utf8');
      }
    }
    console.log(`${check ? 'Verified' : 'Generated'} finalized schema: ${c.tables.length} tables, ${c.functions.length} functions.`);
  } finally { await db.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await build({check:process.argv.includes('--check')});
