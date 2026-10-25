CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE TRIGGER set_admin_announcement_updated_at BEFORE UPDATE ON public.admin_announcement FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_admin_posts_updated_at BEFORE UPDATE ON public.admin_posts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_app_settings_updated_at BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_notifications_updated_at BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER on_profile_created_credibility AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION handle_new_credibility();

CREATE TRIGGER set_profiles_fullname BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_fullname();

CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER cleanup_comment_sentiment AFTER DELETE ON public.report_comments FOR EACH ROW EXECUTE FUNCTION cleanup_sentiment_analysis();

CREATE TRIGGER cleanup_comment_sentiment_on_text_change AFTER UPDATE OF content ON public.report_comments FOR EACH ROW WHEN ((old.content IS DISTINCT FROM new.content)) EXECUTE FUNCTION cleanup_sentiment_analysis();

CREATE TRIGGER cleanup_report_sentiment AFTER DELETE ON public.reports FOR EACH ROW EXECUTE FUNCTION cleanup_sentiment_analysis();

CREATE TRIGGER cleanup_report_sentiment_on_text_change AFTER UPDATE OF details ON public.reports FOR EACH ROW WHEN ((old.details IS DISTINCT FROM new.details)) EXECUTE FUNCTION cleanup_sentiment_analysis();

CREATE TRIGGER set_reports_updated_at BEFORE UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_sentiment_analysis_updated_at BEFORE UPDATE ON public.sentiment_analysis FOR EACH ROW EXECUTE FUNCTION set_sentiment_analysis_updated_at();

CREATE TRIGGER sentiment_dataset_approval_training AFTER UPDATE OF status ON public.sentiment_datasets FOR EACH ROW WHEN (((old.status IS DISTINCT FROM new.status) AND ((new.status = 'approved'::text) OR (old.status = 'approved'::text)))) EXECUTE FUNCTION queue_approved_sentiment_training();

CREATE TRIGGER set_system_settings_updated_at BEFORE UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_credibility_level_trigger BEFORE INSERT OR UPDATE ON public.user_credibility FOR EACH ROW EXECUTE FUNCTION set_credibility_level();

CREATE TRIGGER set_user_credibility_updated_at BEFORE UPDATE ON public.user_credibility FOR EACH ROW EXECUTE FUNCTION set_updated_at();

create policy "admin_delete_announcements" on public."admin_announcement" as PERMISSIVE
    for DELETE to "authenticated" using ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

create policy "admin_update_announcements" on public."admin_announcement" as PERMISSIVE
    for UPDATE to "authenticated" using ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text]))) with check ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

create policy "admin_write_announcements" on public."admin_announcement" as PERMISSIVE
    for INSERT to "authenticated" with check ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

create policy "read_all_admin_announcements" on public."admin_announcement" as PERMISSIVE
    for SELECT to "authenticated" using (true);

create policy "admin_delete_posts" on public."admin_posts" as PERMISSIVE
    for DELETE to public using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));

create policy "admin_update_posts" on public."admin_posts" as PERMISSIVE
    for UPDATE to public using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));

create policy "admin_write_posts" on public."admin_posts" as PERMISSIVE
    for INSERT to public with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));

create policy "read_all_admin_posts" on public."admin_posts" as PERMISSIVE
    for SELECT to public using (true);

create policy "admin_read_audit_logs" on public."audit_logs" as PERMISSIVE
    for SELECT to "authenticated" using ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

create policy "admin_write_audit_logs" on public."audit_logs" as PERMISSIVE
    for INSERT to "authenticated" with check ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

create policy "read_all_credibility_events" on public."credibility_events" as PERMISSIVE
    for SELECT to "authenticated" using ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

create policy "read_own_credibility_events" on public."credibility_events" as PERMISSIVE
    for SELECT to "authenticated" using ((auth.uid() = user_id));

create policy "read_all_emergency_facilities" on public."emergency_facilities" as PERMISSIVE
    for SELECT to public using (true);

create policy "read_own_login_activities" on public."login_activities" as PERMISSIVE
    for SELECT to public using ((auth.uid() = user_id));

create policy "read_own_nearby_incidents" on public."notification_nearby_incident" as PERMISSIVE
    for SELECT to public using ((EXISTS ( SELECT 1
   FROM notifications n
  WHERE ((n.id = notification_nearby_incident.notification_id) AND (n.user_id = auth.uid())))));

create policy "read_own_report_status" on public."notification_report_status" as PERMISSIVE
    for SELECT to public using ((EXISTS ( SELECT 1
   FROM notifications n
  WHERE ((n.id = notification_report_status.notification_id) AND (n.user_id = auth.uid())))));

create policy "admin_read_all_notifications" on public."notifications" as PERMISSIVE
    for SELECT to "authenticated" using ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

