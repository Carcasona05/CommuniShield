import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const reset = await readFile(new URL('../../DB_Schema/maintenance/reset_sentiment_training.sql', import.meta.url), 'utf8');

test('manual reset removes only training data, handles references and remains rerunnable', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table profiles(id integer primary key);
      create table reports(id integer primary key);
      create table sentiment_analysis(id integer primary key,subject_id integer references reports(id));
      create table sentiment_datasets(id integer primary key);
      create table sentiment_training_samples(id integer primary key,dataset_id integer references sentiment_datasets(id));
      create table sentiment_dataset_events(dataset_id integer references sentiment_datasets(id));
      create table sentiment_training_jobs(id integer primary key,base_job_id integer references sentiment_training_jobs(id));
      create table sentiment_supporting_models(id integer references sentiment_training_jobs(id));
      create table sentiment_training_events(job_id integer references sentiment_training_jobs(id));
      create table sentiment_model_state(id integer primary key,active_job_id integer references sentiment_training_jobs(id),
        previous_job_id integer references sentiment_training_jobs(id),generation bigint,data_revision bigint,updated_at timestamptz);
      insert into profiles values(1); insert into reports values(1); insert into sentiment_analysis values(1,1);
      insert into sentiment_datasets values(1); insert into sentiment_training_samples values(1,1); insert into sentiment_dataset_events values(1);
      insert into sentiment_training_jobs values(1,null),(2,1); insert into sentiment_supporting_models values(2);
      insert into sentiment_training_events values(1),(2); insert into sentiment_model_state values(1,2,1,9,12,now());
    `);
    await db.exec(reset);
    for (const table of ['sentiment_datasets', 'sentiment_training_samples', 'sentiment_dataset_events', 'sentiment_training_jobs', 'sentiment_supporting_models', 'sentiment_training_events']) {
      assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n, 0);
    }
    for (const table of ['profiles', 'reports', 'sentiment_analysis']) {
      assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n, 1);
    }
    const state = (await db.query('select active_job_id,previous_job_id,generation,data_revision from sentiment_model_state')).rows[0];
    assert.equal(state.active_job_id, null);
    assert.equal(state.previous_job_id, null);
    assert.equal(Number(state.generation), 10);
    assert.equal(Number(state.data_revision), 13);
    await db.exec(reset);
    assert.equal(Number((await db.query('select generation from sentiment_model_state')).rows[0].generation), 11);
  } finally {
    await db.close();
  }
});
