import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from training_progress import TrainingProgress, TrainingLeaseLost, write_fit_progress


class ProgressTests(unittest.TestCase):
    def test_fit_file_contains_only_bounded_counts(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "fit.json"
            with patch.dict(os.environ, {"CS_TRAINING_PROGRESS_FILE": str(path)}):
                write_fit_progress(2, 10)
                self.assertEqual(json.loads(path.read_text()), {"completed": 2, "total": 10})
                with self.assertRaises(ValueError):
                    write_fit_progress(11, 10)

    def test_progress_uses_actual_units_and_throttles_substep_reports(self):
        cloud = Mock(progress_enabled=True)
        clock = [0]
        progress = TrainingProgress(cloud, {"id": "job", "lease_token": "lease"}, ["cebuano"], clock=lambda: clock[0])
        progress.emit(0, "preparing")
        progress.emit(1, "preparing")
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "fit.json"
            path.write_text(json.dumps({"completed": 1, "total": 2}))
            progress.fitting(path, 0, "cebuano")
            self.assertEqual(cloud.report_progress.call_count, 2)
            clock[0] = 6
            progress.fitting(path, 0, "cebuano")
            self.assertEqual(cloud.report_progress.call_args.args[2:5], (1.5, 5, "fitting"))
        with self.assertRaises(ValueError):
            progress.emit(1, "preparing")
        with self.assertRaises(ValueError):
            progress.emit(5, "registering")

    def test_missing_migration_and_telemetry_outage_do_not_change_training(self):
        cloud = Mock(progress_enabled=False)
        TrainingProgress(cloud, {}, ["cebuano"]).emit(0, "preparing")
        cloud.report_progress.assert_not_called()
        cloud.progress_enabled = True
        cloud.report_progress.side_effect = OSError("offline")
        with patch("builtins.print") as log:
            progress = TrainingProgress(cloud, {}, ["cebuano"])
            progress.emit(0, "preparing")
            progress.emit(1, "fitting")
        self.assertEqual(log.call_count, 1)

    def test_malformed_private_file_is_ignored(self):
        cloud = Mock(progress_enabled=True)
        progress = TrainingProgress(cloud, {}, ["cebuano"])
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "fit.json"
            for value in ['not json', '{"completed":"secret text","total":2}', '{"completed":3,"total":2}']:
                path.write_text(value)
                progress.fitting(path, 0, "cebuano")
        cloud.report_progress.assert_not_called()

    def test_failed_telemetry_is_backed_off_even_for_forced_updates(self):
        cloud = Mock(progress_enabled=True)
        cloud.report_progress.side_effect = OSError("offline")
        clock = [0]
        progress = TrainingProgress(cloud, {}, ["cebuano"], clock=lambda: clock[0])
        with patch("builtins.print"):
            for second in range(60):
                clock[0] = second
                progress.emit(0, "fitting", force=True)
        self.assertEqual(cloud.report_progress.call_count, 4)  # 0, 5, 15, 35
        self.assertEqual(progress.completed, 0)
        cloud.report_progress.side_effect = None
        clock[0] = 75
        progress.emit(1, "fitting")
        self.assertEqual(progress.completed, 1)
        self.assertEqual(progress.failures, 0)

    def test_stale_lease_is_terminal_and_never_sent_again(self):
        cloud = Mock(progress_enabled=True)
        error = RuntimeError("private server message")
        error.api_code = "40001"
        cloud.report_progress.side_effect = error
        progress = TrainingProgress(cloud, {}, ["cebuano"])
        for _ in range(3):
            with self.assertRaises(TrainingLeaseLost):
                progress.emit(0, "fitting")
        self.assertEqual(cloud.report_progress.call_count, 1)

    def test_fit_file_does_not_swallow_lease_rejection(self):
        cloud = Mock(progress_enabled=True)
        error = RuntimeError("stale lease")
        error.api_code = "40001"
        cloud.report_progress.side_effect = error
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "fit.json"
            path.write_text(json.dumps({"completed": 1, "total": 2}))
            with self.assertRaises(TrainingLeaseLost):
                TrainingProgress(cloud, {}, ["cebuano"]).fitting(path, 0, "cebuano")


if __name__ == "__main__":
    unittest.main()
