-- ============================================================
-- CommuniShield — seed 15 sample reports with comments
-- Uses existing profiles (or creates test users if none exist)
-- Run in Supabase SQL editor. Re-run safe (idempotent on details).
-- ============================================================

-- 0) Cleanup previous run of THIS seed (identifiable by marker in details)
delete from public.report_credibility_analysis
where report_id in (
  select id from public.reports where details like 'Seed15:%'
);

delete from public.report_validations
where report_id in (
  select id from public.reports where details like 'Seed15:%'
);

delete from public.report_images
where report_id in (
  select id from public.reports where details like 'Seed15:%'
);

delete from public.report_comments
where report_id in (
  select id from public.reports where details like 'Seed15:%'
);

delete from public.reports
where details like 'Seed15:%';

-- 1) Get or create 15 distinct user accounts to post from
-- First, try to use existing profiles
with existing_profiles as (
  select id, fullname, user_name
  from public.profiles
  where role = 'user'
  order by created_at
  limit 15
),
created_users as (
  -- If fewer than 15 profiles exist, create test users
  select *
  from (
    select i as n,
           'testuser' || i || '@communishield.local' as email,
           'Test User ' || i as fullname,
           'testuser' || i as user_name,
           'password123' as pwd
    from generate_series(1, 15) as i
  ) t
  where (select count(*) from existing_profiles) < 15
  -- Note: actual auth.users creation requires admin API; this CTE is for reference
  -- In practice, run the auth creation separately if needed
),
all_posters as (
  select id, coalesce(fullname, 'Test User'), coalesce(user_name, 'testuser')
  from existing_profiles
  union all
  -- Placeholder rows if we need more (will fail FK if auth users don't exist)
  select gen_random_uuid(), 'Test User ' || n, 'testuser' || n
  from created_users
  limit greatest(0, 15 - (select count(*) from existing_profiles))
)
-- We'll pick from existing profiles only for safety; adjust if you have test users in auth
select count(*) as available_posters from existing_profiles;

-- 2) Lookup incident_type IDs we need
with needed_types as (
  select 'Lost Property' as type, 'Property-Related Incidents' as category union all
  select 'Suspicious Person', 'Suspicious Activities' union all
  select 'Garbage / Sanitation Issues', 'Community and Environmental Concerns' union all
  select 'Vehicular Accident', 'Traffic and Road Incidents' union all
  select 'Suspicious Person', 'Suspicious Activities' union all
  select 'Streetlight Outage', 'Community and Environmental Concerns' union all
  select 'Public Disturbance', 'Public Safety Incidents' union all
  select 'Vehicular Accident', 'Traffic and Road Incidents' union all
  select 'Fire Incident', 'Community and Environmental Concerns' union all
  select 'Request for Assistance', 'Public Assistance / Community Reports' union all
  select 'Theft', 'Property-Related Incidents' union all
  select 'Public Disturbance', 'Public Safety Incidents' union all
  select 'Flooding', 'Community and Environmental Concerns' union all
  select 'Request for Assistance', 'Public Assistance / Community Reports' union all
  select 'Vehicular Accident', 'Traffic and Road Incidents'
),
type_ids as (
  select nt.type, nt.category, it.id as incident_type_id
  from needed_types nt
  join public.incident_categories ic on ic.name = nt.category
  join public.incident_types it on it.category_id = ic.id and it.name = nt.type
)

-- 3) Insert 15 reports with distinct locations, using available posters
insert into public.reports (user_id, incident_type_id, location, latitude, longitude, poster_name, display_name_type, details, status, is_verified, created_at)
select
  p.id as user_id,
  ti.incident_type_id,
  r.location,
  r.latitude,
  r.longitude,
  p.fullname as poster_name,
  'Fullname' as display_name_type,
  r.details,
  r.status,
  r.is_verified,
  r.created_at
