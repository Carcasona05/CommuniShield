-- ============================================================
-- CommuniShield — demo seed data (accounts NOT included)
-- Run the whole file in the Supabase SQL editor. Re-run safe.
-- Tables that require a user account are skipped by design:
--   notifications, login_activities, user_credibility,
--   credibility_events, report_likes.
-- ============================================================

-- 0) cleanup previous demo seeds
delete from public.report_credibility_analysis
where credibility_review like 'Sample AI review:%';

delete from public.report_validations
where remarks like 'Sample validation:%';

delete from public.audit_logs
where title like 'Sample log:%';

delete from public.reports
where details like 'Sample report:%';

delete from public.admin_announcement
where details like 'Sample announcement:%';

delete from public.admin_posts
where details like 'Sample post:%';

delete from public.notifications
where message like 'Sample notif:%';

-- allow system/admin notifications without a user account (idempotent)
alter table public.notifications alter column user_id drop not null;

insert into public.notification_types (name) values
  ('report_status'),
  ('nearby_incident'),
  ('admin_account'),
  ('report_submitted'),
  ('ai_validation'),
  ('report_approved'),
  ('system'),
  ('log')
on conflict (name) do nothing;

-- 1) incident lookup tables (idempotent; no-op if reports_schema.sql already ran)
insert into public.incident_categories (name) values
  ('Public Safety Incidents'),
  ('Property-Related Incidents'),
  ('Traffic and Road Incidents'),
  ('Community and Environmental Concerns'),
  ('Suspicious Activities'),
  ('Public Assistance / Community Reports'),
  ('Cyber and Online Incidents (Non-sensitive)')
on conflict (name) do nothing;

insert into public.incident_types (category_id, name)
select c.id, t.incident_type
from (values
  ('Public Safety Incidents', 'Public Disturbance'),
  ('Public Safety Incidents', 'Harassment'),
  ('Public Safety Incidents', 'Loitering / Suspicious Presence'),
  ('Public Safety Incidents', 'Trespassing'),
  ('Property-Related Incidents', 'Theft'),
  ('Property-Related Incidents', 'Lost Property'),
  ('Property-Related Incidents', 'Vandalism / Property Damage'),
  ('Property-Related Incidents', 'Shoplifting'),
  ('Traffic and Road Incidents', 'Vehicular Accident'),
  ('Traffic and Road Incidents', 'Reckless Driving'),
  ('Traffic and Road Incidents', 'Illegal Parking'),
  ('Traffic and Road Incidents', 'Road Obstruction'),
  ('Community and Environmental Concerns', 'Fire Incident'),
  ('Community and Environmental Concerns', 'Flooding'),
  ('Community and Environmental Concerns', 'Blocked Drainage'),
  ('Community and Environmental Concerns', 'Garbage / Sanitation Issues'),
  ('Community and Environmental Concerns', 'Streetlight Outage'),
  ('Suspicious Activities', 'Suspicious Person'),
  ('Suspicious Activities', 'Suspicious Vehicle'),
  ('Suspicious Activities', 'Unattended / Abandoned Object'),
  ('Suspicious Activities', 'Unusual Behavior'),
  ('Public Assistance / Community Reports', 'Missing Pet'),
  ('Public Assistance / Community Reports', 'Lost Item'),
  ('Public Assistance / Community Reports', 'Request for Assistance'),
  ('Public Assistance / Community Reports', 'General Safety Concern'),
  ('Cyber and Online Incidents (Non-sensitive)', 'Online Scam / Suspicious Message'),
  ('Cyber and Online Incidents (Non-sensitive)', 'Cyberbullying'),
  ('Cyber and Online Incidents (Non-sensitive)', 'Fake Information / Misinformation')
) as t(category_name, incident_type)
join public.incident_categories c on c.name = t.category_name
on conflict (category_id, name) do nothing;

