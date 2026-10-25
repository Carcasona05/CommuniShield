-- Reference/default data only; no users, sample reports or trained models.

begin;

insert into public."incident_categories" ("name") values
('Community and Environmental Concerns'),
('Cyber and Online Incidents (Non-sensitive)'),
('Property-Related Incidents'),
('Public Assistance / Community Reports'),
('Public Safety Incidents'),
('Suspicious Activities'),
('Traffic and Road Incidents')
on conflict ("name") do nothing;

insert into public."system_settings" ("key","value") values
('ai_api_endpoint',''),
('ai_high_threshold','85'),
('ai_medium_threshold','60'),
('ai_model_name','gemini-3.6-flash'),
('ai_model_version','CommuniShield-AI v1.0'),
('ai_scoring_enabled','true'),
('ai_temperature','0.1'),
('ai_timeout','30000'),
('map_auto_map_verified','true'),
('map_center','Argao, Cebu'),
('map_cluster_overlay','true'),
('map_default_zoom','13'),
('map_heatmap_overlay','true'),
('notification_email','true'),
('notification_push','false'),
('sentiment_cebuano_mode','gemini'),
('sentiment_gemini_enabled','true'),
('sentiment_local_model_enabled','true')
on conflict ("key") do nothing;

insert into public."emergency_facilities" ("name","type","latitude","longitude","address","phone") values
('Argao Fire Station','fire',9.8738,123.5998,'Poblacion, Argao, Cebu','911'),
('Argao Municipal Police Station','police',9.8721,123.5986,'Poblacion, Argao, Cebu','911')
on conflict ("name") do nothing;

insert into public."sentiment_model_state" ("id","generation","data_revision") values
(1,0,0)
on conflict ("id") do nothing;

insert into public."sentiment_supporting_settings" ("id","max_enabled") values
(1,3)
on conflict ("id") do nothing;

insert into public.incident_types(category_id,name) select c.id,t.name from (values
('Community and Environmental Concerns','Blocked Drainage'),
('Community and Environmental Concerns','Fire Incident'),
('Community and Environmental Concerns','Flooding'),
('Community and Environmental Concerns','Garbage / Sanitation Issues'),
('Community and Environmental Concerns','Streetlight Outage'),
('Cyber and Online Incidents (Non-sensitive)','Cyberbullying'),
('Cyber and Online Incidents (Non-sensitive)','Fake Information / Misinformation'),
('Cyber and Online Incidents (Non-sensitive)','Online Scam / Suspicious Message'),
('Property-Related Incidents','Lost Property'),
('Property-Related Incidents','Shoplifting'),
('Property-Related Incidents','Theft'),
('Property-Related Incidents','Vandalism / Property Damage'),
('Public Assistance / Community Reports','General Safety Concern'),
('Public Assistance / Community Reports','Lost Item'),
('Public Assistance / Community Reports','Missing Pet'),
('Public Assistance / Community Reports','Request for Assistance'),
('Public Safety Incidents','Harassment'),
('Public Safety Incidents','Loitering / Suspicious Presence'),
('Public Safety Incidents','Public Disturbance'),
('Public Safety Incidents','Trespassing'),
('Suspicious Activities','Loitering / Suspicious Presence'),
('Suspicious Activities','Suspicious Person'),
('Suspicious Activities','Suspicious Vehicle'),
('Suspicious Activities','Unattended / Abandoned Object'),
('Suspicious Activities','Unusual Behavior'),
('Traffic and Road Incidents','Illegal Parking'),
('Traffic and Road Incidents','Reckless Driving'),
('Traffic and Road Incidents','Road Obstruction'),
('Traffic and Road Incidents','Vehicular Accident')) t(category,name) join public.incident_categories c on c.name=t.category on conflict(category_id,name) do nothing;

insert into public.app_settings(ai_credibility_enabled,high_credibility_threshold,medium_credibility_threshold) select true,90,60 where not exists(select 1 from public.app_settings);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('sentiment-models','sentiment-models',false,104857600,array['application/octet-stream','application/json']::text[]) on conflict(id) do nothing;

commit;