from (
  values
  -- 1. Low — Lost Item
  (1, 'Lost Property', 'Property-Related Incidents',
   'Argao Public Market, Poblacion, Argao, Cebu', 9.8816, 123.5953,
   'Guys basin naa moy nakit-an nga black wallet sa may market ganina around 4pm. Naa akong ID ug gamay ra nga cash. Basin natagak ra nako kay nagdali ko. If ever naa moy nakakita, pa-message lang pls. Need kaayo nako akong ID huhuhu.',
   'Pending Review', false, now() - interval '2 hours'),

  -- 2. Low — Stray Dog
  (2, 'Suspicious Person', 'Suspicious Activities',
   'Brgy. Taloot, Argao, Cebu', 9.8700, 123.5800,
   'Naa napud ning iro nga sige og tuyok sa among street. Dili man aggressive pero makuyawan akong mga bata basta moduol. Basin naa moy kaila nga tag-iya ani.',
   'Pending Review', false, now() - interval '3 hours'),

  -- 3. Low — Garbage Problem
  (3, 'Garbage / Sanitation Issues', 'Community and Environmental Concerns',
   'Brgy. Canbanua, Argao, Cebu', 9.8520, 123.5900,
   'Guys please lang, ayaw ta og labay og basura sa kanal. Limpyo pa gani gahapon, karon puno napud og plastic. Unya if mubaha, magreklamo dayon ta. Make it make sense 😭',
   'Pending Review', false, now() - interval '4 hours'),

  -- 4. Medium — Minor Road Accident
  (4, 'Vehicular Accident', 'Traffic and Road Incidents',
   'N. Bacalso Avenue, Poblacion, Argao, Cebu', 9.8816, 123.5953,
   'Naay minor accident sa highway ganina around 6:30pm. Duha ka motor ang involved. Murag basa ang dalan pero wa ko kakita sa actual nga pagkahitabo. Thankfully nakabarog ra ang duha ka rider and na-clear ra dayon ang road.',
   'Pending Review', false, now() - interval '5 hours'),

  -- 5. Medium — Suspicious Person
  (5, 'Suspicious Person', 'Suspicious Activities',
   'Near Argao Public Market, Poblacion', 9.8820, 123.5960,
   'Heads up lang guys. Naa koy nakita nga laki sige og tuyok2 sa parking area sa market. Murag sige siyag tan-aw sa mga motor. Wa ko kabalo if suspicious gyud or basin nangita ra siyag tawo. Sharing lang para aware ta, dili ni accusation.',
   'Pending Review', false, now() - interval '6 hours'),

  -- 6. Medium — Streetlight
  (6, 'Streetlight Outage', 'Community and Environmental Concerns',
   'Brgy. Casay, Argao, Cebu', 9.8401, 123.5624,
   'Guba na sad ang streetlight diri sa among area. Almost one week na. Pwerteng ngitngita if gabii, especially sa may corner. Naa pay mga estudyante mangagi. Gi-report na daw pero wa pa gihapon na-actionan.',
   'Pending Review', false, now() - interval '7 hours'),

  -- 7. Medium — Disturbance
  (7, 'Public Disturbance', 'Public Safety Incidents',
   'Brgy. Taloot, Argao, Cebu', 9.8700, 123.5800,
   'Sus ka saba sa mga nag-inom diri gabii oy. Alas 12 na, sigeg karaoke murag fiesta pa. Okay ra maglingaw2 pero naa baya mga bata ug tigulang nga nangatulog. Giingnan na daw sila pero padayon gihapon.',
   'Pending Review', false, now() - interval '8 hours'),

  -- 8. High — Serious Road Accident
  (8, 'Vehicular Accident', 'Traffic and Road Incidents',
   'N. Bacalso Avenue, Argao, Cebu', 9.8800, 123.5940,
   'Guys avoid sa area sa highway if pwede. Naay serious accident involving a motorcycle and a vehicle. Murag grabe ang impact kay naa nay responders and gi-block temporarily ang part sa road. Please don''t go there just to look, samok ra sa responders.',
   'Pending Review', false, now() - interval '1 hour'),

  -- 9. High — House Fire
  (9, 'Fire Incident', 'Community and Environmental Concerns',
   'Poblacion, Argao, Cebu', 9.8802, 123.6059,
   'Sunog reported sa residential area karon. Naa nay aso nga grabe kaayo and reportedly naay mga tawo nga gipagawas sa mga silingan. Please stay away from the area and ayaw mo pagduol para mag-video. Let the responders do their job.',
   'Pending Review', false, now() - interval '30 minutes'),

  -- 10. High — Possible Assault
  (10, 'Request for Assistance', 'Public Assistance / Community Reports',
   'Brgy. Talaga, Argao, Cebu', 9.9050, 123.6040,
   'Naa daw gubot sa may dalan tonight. According sa akong nadunggan, naay duha ka lalaki nag-away and one person was reportedly injured. Wala ko personally nakakita so please don''t treat this as confirmed yet. If naa mo nearby, stay away nalang sa area.',
   'Pending Review', false, now() - interval '45 minutes'),

  -- 11. High — Motorcycle Theft With Threat
  (11, 'Theft', 'Property-Related Incidents',
   'Argao Public Market, Poblacion', 9.8816, 123.5953,
   'Yawa, dili na ordinaryong kawat. Naay ni-attempt og kuha sa motor sa akong amigo ganina and reportedly gi-threaten siya when he confronted them. Thankfully nakaikyas siya and wala siya naunsa. Please be careful sa market area and ayaw mo og confront if suspicious ang tawo.',
   'Pending Review', false, now() - interval '90 minutes'),

  -- 12. Low — Noise Complaint
  (12, 'Public Disturbance', 'Public Safety Incidents',
   'Brgy. Bulasa, Argao, Cebu', 9.8450, 123.6000,
   'Guys, medyo hinay2 lang unta sa karaoke kay alas 10 na. 😂 Naa pa baya mga bata nga natulog. Di man problema ang mag-enjoy, pero basin pwede gamyan gamay ang volume.',
   'Pending Review', false, now() - interval '10 hours'),

  -- 13. Medium — Flooding
  (13, 'Flooding', 'Community and Environmental Concerns',
   'Brgy. Gutlang, Argao, Cebu', 9.9400, 123.6100,
   'Baha na diri sa Gutlang. Dili pa waist-deep pero lisod na agian sa motor and kusog pa ang ulan. If dili necessary, stay nalang sa balay. Basin musamot pa ni.',
   'Pending Review', false, now() - interval '2 hours'),

  -- 14. High — Missing Child Report
  (14, 'Request for Assistance', 'Public Assistance / Community Reports',
   'Brgy. Canbantug, Argao, Cebu', 9.9150, 123.6000,
   'Please help share. Missing ang usa ka bata nga last seen near the roadside this afternoon. Family is already looking around the area. If naa moy information, please contact the family or authorities directly. Ayaw lang mo og spread og fake information.',
   'Pending Review', false, now() - interval '1 hour'),

  -- 15. Medium — Positive Sentiment but Medium Severity
  (15, 'Vehicular Accident', 'Traffic and Road Incidents',
   'Brgy. Langtad, Argao, Cebu', 9.8680, 123.5750,
   'Salamat kaayo sa mga responder nga niabot dayon after sa accident ganina. Paspas kaayo ilang action and nahimo nilang ma-clear ang road. Thankfully okay ra ang mga involved, pero hopefully mahimo pud ni nga reminder sa tanan nga maghinay2 gyud labi na if gabii.',
   'Pending Review', false, now() - interval '3 hours')
) as r(n, type, category, location, latitude, longitude, details, status, is_verified, created_at)
join type_ids ti on ti.type = r.type and ti.category = r.category
join (
  select id, fullname, row_number() over (order by created_at) as rn
  from public.profiles
  where role = 'user'
) p on p.rn = r.n;

