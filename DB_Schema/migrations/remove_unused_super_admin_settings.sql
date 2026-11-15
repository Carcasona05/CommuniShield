-- Removes only retired key/value settings. No tables/columns, reports, analyses,
-- user notification preferences, models, or Cebuano routing are changed.
begin;
delete from public.system_settings where key in (
  'map_auto_map_verified', 'map_cluster_overlay', 'map_heatmap_overlay',
  'map_default_zoom', 'map_center', 'notification_email', 'notification_push',
  'ai_high_threshold', 'ai_medium_threshold', 'ai_api_endpoint'
);
commit;