-- 2) 200 sample reports spread over the last ~8 days
with pairs as (
  select row_number() over () as rn, p.*
  from (values
    ('Public Safety Incidents','Public Disturbance'),
    ('Public Safety Incidents','Harassment'),
    ('Public Safety Incidents','Loitering / Suspicious Presence'),
    ('Public Safety Incidents','Trespassing'),
    ('Property-Related Incidents','Theft'),
    ('Property-Related Incidents','Lost Property'),
    ('Property-Related Incidents','Vandalism / Property Damage'),
    ('Property-Related Incidents','Shoplifting'),
    ('Traffic and Road Incidents','Vehicular Accident'),
    ('Traffic and Road Incidents','Reckless Driving'),
    ('Traffic and Road Incidents','Illegal Parking'),
    ('Traffic and Road Incidents','Road Obstruction'),
    ('Community and Environmental Concerns','Fire Incident'),
    ('Community and Environmental Concerns','Flooding'),
    ('Community and Environmental Concerns','Blocked Drainage'),
    ('Community and Environmental Concerns','Garbage / Sanitation Issues'),
    ('Community and Environmental Concerns','Streetlight Outage'),
    ('Suspicious Activities','Suspicious Person'),
    ('Suspicious Activities','Suspicious Vehicle'),
    ('Suspicious Activities','Unattended / Abandoned Object'),
    ('Suspicious Activities','Unusual Behavior'),
    ('Public Assistance / Community Reports','Missing Pet'),
    ('Public Assistance / Community Reports','Lost Item'),
    ('Public Assistance / Community Reports','Request for Assistance'),
    ('Public Assistance / Community Reports','General Safety Concern'),
    ('Cyber and Online Incidents (Non-sensitive)','Online Scam / Suspicious Message'),
    ('Cyber and Online Incidents (Non-sensitive)','Cyberbullying'),
    ('Cyber and Online Incidents (Non-sensitive)','Fake Information / Misinformation')
  ) as p(category, type)
),
barangays as (
  select * from (values
    ('Poblacion', 9.8816, 123.5953),
    ('Lamacan', 9.8950, 123.6000),
    ('Talaga', 9.9050, 123.6040),
    ('Canbanua', 9.8520, 123.5900),
    ('Bugang', 9.8600, 123.5700),
    ('Conalum', 9.8850, 123.6100),
    ('Dawis', 9.8700, 123.5800),
    ('Guiwanon', 9.9000, 123.5900),
    ('Kabangkalan', 9.9150, 123.6000),
    ('Kasambagan', 9.8400, 123.5800),
    ('Langtad', 9.8680, 123.5750),
    ('Mango', 9.8780, 123.6120),
    ('Matic', 9.8900, 123.6180),
    ('Mindalusan', 9.9200, 123.5950),
    ('Oboj', 9.9400, 123.6100),
    ('Osang', 9.9300, 123.5850),
    ('Pajija', 9.9500, 123.6200),
    ('Tulic', 9.9550, 123.6050),
    ('San Miguel', 9.8600, 123.6050),
    ('Binlod', 9.8450, 123.6000)
  ) as b(barangay, lat, lng)
),
nums as (select generate_series(1, 200) as n),
seed as (
  select
    n.n,
    (1 + floor(random()*28))::int as pair_rn,
    (1 + floor(random()*20))::int as brgy_rn,
    (array['Pending Review','Pending Review','Pending Review','Pending Review',
           'Under Verification','Under Verification','Resolved','Rejected','Rejected','Archived']
    )[1+floor(random()*10)] as status
  from nums n
),
combined as (
  select s.n, p.category, p.type, b.barangay, b.lat, b.lng, s.status
  from seed s
  join pairs p on p.rn = s.pair_rn
  join (select row_number() over () as rn, * from barangays) b on b.rn = s.brgy_rn
)
insert into public.reports (user_id, incident_type_id, location, latitude, longitude, poster_name, display_name_type, details, status, is_verified, created_at)
select
  null,
  it.id,
  c.barangay || ', Argao, Cebu',
  round((c.lat + (random()-0.5)*0.012)::numeric, 6),
  round((c.lng + (random()-0.5)*0.012)::numeric, 6),
  'Sample Reporter ' || c.n,
  'Fullname',
  'Sample report: ' || c.type || ' in ' || c.barangay || ' (#' || c.n || ')',
  c.status,
  c.status = 'Resolved',
  now() - (c.n || ' hours')::interval
from combined c
join public.incident_categories ic on ic.name = c.category
join public.incident_types it on it.category_id = ic.id and it.name = c.type;

-- 2b) AI analysis for every sample report
with scored as (
  select r.id, (floor(random()*79+20))::int as score
  from public.reports r
  where r.details like 'Sample report:%'
)
insert into public.report_credibility_analysis (report_id, ai_score, severity, sentiment, credibility_review, ai_model_version)
select s.id, s.score,
  case
    when s.score >= 80 then 'Critical'
    when s.score >= 65 then 'High'
    when s.score >= 45 then 'Medium'
    else 'Low'
  end,
  (array['Negative','Neutral','Positive','Concerned','Anxious','Unclear'])[1+floor(random()*6)],
  'Sample AI review: generated score ' || s.score || '.',
  'CommuniShield-AI v1.0'
from scored s
left join public.report_credibility_analysis a on a.report_id = s.id
where a.report_id is null;

-- 3) photos on the 6 newest sample reports
insert into public.report_images (report_id, image_url, position)
select r.id, 'https://picsum.photos/seed/' || r.id || '/640/420', 0
from public.reports r
where r.details like 'Sample report:%'
order by r.created_at desc
limit 6;