create policy "admin_update_all_notifications" on public."notifications" as PERMISSIVE
    for UPDATE to "authenticated" using ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text]))) with check ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

create policy "read_own_notifications" on public."notifications" as PERMISSIVE
    for SELECT to public using ((auth.uid() = user_id));

create policy "update_own_notifications" on public."notifications" as PERMISSIVE
    for UPDATE to public using ((auth.uid() = user_id));

create policy "admin_select_all_profiles" on public."profiles" as PERMISSIVE
    for SELECT to "authenticated" using ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

create policy "select_own_profile" on public."profiles" as PERMISSIVE
    for SELECT to "authenticated" using ((auth.uid() = id));

create policy "super_admin_delete_profiles" on public."profiles" as PERMISSIVE
    for DELETE to "authenticated" using ((current_user_role() = 'super_admin'::text));

create policy "super_admin_insert_profiles" on public."profiles" as PERMISSIVE
    for INSERT to "authenticated" with check ((current_user_role() = 'super_admin'::text));

create policy "super_admin_update_all" on public."profiles" as PERMISSIVE
    for UPDATE to "authenticated" using ((current_user_role() = 'super_admin'::text)) with check ((current_user_role() = 'super_admin'::text));

create policy "update_own_profile" on public."profiles" as PERMISSIVE
    for UPDATE to "authenticated" using ((auth.uid() = id)) with check ((auth.uid() = id));

create policy "delete_own_comment" on public."report_comments" as PERMISSIVE
    for DELETE to public using ((auth.uid() = user_id));

create policy "insert_comment" on public."report_comments" as PERMISSIVE
    for INSERT to public with check ((auth.uid() = user_id));

create policy "read_all_comments" on public."report_comments" as PERMISSIVE
    for SELECT to public using (true);

create policy "read_all_report_credibility" on public."report_credibility_analysis" as PERMISSIVE
    for SELECT to "authenticated" using (true);

create policy "delete_report_images" on public."report_images" as PERMISSIVE
    for DELETE to public using ((EXISTS ( SELECT 1
   FROM reports r
  WHERE ((r.id = report_images.report_id) AND (r.user_id = auth.uid())))));

create policy "insert_report_images" on public."report_images" as PERMISSIVE
    for INSERT to public with check ((EXISTS ( SELECT 1
   FROM reports r
  WHERE ((r.id = report_images.report_id) AND (r.user_id = auth.uid())))));

create policy "read_all_report_images" on public."report_images" as PERMISSIVE
    for SELECT to public using (true);

create policy "delete_own_like" on public."report_likes" as PERMISSIVE
    for DELETE to public using ((auth.uid() = user_id));

create policy "insert_own_like" on public."report_likes" as PERMISSIVE
    for INSERT to public with check ((auth.uid() = user_id));

create policy "read_all_likes" on public."report_likes" as PERMISSIVE
    for SELECT to public using (true);

create policy "admin_read_report_validations" on public."report_validations" as PERMISSIVE
    for SELECT to "authenticated" using ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

create policy "admin_write_report_validations" on public."report_validations" as PERMISSIVE
    for INSERT to "authenticated" with check ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

create policy "delete_own_report" on public."reports" as PERMISSIVE
    for DELETE to public using ((auth.uid() = user_id));

create policy "insert_own_report" on public."reports" as PERMISSIVE
    for INSERT to public with check ((auth.uid() = user_id));

create policy "read_all_reports" on public."reports" as PERMISSIVE
    for SELECT to public using (true);

create policy "update_own_report" on public."reports" as PERMISSIVE
    for UPDATE to public using ((auth.uid() = user_id));

create policy "read_all_sentiment_analysis" on public."sentiment_analysis" as PERMISSIVE
    for SELECT to "authenticated" using (true);

create policy "read_system_settings" on public."system_settings" as PERMISSIVE
    for SELECT to "authenticated" using (true);

create policy "super_admin_write_system_settings" on public."system_settings" as PERMISSIVE
    for UPDATE to "authenticated" using ((current_user_role() = 'super_admin'::text)) with check ((current_user_role() = 'super_admin'::text));

create policy "read_all_credibility" on public."user_credibility" as PERMISSIVE
    for SELECT to "authenticated" using ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

create policy "read_own_credibility" on public."user_credibility" as PERMISSIVE
    for SELECT to "authenticated" using ((auth.uid() = user_id));

create policy "admin_select_all_terms" on public."user_terms_acceptance" as PERMISSIVE
    for SELECT to "authenticated" using ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

create policy "insert_own_terms" on public."user_terms_acceptance" as PERMISSIVE
    for INSERT to "authenticated" with check ((auth.uid() = user_id));

create policy "select_own_terms" on public."user_terms_acceptance" as PERMISSIVE
    for SELECT to "authenticated" using ((auth.uid() = user_id));
