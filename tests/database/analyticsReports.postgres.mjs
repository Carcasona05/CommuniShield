// Offline PostgreSQL checks only: never reads .env or connects to Supabase.
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { postgres, root, applySources } from '../../DB_Schema/finalized/build.mjs';

const directory = resolve(root, 'DB_Schema/analytics');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let db, reports, results, emptyResults;

async function run(name) {
  return (await db.query(reports.get(name))).rows;
}

before(async () => {
  db = await postgres();
  await db.exec(`alter table auth.users add column created_at timestamptz default now();
    alter table auth.users add column email_confirmed_at timestamptz;`);
   await applySources(db, { defaults: false });
  reports = new Map(await Promise.all((await readdir(directory)).filter(f => f.endsWith('.sql'))
    .map(async f => [f, await readFile(resolve(directory, f), 'utf8')])));
  emptyResults = new Map();
  await db.exec('begin read only');
  for (const name of reports.keys()) emptyResults.set(name, await run(name));
  await db.exec('commit');
  // Fixed Manila day boundary, independent of the session timezone.
  await db.exec(`set timezone = 'America/New_York';
    create temporary table clock as
      select (now() at time zone 'Asia/Manila')::date::timestamp at time zone 'Asia/Manila' as midnight;`);
  await db.query(`insert into auth.users(id, created_at, email_confirmed_at) values
    ($1, (select midnight from clock), now()),
     ($2, (select midnight from clock) + interval '1 hour', null)`, [id(1), id(2)]);
   // Analytics fixtures do not test posting quotas; all-good accounts are unlimited.
   await db.query('update public.user_credibility set score=100 where user_id=any($1::uuid[])', [[id(1),id(2)]]);
  await db.query(`insert into public.reports(id,user_id,created_at,status) values
    ($1,$5,(select midnight from clock),'Resolved'),
    ($2,$5,(select midnight from clock) + interval '1 hour','Archived'),
    ($3,$5,(select midnight from clock) - interval '40 days','Pending Review'),
    ($4,$5,(select midnight from clock) + interval '1 day','Pending Review')`,
  [id(10), id(11), id(12), id(13), id(1)]);
  // Same UUID in two subject types must not cross-match sentiment or credibility.
  await db.query(`insert into public.report_comments(id,report_id,user_id,content,created_at) values
    ($1,$1,$3,'Fixture',(select midnight from clock)),
    ($2,$1,$3,'Fixture',(select midnight from clock) - interval '1 microsecond')`,
  [id(10), id(20), id(2)]);
  await db.exec(`insert into public.admin_announcement(title,details,created_at)
    values ('Fixture','Fixture',(select midnight from clock));`);
  await db.query(`insert into public.sentiment_datasets(id,name,source,status,created_by_name,created_at) values
    ($1,'Two samples','manual','approved','Fixture',(select midnight from clock)),
    ($2,'Empty dataset','manual','pending','Fixture',(select midnight from clock))`, [id(30), id(31)]);
  await db.query(`insert into public.sentiment_training_samples(dataset_id,text,language,label,text_key,active) values
    ($1,'Good','cebuano','positive',repeat('a',64),true),
    ($1,'Bad','cebuano','negative',repeat('b',64),true)`, [id(30)]);
  await db.exec(`insert into public.sentiment_training_jobs(status,training_mode,created_at,started_at,finished_at) values
    ('ready','fresh',(select midnight from clock),now() - interval '2 minutes',now()),
    ('failed','continue',(select midnight from clock),now() - interval '1 minute',now());
    insert into public.sentiment_training_jobs(status,training_mode,created_at,lease_until) values
    ('training','continue',now() - interval '40 days',now() - interval '1 minute'),
    ('queued','fresh',now() - interval '40 days',null);
    update public.sentiment_training_jobs set available_at = now() - interval '1 minute' where status = 'queued';`);
  await db.query(`insert into public.report_credibility_analysis(report_id,ai_score,analyzed_at)
    values($1,80,(select midnight from clock));
    `, [id(10)]);
  await db.query(`insert into public.sentiment_analysis(subject_type,subject_id,status,label,confidence,created_at) values
    ('report',$1,'succeeded','positive',0.9,(select midnight from clock)),
    ('comment',$1,'failed','unclear',0,(select midnight from clock))`, [id(10)]);
  await db.query(`insert into public.sentiment_training_jobs(id,status,created_at) values
    ($1,'ready',now() - interval '40 days'), ($2,'ready',now() - interval '40 days')`, [id(30), id(31)]);
  await db.query(`insert into public.sentiment_supporting_models(id,name,artifact_manifest,metrics,use_count) values
    ($1,'Same candidate name','{}','{}',4), ($2,'Same candidate name','{}','{}',7)`, [id(30), id(31)]);
  await db.exec(`begin read only;`);
  results = new Map();
  for (const name of reports.keys()) results.set(name, await run(name));
  await db.exec('commit');
});

after(async () => { await db?.close(); });

const total = rows => rows.reduce((sum, row) => sum + Number(row.y), 0);
const value = (name, category) => Number(results.get(name).find(r => r.x === category)?.y);
const dailyNames = ['01_accounts_created_daily.sql', '03_comments_created_daily.sql', '06_ai_credibility_results_daily.sql'];

