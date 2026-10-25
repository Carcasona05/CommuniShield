alter table public."admin_announcement" add constraint "admin_announcement_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public."admin_posts" add constraint "admin_posts_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public."audit_logs" add constraint "audit_logs_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public."audit_logs" add constraint "audit_logs_report_id_fkey" FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE SET NULL;

alter table public."credibility_events" add constraint "credibility_events_report_id_fkey" FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE SET NULL;

alter table public."credibility_events" add constraint "credibility_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public."incident_types" add constraint "incident_types_category_id_fkey" FOREIGN KEY (category_id) REFERENCES incident_categories(id) ON DELETE CASCADE;

alter table public."login_activities" add constraint "login_activities_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public."notification_nearby_incident" add constraint "notification_nearby_incident_notification_id_fkey" FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE;

alter table public."notification_nearby_incident" add constraint "notification_nearby_incident_report_id_fkey" FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE SET NULL;

alter table public."notification_report_status" add constraint "notification_report_status_notification_id_fkey" FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE;

alter table public."notification_report_status" add constraint "notification_report_status_report_id_fkey" FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE SET NULL;

alter table public."notifications" add constraint "notifications_type_id_fkey" FOREIGN KEY (type_id) REFERENCES notification_types(id);

alter table public."notifications" add constraint "notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public."report_comments" add constraint "report_comments_report_id_fkey" FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE;

alter table public."report_comments" add constraint "report_comments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public."report_credibility_analysis" add constraint "report_credibility_analysis_report_id_fkey" FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE;

alter table public."report_images" add constraint "report_images_report_id_fkey" FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE;

alter table public."report_likes" add constraint "report_likes_report_id_fkey" FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE;

alter table public."report_likes" add constraint "report_likes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public."report_validations" add constraint "report_validations_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public."report_validations" add constraint "report_validations_report_id_fkey" FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE;

alter table public."reports" add constraint "reports_incident_type_id_fkey" FOREIGN KEY (incident_type_id) REFERENCES incident_types(id) ON DELETE SET NULL;

alter table public."reports" add constraint "reports_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public."sentiment_dataset_events" add constraint "sentiment_dataset_events_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public."sentiment_dataset_events" add constraint "sentiment_dataset_events_dataset_id_fkey" FOREIGN KEY (dataset_id) REFERENCES sentiment_datasets(id);

alter table public."sentiment_datasets" add constraint "sentiment_datasets_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public."sentiment_datasets" add constraint "sentiment_datasets_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public."sentiment_model_state" add constraint "sentiment_model_state_active_job_id_fkey" FOREIGN KEY (active_job_id) REFERENCES sentiment_training_jobs(id);

alter table public."sentiment_model_state" add constraint "sentiment_model_state_previous_job_id_fkey" FOREIGN KEY (previous_job_id) REFERENCES sentiment_training_jobs(id);

alter table public."sentiment_supporting_models" add constraint "sentiment_supporting_models_id_fkey" FOREIGN KEY (id) REFERENCES sentiment_training_jobs(id);

alter table public."sentiment_training_events" add constraint "sentiment_training_events_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public."sentiment_training_events" add constraint "sentiment_training_events_job_id_fkey" FOREIGN KEY (job_id) REFERENCES sentiment_training_jobs(id);

alter table public."sentiment_training_jobs" add constraint "sentiment_training_jobs_base_job_id_fkey" FOREIGN KEY (base_job_id) REFERENCES sentiment_training_jobs(id);

alter table public."sentiment_training_samples" add constraint "sentiment_training_samples_dataset_id_fkey" FOREIGN KEY (dataset_id) REFERENCES sentiment_datasets(id);

alter table public."user_credibility" add constraint "user_credibility_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public."user_terms_acceptance" add constraint "user_terms_acceptance_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
