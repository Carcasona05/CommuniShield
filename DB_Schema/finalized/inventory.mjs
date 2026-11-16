// User-supplied 39-table contract. ? means nullable; column order is immaterial.
// PostgreSQL numeric precision from existing definitions is intentionally retained.
export const inventory = {
  incident_categories: 'id:u name:t created_at:z',
  incident_types: 'id:u category_id:u name:t',
  reports: 'id:u user_id:u? incident_type_id:u? location:t? latitude:f? longitude:f? poster_name:t? display_name_type:t details:t status:t is_verified:b created_at:z updated_at:z role:t',
  report_images: 'id:u report_id:u image_url:t position:i created_at:z',
  report_comments: 'id:u report_id:u user_id:u? content:t created_at:z',
  report_likes: 'report_id:u user_id:u created_at:z',
  profiles: 'id:u first_name:t? middle_name:t? last_name:t? fullname:t? user_name:t? role:t phone:t? department:t? status:t created_at:z updated_at:z birthdate:d? location:t? notifications_enabled:b crime_alerts_enabled:b',
  notification_types: 'id:u name:t created_at:z',
  notifications: 'id:u user_id:u type_id:u title:t message:t priority:t is_read:b created_at:z updated_at:z',
  notification_report_status: 'notification_id:u report_id:u? location:t? is_verified:b',
  notification_nearby_incident: 'notification_id:u report_id:u? distance_meters:n? level:t',
  login_activities: 'id:u user_id:u device:t location:t? is_current:b created_at:z',
  emergency_facilities: 'id:u name:t type:t latitude:f longitude:f address:t phone:t created_at:z',
  user_credibility: 'id:u user_id:u score:n level:s level_label:t updated_at:z',
  credibility_events: 'id:u user_id:u event_type:t points:n reason:t report_id:u? created_at:z',
  report_credibility_analysis: 'id:u report_id:u ai_score:n severity:t credibility_level:t credibility_review:t ai_model_version:t analyzed_at:z analysis_duration_ms:i',
  app_settings: 'id:u ai_credibility_enabled:b high_credibility_threshold:s medium_credibility_threshold:s updated_at:z',
  audit_logs: 'id:u actor_id:u? actor_name:t action_type:t title:t details:t report_id:u? old_value:t? new_value:t? created_at:z',
  report_validations: 'id:u report_id:u admin_id:u? action:t previous_status:t? new_status:t remarks:t created_at:z',
  admin_announcement: 'id:u admin_id:u? type:t title:t location:t? details:t pic_url:t? created_at:z updated_at:z',
  system_settings: 'key:t value:t updated_at:z',
  user_terms_acceptance: 'id:u user_id:u terms_version:t accepted_at:z',
  sentiment_analysis: 'id:u subject_type:t subject_id:u label:t confidence:n language:t provider:t model:t status:t input_hash:t source_text:t error_code:t analyzed_at:z? request_id:t created_at:z updated_at:z decision:j?',
  sentiment_datasets: 'id:u name:t source:t status:t created_by:u? created_by_name:t reviewed_by:u? review_note:t version:i created_at:z updated_at:z',
  sentiment_training_samples: 'id:u dataset_id:u text:t language:t label:t text_key:t active:b',
  sentiment_dataset_events: 'id:u dataset_id:u actor_id:u? actor_name:t action:t details:j created_at:z',
  sentiment_training_jobs: 'id:u status:t created_at:z available_at:z started_at:z? finished_at:z? lease_token:u? lease_until:z? data_revision:l? base_generation:l? base_job_id:u? snapshot:j? metrics:j? artifact_manifest:j? error:t? training_mode:t training_languages:ta? progress:j? progress_lease_token:u? selected_dataset_versions:j?',
  sentiment_model_state: 'id:i generation:l data_revision:l active_job_id:u? previous_job_id:u? updated_at:z',
  sentiment_training_events: 'id:u job_id:u? actor_id:u? action:t details:j created_at:z',
  sentiment_supporting_models: 'id:u name:t status:t artifact_manifest:j routing_policy:j metrics:j datasets:j use_count:l last_used_at:z? created_at:z updated_at:z deleted_at:z?',
  sentiment_supporting_settings: 'id:i max_enabled:i',
  admin_blotters: 'id:u admin_id:u? blotter_no:t barangay:t? location:t incident_type:t incident_datetime:z? complainant_name:t complainant_age:t? complainant_contact:t? respondent:t incident_description:t action_taken:t status:t reported_by:t blotter_officer:t date_reported:z? date_recorded:z? created_at:z',
  credibility_usage: 'kind:t source_id:u user_id:u used_at:z',
  credibility_report_effects: 'report_id:u user_id:u event_type:t applied:n active:b corrected:b',
  credibility_suspensions: 'id:u user_id:u occurrence:i duration_days:i started_at:z ends_at:z released_at:z? reason:t',
  comment_sentiment_jobs: 'comment_id:u attempts:i available_at:z lease_token:u? lease_until:z? completed_at:z? last_error:t?',
  admin_analysis_batches: 'id:u actor_id:u report_ids:ua created_at:z',
  admin_analysis_jobs: 'id:u kind:t subject_id:u report_id:u payload:j state:t attempts:i available_at:z lease_token:u? lease_until:z? last_error:t? created_at:z updated_at:z',
  admin_analysis_batch_jobs: 'batch_id:u job_id:u',
};
const types = { u:'uuid',t:'text',z:'timestamp with time zone',f:'double precision',b:'boolean',i:'integer',s:'smallint',l:'bigint',n:'numeric',j:'jsonb',d:'date',ta:'text[]',ua:'uuid[]' };
export function validateInventory(catalog) {
  const actualTables = catalog.tables.map(t => t.name).sort();
  if (JSON.stringify(actualTables) !== JSON.stringify(Object.keys(inventory).sort())) throw new Error('Expected exactly the supplied 39 tables');
  for (const [table, definition] of Object.entries(inventory)) {
    const expected = definition.split(' ').map(entry => {
      const [name, type] = entry.split(':');
      return `${name}:${types[type.replace('?', '')]}:${!type.endsWith('?')}`;
    }).sort();
    const actual = catalog.columns.filter(c => c.table_name === table)
      .map(c => `${c.name}:${c.type.replace(/^numeric\(.*\)$/, 'numeric')}:${c.required}`).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Column/type/nullability mismatch: ${table}`);
  }
}
