import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
const { PGlite }=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const user='10000000-0000-4000-8000-000000000001';
const reviewer='10000000-0000-4000-8000-000000000002';
const rewardUser='10000000-0000-4000-8000-000000000003';
const historical='10000000-0000-4000-8000-000000000004';
test('standalone timed suspensions, +15 verification and protected daily limits',async t=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table profiles(id uuid primary key references auth.users(id),fullname text,role text,status text);
      create table reports(id uuid primary key default gen_random_uuid(),user_id uuid references profiles(id),status text default 'Pending Review',is_verified boolean default false,created_at timestamptz default now());
      create table report_comments(id uuid primary key default gen_random_uuid(),user_id uuid references profiles(id),report_id uuid references reports(id),created_at timestamptz default now());
      create table audit_logs(id uuid primary key default gen_random_uuid(),actor_id uuid,actor_name text,action_type text,title text,details text,old_value text,new_value text);
      create table notification_types(id uuid primary key default gen_random_uuid(),name text unique check(name in ('system','report_status')));
      create table notifications(id uuid primary key default gen_random_uuid(),user_id uuid,type_id uuid references notification_types(id),title text,message text,priority text);
      grant usage on schema public to anon,authenticated,service_role;
      insert into auth.users values('${user}'),('${reviewer}'),('${rewardUser}'),('${historical}');
      insert into profiles values('${user}','Ana','user','Active'),('${reviewer}','Admin','admin','Active'),('${rewardUser}','Reward','user','Active'),('${historical}','Old','user','Active');`);
    const base=await readFile(new URL('../../DB_Schema/credibility_schema.sql',import.meta.url),'utf8');
    await db.exec(base.slice(0,base.indexOf('create table if not exists public.report_credibility_analysis')));
    await db.query('insert into user_credibility(user_id,score) values($1,10),($2,60),($3,65)',[user,rewardUser,historical]);
    const oldReport=(await db.query('insert into reports(user_id) values($1) returning id',[historical])).rows[0].id;
    // Seed a pre-policy reward, without installing an obsolete policy first.
    await db.query('update reports set is_verified=true where id=$1',[oldReport]);
    await db.query("insert into credibility_events(user_id,event_type,points,reason,report_id) values($1,'report_verified',5,'Historical verification',$2)",[historical,oldReport]);
    const migration=(await readFile(new URL('../../DB_Schema/migrations/credibility_timed_suspensions.sql',import.meta.url),'utf8'))+
      '\n'+(await readFile(new URL('../../DB_Schema/migrations/credibility_all_good_unlimited.sql',import.meta.url),'utf8'));
    await db.exec(migration);
    const access=async(u=user)=>(await db.query('select credibility_access($1) a',[u])).rows[0].a;
    const setScore=async(value,u=user)=>db.query('update user_credibility set score=$1 where user_id=$2',[value,u]);
    const expiry=async(u=user)=>{
      await db.query("update credibility_suspensions set started_at=now()-interval '31 days'+occurrence*interval '1 hour',ends_at=now()-interval '1 second' where user_id=$1 and released_at is null",[u]);
      return access(u);
    };
    const newUser=async score=>{
      const id=(await db.query('insert into auth.users(id) values(gen_random_uuid()) returning id')).rows[0].id;
      await db.query("insert into profiles(id,fullname,role,status) values($1,'Test user','user','Active')",[id]);
      await db.query('insert into user_credibility(user_id,score) values($1,$2)',[id,score]);
      return id;
    };
    await t.test('standalone setup enforces every score boundary and Philippine reset time',async()=>{
      for(const [score,reports,comments] of [[0,0,0],[19,0,0],[20,1,0],[39,1,0],[40,1,3],[59,1,3],[60,3,10],[99,3,10],[100,null,null]]){
        const id=await newUser(score),a=await access(id);
        assert.equal(a.policyVersion,'timed-v1');assert.equal(a.reportLimit,reports);assert.equal(a.commentLimit,comments);
        assert.equal(a.unlimited,score===100);
        assert.equal(new Date(a.resetsAt).getUTCHours(),16);
      }
    });
    await t.test('All good permits reports and comments beyond the old limits, with quotas restored below 100',async()=>{
      const id=await newUser(100);
      const rows=await db.query('insert into reports(user_id) select $1 from generate_series(1,12) returning id',[id]);
      await db.query('insert into report_comments(user_id,report_id) select $1,$2 from generate_series(1,105)',[id,rows.rows[0].id]);
      let a=await access(id);
      assert.equal(a.unlimited,true);assert.equal(a.reportAllowed,true);assert.equal(a.commentAllowed,true);
      assert.equal(a.reportsUsed,12);assert.equal(a.commentsUsed,105);
      await setScore(99,id);a=await access(id);
      assert.equal(a.unlimited,false);assert.equal(a.reportLimit,3);assert.equal(a.commentLimit,10);
      assert.equal(a.reportAllowed,false);assert.equal(a.commentAllowed,false);
      await assert.rejects(db.query('insert into reports(user_id) values($1)',[id]),/CREDIBILITY_DAILY_LIMIT/);
      await assert.rejects(db.query('insert into report_comments(user_id,report_id) values($1,$2)',[id,rows.rows[0].id]),/CREDIBILITY_DAILY_LIMIT/);
    });
    await t.test('a score of 100 does not override an active suspension',async()=>{
      const id=await newUser(10);await setScore(100,id);
      const a=await access(id);
      assert.equal(a.suspended,true);assert.equal(a.unlimited,false);
      assert.equal(a.reportLimit,0);assert.equal(a.commentLimit,0);
      await assert.rejects(db.query('insert into reports(user_id) values($1)',[id]),/CREDIBILITY_SUSPENDED/);
    });
    await t.test('standalone database protects concurrent quotas and deletion cannot refund them',async()=>{
      const id=await newUser(40);
      const results=await Promise.allSettled([db.query('insert into reports(user_id) values($1) returning id',[id]),db.query('insert into reports(user_id) values($1) returning id',[id])]);
      assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
      const r=results.find(result=>result.status==='fulfilled').value.rows[0].id;
      for(let i=0;i<3;i++)await db.query('insert into report_comments(user_id,report_id) values($1,$2)',[id,r]);
      await assert.rejects(db.query('insert into report_comments(user_id,report_id) values($1,$2)',[id,r]),/CREDIBILITY_DAILY_LIMIT/);
      await db.query('delete from report_comments where user_id=$1',[id]);
      await assert.rejects(db.query('insert into report_comments(user_id,report_id) values($1,$2)',[id,r]),/CREDIBILITY_DAILY_LIMIT/);
      await db.query('delete from reports where id=$1',[r]);
      await assert.rejects(db.query('insert into reports(user_id) values($1)',[id]),/CREDIBILITY_DAILY_LIMIT/);
    });
    await t.test('standalone review-field protection stops authenticated self-verification',async()=>{
      const id=await newUser(60),r=(await db.query('insert into reports(user_id) values($1) returning id',[id])).rows[0].id;
      await db.exec(`set request.jwt.claim.role='authenticated'; set request.jwt.claim.sub='${id}'`);
      await assert.rejects(db.query('update reports set is_verified=true where id=$1',[r]),/Only admins/);
      await db.exec('reset request.jwt.claim.role; reset request.jwt.claim.sub');
    });
    await t.test('a notification failure rolls back the score and suspension together',async()=>{
      const id=await newUser(40);
      await db.exec("alter table notifications add constraint reject_suspension_notice check(title<>'Temporary account suspension') not valid");
      await assert.rejects(setScore(10,id),/reject_suspension_notice/);
      assert.equal((await access(id)).score,40);
      assert.equal((await db.query('select count(*) n from credibility_suspensions where user_id=$1',[id])).rows[0].n,0);
      await db.exec('alter table notifications drop constraint reject_suspension_notice');
    });
    await t.test('existing low score starts a one-day suspension once; migration replay and refresh do not extend it',async()=>{
      let a=await access();assert.equal(a.suspended,true);assert.equal(a.suspension.durationDays,1);assert.equal(a.suspension.occurrence,1);
      const id=a.suspension.id,end=a.suspension.endsAt;
      await db.exec(migration);await setScore(5);
      a=await access();assert.equal(a.suspension.id,id);assert.equal(a.suspension.endsAt,end);
      assert.equal((await db.query('select count(*) n from credibility_suspensions where user_id=$1',[user])).rows[0].n,1);
      await assert.rejects(db.query('insert into reports(user_id) values($1)',[user]),/CREDIBILITY_SUSPENDED/);
    });
    await t.test('new verification earns +15 exactly once; old +5 rewards are not replayed',async()=>{
      const r=(await db.query('insert into reports(user_id) values($1) returning id',[rewardUser])).rows[0].id;
      assert.equal((await access(rewardUser)).score,60);
      await db.query('update reports set is_verified=true where id=$1',[r]);assert.equal((await access(rewardUser)).score,75);
      await db.query('update reports set is_verified=true where id=$1',[r]);
      await db.query('update reports set is_verified=false where id=$1',[r]);
      await db.query('update reports set is_verified=true where id=$1',[r]);assert.equal((await access(rewardUser)).score,75);
      await db.query('update reports set is_verified=false where id=$1',[oldReport]);await db.query('update reports set is_verified=true where id=$1',[oldReport]);
      assert.equal((await access(historical)).score,65);
      await setScore(95,rewardUser);
      const r2=(await db.query('insert into reports(user_id) values($1) returning id',[rewardUser])).rows[0].id;
      await db.query('update reports set is_verified=true where id=$1',[r2]);assert.equal((await access(rewardUser)).score,100);
    });
    await t.test('expiry restores to 20 once without approval and does not refund daily usage',async()=>{
      await db.query("insert into credibility_usage(kind,source_id,user_id) values('report',gen_random_uuid(),$1)",[user]);
      const a=await expiry();assert.equal(a.score,20);assert.equal(a.suspended,false);assert.equal(a.reportLimit,1);assert.equal(a.reportAllowed,false);
      await access();await access();
      assert.equal((await db.query("select count(*) n from credibility_events where user_id=$1 and reason like 'Timed suspension expired%'",[user])).rows[0].n,1);
    });
    await t.test('repeat suspensions escalate 3,7,14,30,30 days with one open record per account',async()=>{
      for(const days of [3,7,14,30,30]){
        await setScore(10);let a=await access();assert.equal(a.suspension.durationDays,days);
        const end=a.suspension.endsAt,id=a.suspension.id;
        await Promise.all([access(),access()]);await setScore(1);
        a=await access();assert.equal(a.suspension.id,id);assert.equal(a.suspension.endsAt,end);
        assert.equal((await db.query('select count(*) n from credibility_suspensions where user_id=$1 and released_at is null',[user])).rows[0].n,1);
        assert.equal((await expiry()).score,20);
      }
    });
    await t.test('90 suspension-free days resets the next occurrence to one',async()=>{
      await db.query("update credibility_suspensions set started_at=started_at-interval '100 days',ends_at=ends_at-interval '100 days',released_at=released_at-interval '100 days' where user_id=$1",[user]);
      await setScore(10);const a=await access();assert.equal(a.suspension.occurrence,1);assert.equal(a.suspension.durationDays,1);
    });
    await t.test('score recovery during an active suspension does not bypass its duration or get reduced at expiry',async()=>{
      await setScore(70);let a=await access();assert.equal(a.score,70);assert.equal(a.suspended,true);assert.equal(a.editAllowed,false);assert.equal(a.reportAllowed,false);
      a=await expiry();assert.equal(a.score,70);assert.equal(a.suspended,false);
    });
    await t.test('a real negative review starts one suspension and repeated review updates do not restart it',async()=>{
      await setScore(100,rewardUser);
      const r=(await db.query('insert into reports(user_id) values($1) returning id',[rewardUser])).rows[0].id;
      await setScore(40,rewardUser);
      await db.query("update reports set status='Marked Fake' where id=$1",[r]);let a=await access(rewardUser);assert.equal(a.score,10);assert.equal(a.suspended,true);
      const id=a.suspension.id,end=a.suspension.endsAt;
      await db.query("update reports set status='Marked Fake' where id=$1",[r]);a=await access(rewardUser);
      assert.equal(a.suspension.id,id);assert.equal(a.suspension.endsAt,end);
    });
    await t.test('admin is exempt and ordinary roles cannot change timers or scoring ledgers',async()=>{
      assert.equal((await access(reviewer)).exempt,true);
      for(const role of ['anon','authenticated']){
        await db.exec(`set role ${role}`);
        await assert.rejects(db.query('update credibility_suspensions set ends_at=now()'),/permission denied/);
        await assert.rejects(db.query('select refresh_credibility_suspension($1)',[user]),/permission denied/);
        await assert.rejects(db.query('delete from credibility_usage'),/permission denied/);
        await assert.rejects(db.query('update user_credibility set score=100'),/permission denied/);
        await db.exec('reset role');
      }
    });
  }finally{await db.close();}
});
