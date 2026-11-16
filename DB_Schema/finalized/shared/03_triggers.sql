CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE TRIGGER admin_analysis_completion_audit AFTER UPDATE OF state ON public.admin_analysis_jobs FOR EACH ROW EXECUTE FUNCTION audit_admin_analysis_completion();

CREATE TRIGGER set_admin_announcement_updated_at BEFORE UPDATE ON public.admin_announcement FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_app_settings_updated_at BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_notifications_updated_at BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER on_profile_created_credibility AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION handle_new_credibility();

CREATE TRIGGER set_profiles_fullname BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_fullname();

CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER cleanup_comment_sentiment AFTER DELETE ON public.report_comments FOR EACH ROW EXECUTE FUNCTION cleanup_sentiment_analysis();

CREATE TRIGGER cleanup_comment_sentiment_on_text_change AFTER UPDATE OF content ON public.report_comments FOR EACH ROW WHEN ((old.content IS DISTINCT FROM new.content)) EXECUTE FUNCTION cleanup_sentiment_analysis();

CREATE TRIGGER credibility_comment_limit BEFORE INSERT ON public.report_comments FOR EACH ROW EXECUTE FUNCTION enforce_credibility_write();

CREATE TRIGGER enqueue_comment_sentiment AFTER INSERT ON public.report_comments FOR EACH ROW EXECUTE FUNCTION enqueue_comment_sentiment();

CREATE TRIGGER cleanup_report_sentiment AFTER DELETE ON public.reports FOR EACH ROW EXECUTE FUNCTION cleanup_sentiment_analysis();

CREATE TRIGGER cleanup_report_sentiment_on_text_change AFTER UPDATE OF details ON public.reports FOR EACH ROW WHEN ((old.details IS DISTINCT FROM new.details)) EXECUTE FUNCTION cleanup_sentiment_analysis();

CREATE TRIGGER credibility_protect_review_fields BEFORE INSERT OR UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION protect_report_review_fields();

CREATE TRIGGER credibility_report_limit BEFORE INSERT ON public.reports FOR EACH ROW EXECUTE FUNCTION enforce_credibility_write();

CREATE TRIGGER credibility_review_score AFTER UPDATE OF status, is_verified ON public.reports FOR EACH ROW EXECUTE FUNCTION score_reviewed_report();

CREATE TRIGGER set_reports_updated_at BEFORE UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_sentiment_analysis_updated_at BEFORE UPDATE ON public.sentiment_analysis FOR EACH ROW EXECUTE FUNCTION set_sentiment_analysis_updated_at();

CREATE TRIGGER sentiment_dataset_approval_training AFTER UPDATE OF status ON public.sentiment_datasets FOR EACH ROW WHEN (((old.status IS DISTINCT FROM new.status) AND ((new.status = 'approved'::text) OR (old.status = 'approved'::text)))) EXECUTE FUNCTION queue_approved_sentiment_training();

CREATE TRIGGER set_system_settings_updated_at BEFORE UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER credibility_start_suspension AFTER INSERT OR UPDATE OF score ON public.user_credibility FOR EACH ROW WHEN ((new.score < (20)::numeric)) EXECUTE FUNCTION start_credibility_suspension();

CREATE TRIGGER set_credibility_level_trigger BEFORE INSERT OR UPDATE ON public.user_credibility FOR EACH ROW EXECUTE FUNCTION set_credibility_level();

CREATE TRIGGER set_user_credibility_updated_at BEFORE UPDATE ON public.user_credibility FOR EACH ROW EXECUTE FUNCTION set_updated_at();