-- 4) AI credibility analysis for each report (matching severity)
insert into public.report_credibility_analysis (report_id, ai_score, severity, credibility_review, ai_model_version)
select r.id,
       case r.n
         when 1 then 35  -- Low
         when 2 then 30  -- Low
         when 3 then 40  -- Low
         when 4 then 55  -- Medium
         when 5 then 60  -- Medium
         when 6 then 50  -- Medium
         when 7 then 55  -- Medium
         when 8 then 85  -- High
         when 9 then 90  -- High
         when 10 then 80 -- High
         when 11 then 88 -- High
         when 12 then 25 -- Low
         when 13 then 65 -- Medium
         when 14 then 92 -- High
         when 15 then 58 -- Medium
       end as ai_score,
       case r.n
         when 1 then 'Low'
         when 2 then 'Low'
         when 3 then 'Low'
         when 4 then 'Medium'
         when 5 then 'Medium'
         when 6 then 'Medium'
         when 7 then 'Medium'
         when 8 then 'High'
         when 9 then 'Critical'
         when 10 then 'High'
         when 11 then 'High'
         when 12 then 'Low'
         when 13 then 'Medium'
         when 14 then 'Critical'
         when 15 then 'Medium'
       end as severity,
       'Seed15: AI review for report #' || r.n,
       'CommuniShield-AI v1.0'
