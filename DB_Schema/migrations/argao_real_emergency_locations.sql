-- Correct only the two named Argao stations. Preserve row IDs and other places.
begin;
update public.emergency_facilities set
  latitude = 9.8807935, longitude = 123.6087917,
  address = 'Baluarte Beach Resort, General Ortega St, Argao, 6021 Cebu',
  phone = '09425533464'
where type = 'police' and lower(trim(name)) in ('argao police station', 'argao municipal police station');

update public.emergency_facilities set
  latitude = 9.8819689, longitude = 123.6003262,
  address = 'VJJ2+Q4, Argao, Cebu', phone = '(032)8872837'
where type = 'fire' and lower(trim(name)) in ('argao fire station', 'argao fire station (old railway stn)');

insert into public.emergency_facilities(name, type, latitude, longitude, address, phone)
select 'Argao Police Station', 'police', 9.8807935, 123.6087917,
  'Baluarte Beach Resort, General Ortega St, Argao, 6021 Cebu', '09425533464'
where not exists(select 1 from public.emergency_facilities where type='police' and lower(trim(name)) in ('argao police station','argao municipal police station'));

insert into public.emergency_facilities(name, type, latitude, longitude, address, phone)
select 'Argao Fire Station', 'fire', 9.8819689, 123.6003262, 'VJJ2+Q4, Argao, Cebu', '(032)8872837'
where not exists(select 1 from public.emergency_facilities where type='fire' and lower(trim(name)) in ('argao fire station','argao fire station (old railway stn)'));
commit;