test('all 13 reports are read-only and return exactly two chart columns with unique X values', () => {
  assert.equal(results.size, 13);
  for (const [name, rows] of results) {
    assert.ok(results.has(name), name);
    assert.equal(new Set(rows.map(r => String(r.x))).size, rows.length, name);
    for (const row of rows) {
      assert.deepEqual(Object.keys(row), ['x', 'y'], name);
      assert.ok(Number.isFinite(Number(row.y)) && Number(row.y) >= 0, name);
    }
  }
});

test('empty databases return zero-filled days and categories, without invented models', () => {
  for (const [name, rows] of emptyResults) {
    if (dailyNames.includes(name)) assert.equal(rows.length, 30, name);
    assert.equal(total(rows), 0, name);
  }
  assert.equal(emptyResults.get('02_posts_by_type.sql').length, 2);
  assert.equal(emptyResults.get('04_datasets_by_status.sql').length, 4);
  assert.equal(emptyResults.get('05_training_jobs_by_status.sql').length, 5);
  assert.equal(emptyResults.get('07_sentiment_outcomes.sql').length, 9);
  assert.equal(emptyResults.get('08_approved_dataset_balance.sql').length, 9);
  assert.equal(emptyResults.get('09_training_queue_health.sql').length, 8);
  assert.equal(emptyResults.get('10_analysis_coverage.sql').length, 12);
  assert.equal(emptyResults.get('11_supporting_model_usage.sql').length, 0);
  assert.equal(emptyResults.get('13_sentiment_language_provider.sql').length, 0);
});

test('daily charts fill 30 days and respect Manila boundaries and upper limits', () => {
  for (const name of dailyNames) assert.equal(results.get(name).length, 30, name);
  const accounts = results.get('01_accounts_created_daily.sql');
  assert.equal(Number(accounts.at(-1).y), 2);
  assert.equal(value('02_posts_by_type.sql', 'Reports'), 2, 'old and future reports excluded');
  assert.equal(value('02_posts_by_type.sql', 'Announcements'), 1);
  const comments = results.get('03_comments_created_daily.sql');
  assert.equal(Number(comments.at(-1).y), 1);
  assert.equal(Number(comments.at(-2).y), 1, 'microsecond before midnight is yesterday');
});

test('dataset sample joins do not multiply dataset counts and show missing classes', () => {
  assert.equal(total(results.get('04_datasets_by_status.sql')), 2);
  assert.equal(value('04_datasets_by_status.sql', 'Approved'), 1);
  const balance = results.get('08_approved_dataset_balance.sql');
  assert.equal(balance.length, 9);
  assert.equal(value('08_approved_dataset_balance.sql', 'Cebuano / Neutral'), 0);
  assert.equal(value('08_approved_dataset_balance.sql', 'Cebuano / Positive'), 1);
  assert.equal(total(balance), 2);
});

test('training outcomes exclude old jobs, but queue health includes old expired leases', () => {
  assert.equal(total(results.get('05_training_jobs_by_status.sql')), 2);
  assert.equal(value('05_training_jobs_by_status.sql', 'Ready'), 1);
  assert.equal(value('05_training_jobs_by_status.sql', 'Failed'), 1);
  assert.equal(value('09_training_queue_health.sql', 'Continued / Running with invalid/expired lease'), 1);
  assert.equal(value('09_training_queue_health.sql', 'Fresh / Due in queue'), 1);
  assert.equal(total(results.get('09_training_queue_health.sql')), 2, 'no overlapping queue categories');
});

test('coverage includes subject type and counts each subject or sentiment outcome once', () => {
  assert.equal(value('10_analysis_coverage.sql', 'Reports / Succeeded'), 1);
  assert.equal(value('10_analysis_coverage.sql', 'Reports / Missing analysis'), 1);
  assert.equal(value('10_analysis_coverage.sql', 'Comments / Succeeded'), 0);
  assert.equal(value('10_analysis_coverage.sql', 'Comments / Failed'), 1);
  assert.equal(value('10_analysis_coverage.sql', 'Comments / Missing analysis'), 1);
  assert.equal(total(results.get('10_analysis_coverage.sql')), 4);
  assert.equal(value('07_sentiment_outcomes.sql', 'Positive'), 1);
  assert.equal(value('07_sentiment_outcomes.sql', 'Failed'), 1);
  assert.equal(value('07_sentiment_outcomes.sql', 'Unclear'), 0, 'failed default labels are not successful labels');
  assert.equal(total(results.get('07_sentiment_outcomes.sql')), 2);
  assert.equal(Number(results.get('06_ai_credibility_results_daily.sql').at(-1).y), 1);
});

test('model and provider comparisons preserve distinct categories', () => {
  const models = results.get('11_supporting_model_usage.sql');
  assert.equal(models.length, 2);
  assert.equal(total(models), 11);
  const providers = results.get('13_sentiment_language_provider.sql');
  assert.equal(providers.length, 2);
  assert.equal(total(providers), 2);
  assert.ok(providers.every(row => JSON.parse(row.x).length === 5));
});
