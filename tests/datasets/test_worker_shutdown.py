import os
import unittest
from unittest.mock import Mock, patch
import sentiment_training_worker as worker


class WorkerShutdownTests(unittest.TestCase):
    def test_stop_is_lease_fenced_structured_and_idempotent(self):
        cloud, job = Mock(), {"id": "job", "lease_token": "lease"}
        self.assertTrue(worker.record_worker_shutdown(cloud, job))
        self.assertTrue(worker.record_worker_shutdown(cloud, job))
        cloud.rpc.assert_called_once()
        action, actual_job, payload = cloud.rpc.call_args.args
        self.assertEqual(action, "fail")
        self.assertIs(actual_job, job)
        self.assertEqual(payload["metrics"], {"failure_stage": "worker_shutdown", "interrupted": True})
        self.assertNotIn("activate", action)

    def test_offline_or_terminal_job_does_not_claim_stop_was_recorded(self):
        cloud, job = Mock(), {"id": "job", "lease_token": "lease"}
        cloud.rpc.side_effect = RuntimeError("offline, stale lease or already registered")
        self.assertFalse(worker.record_worker_shutdown(cloud, job))
        self.assertNotIn("_shutdown_reported", job)
        self.assertFalse(worker.record_worker_shutdown(cloud, None))

    def test_interrupt_reports_before_waiting_for_heartbeat_thread(self):
        order = []
        cloud = Mock()
        cloud.rpc.side_effect = lambda *_: order.append("record stop")
        lease = worker.Lease(cloud, {"id": "job", "lease_token": "lease"})
        lease.thread = Mock()
        lease.thread.join.side_effect = lambda **_: order.append("join heartbeat")
        lease.__exit__(KeyboardInterrupt, KeyboardInterrupt(), None)
        self.assertEqual(order, ["record stop", "join heartbeat"])
        self.assertTrue(lease.stop.is_set())
        self.assertTrue(lease.lost.is_set())
        lease.thread.join.assert_called_once_with(timeout=2)

    def test_normal_completion_does_not_get_overwritten_as_interrupted(self):
        cloud = Mock()
        lease = worker.Lease(cloud, {"id": "job", "lease_token": "lease"})
        lease.thread = Mock()
        lease.__exit__(None, None, None)
        cloud.rpc.assert_not_called()

    def test_service_stop_and_ctrl_break_raise_the_normal_interrupt_cleanup_path(self):
        with patch.object(worker.signal, "signal") as register:
            worker.install_stop_handlers()
        self.assertTrue(any(call.args[0] == worker.signal.SIGTERM for call in register.call_args_list))
        self.assertTrue(all(call.args[1] is worker.worker_stop_signal for call in register.call_args_list))
        with self.assertRaises(KeyboardInterrupt):
            worker.worker_stop_signal(worker.signal.SIGTERM, None)

    def test_main_covers_interrupt_between_claim_and_lease_start(self):
        cloud, job = Mock(), {"id": "job", "lease_token": "lease"}
        cloud.rpc.side_effect = [job, {}]
        capabilities = {"supporting_pool": True, "independent_admission": True, "language_scoped_training": True}
        with patch.dict(os.environ, {"SENTIMENT_MODEL_REGISTRY_ENABLED": "true"}), \
             patch.object(worker.sys, "argv", ["worker", "--once"]), \
             patch.object(worker, "Cloud", return_value=cloud), \
             patch.object(worker, "install_stop_handlers"), \
             patch.object(worker, "wait_for_capabilities", return_value=capabilities), \
             patch.object(worker, "sha256", return_value="a" * 64), \
             patch.object(worker, "process_job", side_effect=KeyboardInterrupt), \
             patch("builtins.print"):
            worker.main()
        self.assertEqual([call.args[0] for call in cloud.rpc.call_args_list], ["claim", "fail"])
        self.assertTrue(job["_shutdown_reported"])


if __name__ == "__main__":
    unittest.main()
