create policy "admin_delete_announcements" on public."admin_announcement" as PERMISSIVE
    for DELETE to "authenticated" using ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

create policy "admin_update_announcements" on public."admin_announcement" as PERMISSIVE
    for UPDATE to "authenticated" using ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text]))) with check ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

create policy "admin_write_announcements" on public."admin_announcement" as PERMISSIVE
    for INSERT to "authenticated" with check ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

create policy "read_all_admin_announcements" on public."admin_announcement" as PERMISSIVE
    for SELECT to "authenticated" using (true);

create policy "read_app_settings" on public."app_settings" as PERMISSIVE
    for SELECT to "authenticated" using (true);

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
