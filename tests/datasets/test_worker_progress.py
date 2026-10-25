import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

import worker_progress as progress


def aware(moment: datetime) -> datetime:
    return moment.replace(tzinfo=timezone.utc).astimezone()


NOW = aware(datetime(2026, 10, 25, 1, 30, 0))


def iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).isoformat()


class WorkerProgressTests(unittest.TestCase):
    def test_env_parser_handles_comments_quotes_and_export_prefix(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / ".env"
            path.write_text("\n".join([
                "# comment",
                "",
                "SUPABASE_URL=https://example.supabase.co",
                " export SUPABASE_SERVICE_ROLE_KEY='private-value'",
                'PLAIN=value=with=equals',
                "EMPTY=",
            ]), encoding="utf-8")
            result = progress.read_env_file(path)
            self.assertEqual(result["SUPABASE_URL"], "https://example.supabase.co")
            self.assertEqual(result["SUPABASE_SERVICE_ROLE_KEY"], "private-value")
            self.assertEqual(result["PLAIN"], "value=with=equals")
            self.assertEqual(result["EMPTY"], "")
        with self.assertRaises(progress.ProgressError):
            progress.read_env_file(Path("definitely-missing.env"))

    def test_active_job_prefers_running_over_waiting_and_newest_wins(self):
        queued_old = {"id": "a", "status": "queued", "created_at": "2026-10-25T01:00:00+00:00"}
        queued_new = {"id": "b", "status": "queued", "created_at": "2026-10-25T01:10:00+00:00"}
        running_old = {"id": "c", "status": "training", "created_at": "2026-10-25T01:05:00+00:00"}
        running_new = {"id": "d", "status": "evaluating", "created_at": "2026-10-25T01:07:00+00:00"}
        ready = {"id": "e", "status": "ready", "created_at": "2026-10-25T01:20:00+00:00"}
        self.assertEqual(progress.pick_active([queued_old, ready])["id"], "a")
        self.assertEqual(progress.pick_active([queued_old, queued_new])["id"], "b")
        self.assertEqual(progress.pick_active([queued_new, running_old])["id"], "c")
        self.assertEqual(progress.pick_active([running_old, running_new])["id"], "d")
        self.assertIsNone(progress.pick_active([ready]))
        self.assertIsNone(progress.pick_active([]))

    def test_time_and_duration_formatting_degrades_safely(self):
        self.assertEqual(progress.fmt_duration(45), "45s")
        self.assertEqual(progress.fmt_duration(222), "3m 42s")
        self.assertEqual(progress.fmt_duration(7500), "2h 05m")
        self.assertEqual(progress.fmt_time(None), "-")
        self.assertEqual(progress.fmt_time("not-a-time"), "-")
        self.assertEqual(progress.fmt_age(None, NOW), "-")
        self.assertEqual(progress.fmt_age(iso(NOW - timedelta(minutes=5)), NOW), "5m 00s")

    def test_metrics_summary_extracts_gates_data_and_fallback_policy(self):
        metrics = {
            "training_mode": "fresh", "passed": True,
            "data": {"accepted": 417, "duplicates": 3, "held_out": 12},
            "languages": {"cebuano": {"baseline": {"macro_f1": 0.72}, "candidate": {"macro_f1": 0.75}}},
            "routing_policy": {"passed": False},
            "reasons": ["No validation-verified fallback region"],
        }
        lines = progress.summarize_metrics(metrics)
        self.assertIn("training evidence: fresh", lines)
        self.assertIn("samples: 417 accepted | 3 duplicates skipped | 12 held out", lines)
        self.assertIn("cebuano macro-F1 0.720 -> 0.750", lines)
        self.assertIn("full-pool fallback policy: not verified", lines)
        self.assertIn("gate: No validation-verified fallback region", lines)
        self.assertIn("evaluation gates: passed", lines)
        self.assertEqual(progress.summarize_metrics(None), [])
        self.assertEqual(progress.summarize_metrics({"languages": []}), [])

    def test_csv_row_count_ignores_header_and_quoted_newlines(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "train.csv"
            path.write_text('text,language,label\n"line one\nline two",cebuano,positive\nplain,english,neutral\n',
                            encoding="utf-8")
            self.assertEqual(progress.csv_row_count(path), 2)
            self.assertIsNone(progress.csv_row_count(Path(temporary) / "missing.csv"))

    def test_tail_lines_returns_last_lines_and_age(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "training.log"
            path.write_text("\n".join(f"line {index}" for index in range(10)), encoding="utf-8")
            lines, age = progress.tail_lines(path, 3)
            self.assertEqual(lines, ["line 7", "line 8", "line 9"])
            self.assertIsNotNone(age)
            self.assertGreaterEqual(age, 0)
            self.assertEqual(progress.tail_lines(path, 0), ([], None))
            self.assertEqual(progress.tail_lines(Path(temporary) / "nope.log", 3), ([], None))

    def test_run_result_line_distinguishes_verified_disabled_and_failed(self):
        verified = progress.run_result_line({"status": "ready", "id": "12345678-0000",
                                             "finished_at": "2026-10-24T14:47:38+00:00",
                                             "training_mode": "fresh",
                                             "metrics": {"passed": True, "routing_policy": {"passed": True}}})
        self.assertIn("ready", verified)
        self.assertIn("12345678", verified)
        self.assertIn("fresh", verified)
        self.assertIn("gates passed | fallback verified", verified)
        disabled = progress.run_result_line({"status": "ready", "id": "abcdef12-0000",
                                             "created_at": "2026-10-24T14:47:38+00:00",
                                             "metrics": {"passed": True, "routing_policy": {"passed": False}}})
        self.assertIn("registered disabled", disabled)
        failed = progress.run_result_line({"status": "failed", "id": "ffffffff-0000",
                                           "finished_at": "2026-10-23T16:35:04+00:00",
                                           "error": "Evaluation gate failed: recall"})
        self.assertIn("Evaluation gate failed: recall", failed)

    def test_worker_line_reports_running_missing_and_unavailable(self):
        self.assertIn("running (pid 12, 34)", progress.worker_line(["12", "34"]))
        self.assertIn("NOT RUNNING", progress.worker_line([]))
        self.assertIn("check unavailable", progress.worker_line(None))
        self.assertIn("check skipped", progress.worker_line(None, checked=False))

    def test_independent_runs_are_reported_as_manual_review_not_auto_enabled(self):
        text = progress.run_result_line({'status': 'ready', 'id': 'new-model', 'metrics': {'admission':'independent-v1', 'passed':True}})
        self.assertIn('registered disabled for manual review', text)
        lines = progress.summarize_metrics({'admission':'independent-v1', 'languages':{'english':{'candidate':{'macro_f1':.7}}}, 'routing_policy':{'version':2,'passed':True}})
        self.assertIn('english candidate macro-F1 0.700 (absolute target 0.600)', lines)
        self.assertIn('independent quality policy: verified', lines)

    def test_scoped_partial_result_names_only_qualified_languages(self):
        metrics={'admission':'independent-v1','passed':True,'partial_pass':True,
                 'requested_languages':['cebuano','filipino'],'qualified_languages':['cebuano']}
        text=progress.run_result_line({'status':'ready','metrics':metrics})
        self.assertIn('partial pass | qualified: cebuano',text)
        self.assertIn('requested languages: cebuano, filipino',progress.summarize_metrics(metrics))
        self.assertIn('qualified languages: cebuano',progress.summarize_metrics(metrics))

    def report(self, **overrides):
        report = {"now": NOW, "worker_pids": ["1234"], "capabilities": {"supporting_pool": True, "fresh_candidates": True},
                  "state": {"generation": 5, "data_revision": 7}, "pool": {"enabled": 1, "max_enabled": 3, "total": 2},
                  "active": None, "events": [], "recent": [], "runs_dir": ".", "tail": 4}
        report.update(overrides)
        return report

    def test_render_idle_report_summarizes_pool_and_recent_runs(self):
        lines = progress.render(self.report(recent=[
            {"status": "ready", "id": "7d55c59a-0000", "created_at": "2026-10-24T15:52:31+00:00",
             "metrics": {"passed": True, "routing_policy": {"passed": False}}},
        ]))
        text = "\n".join(lines)
        self.assertIn("supporting pool ok", text)
        self.assertIn("fresh challengers ready", text)
        self.assertIn("Pool: 1/3 supporting slots enabled", text)
        self.assertIn("Model state: generation 5 | data revision 7", text)
        self.assertIn("No queued or running jobs", text)
        self.assertIn("Recent runs:", text)
        self.assertIn("7d55c59a", text)

    def test_render_active_training_job_shows_mode_heartbeat_and_timeline(self):
        active = {"id": "aaaaaaaa-0000-4000-8000-000000000000", "status": "training", "training_mode": "fresh",
                  "created_at": iso(NOW - timedelta(minutes=8)), "started_at": iso(NOW - timedelta(minutes=7)),
                  "lease_until": iso(NOW + timedelta(minutes=4)), "datasets": [{"id": 1}, {"id": 2}]}
        text = "\n".join(progress.render(self.report(
            active=active,
            events=[{"action": "queued", "created_at": iso(NOW - timedelta(minutes=8))},
                    {"action": "training", "created_at": iso(NOW - timedelta(minutes=7))}])) )
        self.assertIn("Active job [2/4 training]", text)
        self.assertIn("fresh challenger (trained from scratch)", text)
        self.assertIn("worker alive - lease valid until", text)
        self.assertIn("2 approved dataset version(s)", text)
        self.assertIn("local run directory not found", text)
        self.assertIn("timeline    queued", text)

    def test_render_flags_an_interrupted_lease_and_a_waiting_queue_entry(self):
        interrupted = {"id": "bbbbbbbb-0000", "status": "evaluating", "training_mode": "continue",
                       "created_at": iso(NOW - timedelta(minutes=30)), "started_at": iso(NOW - timedelta(minutes=29)),
                       "lease_until": iso(NOW - timedelta(minutes=5))}
        text = "\n".join(progress.render(self.report(active=interrupted)))
        self.assertIn("INTERRUPTED", text)
        self.assertIn("restart the worker", text)
        waiting = {"id": "cccccccc-0000", "status": "queued", "created_at": iso(NOW - timedelta(seconds=10)),
                   "available_at": iso(NOW + timedelta(seconds=20))}
        text = "\n".join(progress.render(self.report(active=waiting)))
        self.assertIn("1/4 queued", text)
        self.assertIn("batching window", text)
        ready = dict(waiting, available_at=iso(NOW - timedelta(seconds=5)))
        self.assertIn("ready to start", "\n".join(progress.render(self.report(active=ready))))

    def test_render_reads_the_local_run_directory(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            job_id = "dddddddd-0000-4000-8000-000000000000"
            run = root / job_id
            (run / "data").mkdir(parents=True)
            (run / "data" / "train.csv").write_text("text,language,label\na,cebuano,positive\nb,english,neutral\n",
                                                    encoding="utf-8")
            (run / "training.log").write_text("training mode: fresh\ncebuano: 27000 train\n", encoding="utf-8")
            (run / "evaluation.json").write_text(
                '{"passed": false, "reasons": ["No validation-verified fallback region"]}', encoding="utf-8")
            active = {"id": job_id, "status": "evaluating", "created_at": iso(NOW - timedelta(minutes=10)),
                      "started_at": iso(NOW - timedelta(minutes=9)), "lease_until": iso(NOW + timedelta(minutes=4))}
            text = "\n".join(progress.render(self.report(active=active, runs_dir=str(root), tail=5)))
            self.assertIn("data split  train 2 rows", text)
            self.assertIn("training.log | last output", text)
            self.assertIn("| training mode: fresh", text)
            self.assertIn("gate: No validation-verified fallback region", text)

    def test_run_directory_messages_for_missing_directory(self):
        with tempfile.TemporaryDirectory() as temporary:
            missing = Path(temporary) / "gone"
            queued = progress.render_run_directory(missing, 5, NOW, "queued")
            self.assertIn("not created yet", queued[0])
            training = progress.render_run_directory(missing, 5, NOW, "training")
            self.assertIn("local run directory not found", training[0])


if __name__ == "__main__":
    unittest.main()