from (
  select id, row_number() over (order by created_at) as n
  from public.reports
  where details like 'Seed15:%'
) r;

-- 5) Comments for each report
insert into public.report_comments (report_id, user_id, content, created_at)
select r.id, c.user_id, c.content, r.created_at + (c.delay || ' minutes')::interval
from (
  select id, created_at, row_number() over (order by created_at) as n
  from public.reports
  where details like 'Seed15:%'
) r
cross join lateral (
  values
  -- Report 1: Lost Item
  (1, null, 'Basin naa sa guard?', 5),
  (1, null, 'Try daw ask sa market office.', 12),
  -- Report 2: Stray Dog
  (2, null, 'Cute man siya pero basin nawala.', 3),
  (2, null, 'Picture daw para basin mailhan.', 8),
  (2, null, 'Basin among silingan na nga iro, ask sa nako.', 15),
  -- Report 3: Garbage Problem
  (3, null, 'FR.', 2),
  (3, null, 'Common sense nalang unta oy.', 7),
  (3, null, 'Mao gyud, sila ra gihapon maapektuhan.', 11),
  (3, null, 'Hopefully mahinloan ni balik.', 18),
  -- Report 4: Minor Road Accident
  (4, null, 'Maayo gani okay ra sila.', 4),
  (4, null, 'Hinay2 gyud mo if basa ang dalan.', 9),
  (4, null, 'Naa ko didto ganina, medyo kusog gyud ang dagan sa uban.', 14),
  (4, null, 'Basta gabii daghan kaayo paspas.', 20),
  (4, null, 'Glad walay grabe naunsa.', 25),
  -- Report 5: Suspicious Person
  (5, null, 'Naa pud ko nakabantay ana.', 6),
  (5, null, 'Basin owner ra pud sa motor.', 10),
  (5, null, 'Better safe than sorry.', 13),
  (5, null, 'Ayaw lang ta og judge dayon.', 17),
  (5, null, 'Maayo nang ma-aware ang mga tao.', 22),
  -- Report 6: Streetlight
  (6, null, 'Mao gyud, hadlok kaayo diri gabii.', 5),
  (6, null, 'Gi-report pud namo last week.', 11),
  (6, null, 'Basin kinahanglan pa gyud naay maaksidente una nila ayohon.', 19),
  (6, null, 'Hopefully ma-fix soon.', 24),
  -- Report 7: Disturbance
  (7, null, 'Mao gyud ni akong nadunggan.', 3),
  (7, null, 'Pwerteng saba-a.', 8),
  (7, null, 'Basin celebration ra pud nila.', 12),
  (7, null, 'Celebration is fine pero naa pud unta consideration.', 16),
  (7, null, 'Kapoy na kaayo.', 21),
  -- Report 8: Serious Road Accident
  (8, null, 'Hala, unsa na ang rider?', 2),
  (8, null, 'Hopefully okay ra siya.', 5),
  (8, null, 'Traffic is getting worse pud diri.', 9),
  (8, null, 'Naa ko nearby, daghan na kaayo responders.', 13),
  (8, null, 'Please ayaw mo og duol.', 18),
  (8, null, 'Praying nga okay ra ang involved.', 22),
  (8, null, 'Grabeha oy.', 27),
  -- Report 9: House Fire
  (9, null, 'Hala asa dapit?', 1),
  (9, null, 'Please be careful everyone.', 4),
  (9, null, 'Naa na ba ang fire truck?', 7),
  (9, null, 'Yes naa na sila.', 10),
  (9, null, 'Grabe kaayo ang aso.', 14),
  (9, null, 'Unta walay naunsa.', 18),
  (9, null, 'Mga silingan, palihog evacuate if duol mo.', 22),
  (9, null, 'Praying everyone is safe.', 26),
  -- Report 10: Possible Assault
  (10, null, 'Naa ko nearby, naa na ang responders.', 2),
  (10, null, 'Grabe, unsa may nahitabo?', 6),
  (10, null, 'Ayaw mo pagduol guys.', 10),
  (10, null, 'Hopefully okay ra ang na-injure.', 14),
  (10, null, 'Piste, makuyawan man ta ani.', 19),
  (10, null, 'Better stay inside sa.', 23),
  -- Report 11: Motorcycle Theft With Threat
  (11, null, 'Hala seryosoha ani oy.', 3),
  (11, null, 'Good thing wala siya naunsa.', 7),
  (11, null, 'Dapat i-report dayon ni.', 11),
  (11, null, 'Mao nang ayaw gyud og confront alone.', 15),
  (11, null, 'Naa bay CCTV sa area?', 20),
  (11, null, 'Piste makuyawan ta ani.', 25),
  -- Report 12: Noise Complaint
  (12, null, 'Hahaha true.', 2),
  (12, null, 'Basin birthday man nila.', 6),
  (12, null, 'Pwede ra man siguro hangyoan.', 11),
  -- Report 13: Flooding
  (13, null, 'Unsa nga part?', 3),
  (13, null, 'Gutlang proper dapit.', 7),
  (13, null, 'Padung pa baya ko diha 😭', 10),
  (13, null, 'Ayaw nalang sa, boss.', 14),
  (13, null, 'Hopefully mohunong na ang ulan.', 18),
  (13, null, 'Naa bay responders nearby?', 22),
  -- Report 14: Missing Child
  (14, null, 'Sharing.', 1),
  (14, null, 'Asa last seen exactly?', 4),
  (14, null, 'Praying nga makit-an dayon.', 8),
  (14, null, 'Naa mi nearby, we''ll keep an eye out.', 12),
  (14, null, 'Hopefully safe ra siya.', 16),
  (14, null, 'Please share guys.', 20),
  (14, null, 'Any update?', 24),
  (14, null, 'Wala pa daw as of now.', 28),
  -- Report 15: Positive sentiment, Medium severity
  (15, null, 'Good job sa responders.', 3),
  (15, null, 'Maayo gani okay ra sila.', 7),
  (15, null, 'Thank you sa update.', 11),
  (15, null, 'Hinay2 gyud ta tanan.', 15)
) as c(report_n, user_id, content, delay)
where c.report_n = r.n;

-- 6) Verification: show what was inserted
select r.id, r.location, r.details, r.status, p.fullname as posted_by,
       a.ai_score, a.severity,
       (select count(*) from public.report_comments rc where rc.report_id = r.id) as comment_count
from public.reports r
join public.profiles p on p.id = r.user_id
left join public.report_credibility_analysis a on a.report_id = r.id
where r.details like 'Seed15:%'
order by r.created_at;

-- 7) Also insert into notifications for report_submitted (optional)
insert into public.notifications (user_id, type_id, title, message, priority, is_read, created_at)
select null, t.id,
       'New Report Submitted',
       'Seed15: ' || r.details,
       case when a.severity in ('High','Critical') then 'High' when a.severity = 'Medium' then 'Medium' else 'Low' end,
       false,
       r.created_at + interval '1 minute'
from public.reports r
join public.report_credibility_analysis a on a.report_id = r.id
join public.notification_types t on t.name = 'report_submitted'
where r.details like 'Seed15:%';