-- 4) comments on every sample report (drives the sentiment analysis)
insert into public.report_comments (report_id, user_id, content)
select r.id, null, c
from public.reports r
cross join (values
  ('Please check this area, it looks unsafe.'),
  ('This has been happening for a few days now.'),
  ('Salamat sa report, sana maaksyunan agad.'),
  ('A lot of residents are worried about this.'),
  ('Thanks for the update, keep us posted.'),
  ('Hope the authorities respond quickly.')
) as v(c)
where r.details like 'Sample report:%';

-- 5) public announcements
insert into public.admin_announcement (admin_id, type, title, location, details, pic_url) values
  (null, 'Curfew', 'Curfew Reminder', 'Argao, Cebu', 'Sample announcement: Curfew is still in effect from 10 PM to 4 AM. Please stay safe.', null),
  (null, 'Weather Advisory', 'Weather Advisory', 'Argao, Cebu', 'Sample announcement: Heavy rain expected tonight. Avoid flooded areas.', null),
  (null, 'Road Closure', 'Road Closure Notice', 'Poblacion, Argao', 'Sample announcement: Road temporarily closed for repair near the public market.', null);

-- 6) admin posts (user feed "Admin" source)
insert into public.admin_posts (admin_id, type, location, details, pic_url) values
  (null, 'Safety/Tips', 'Argao, Cebu', 'Sample post: Always lock your doors and report suspicious activity.', null),
  (null, 'Seminar', 'Municipal Hall, Argao', 'Sample post: Barangay safety seminar on Saturday at 9 AM.', null);

-- 7) validation history for processed reports
insert into public.report_validations (report_id, admin_id, action, previous_status, new_status, remarks)
select r.id, null,
  case
    when r.status = 'Rejected' then 'Rejected'
    when r.status = 'Resolved' then 'Resolved'
    else 'Under Verification'
  end,
  'Pending Review',
  r.status,
  'Sample validation: reviewed by admin.'
from public.reports r
where r.details like 'Sample report:%'
  and r.status in ('Resolved', 'Rejected', 'Under Verification')
order by r.created_at desc
limit 20;

-- 8) audit logs
insert into public.audit_logs (actor_id, actor_name, action_type, title, details, old_value, new_value) values
  (null, 'System', 'System Settings Updated', 'Sample log: settings updated', 'AI credibility thresholds were updated.', '60', '65'),
  (null, 'CommuniShield Admin', 'Admin Added', 'Sample log: admin account created', 'A new admin account was added to the system.', null, 'admin@example.com'),
  (null, 'CommuniShield Admin', 'Report Verified', 'Sample log: report verified', 'A sample report was reviewed and verified.', 'Pending', 'Verified');

-- 8b) admin/system notifications (no user account required)
insert into public.notifications (user_id, type_id, title, message, priority, is_read, created_at)
select null, t.id, v.title, v.message, v.priority, v.unread, now() - (v.hours || ' hours')::interval
from (values
  ('report_submitted', 'New Report Submitted', 'Sample notif: A new incident report was submitted near Poblacion, Argao.', 'High', false, 1),
  ('ai_validation', 'AI Validation Completed', 'Sample notif: A report received a credibility score of 92%.', 'Medium', false, 2),
  ('report_approved', 'Report Approved', 'Sample notif: A report was approved and mapped by the admin.', 'Low', false, 5),
  ('system', 'System Activity Logged', 'Sample notif: AI processing logs were updated successfully.', 'Low', true, 24)
) as v(type_name, title, message, priority, unread, hours)
join public.notification_types t on t.name = v.type_name;

-- 9) emergency facilities (idempotent)
insert into public.emergency_facilities (name, type, latitude, longitude, address, phone) values
  ('Argao Municipal Police Station', 'police', 9.8721, 123.5986, 'Poblacion, Argao, Cebu', '911'),
  ('Argao Fire Station', 'fire', 9.8738, 123.5998, 'Poblacion, Argao, Cebu', '911')
on conflict (name) do nothing;

-- 10) app settings + system settings (idempotent)
insert into public.app_settings (ai_credibility_enabled, high_credibility_threshold, medium_credibility_threshold)
select true, 90, 60
where not exists (select 1 from public.app_settings);

insert into public.system_settings (key, value) values
  ('map_auto_map_verified', 'true'),
  ('map_cluster_overlay', 'true'),
  ('map_heatmap_overlay', 'true'),
  ('map_default_zoom', '13'),
  ('map_center', 'Argao, Cebu'),
  ('notification_email', 'true'),
  ('notification_push', 'false'),
  ('ai_model_version', 'CommuniShield-AI v1.0'),
  ('ai_api_endpoint', '')
on conflict (key) do nothing;
