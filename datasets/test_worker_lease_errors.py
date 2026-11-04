import io
import hashlib
import json
import os
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import Mock, patch

import sentiment_training_worker as worker


class WorkerLeaseErrorTests(unittest.TestCase):
    def test_claim_payload_supplies_all_database_protocol_guards_and_real_hashes(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            for name in worker.FILES:
                (directory / name).write_bytes(name.encode())
            payload = worker.build_claim_payload(directory)
            self.assertEqual(payload["pool_protocol"], 1)
            self.assertEqual(payload["worker_protocol"], "supporting-pool-v2")
            self.assertEqual(payload["admission_protocol"], "independent-v1")
            self.assertEqual(payload["language_scope_protocol"], 1)
            self.assertEqual(payload["builtin_hashes"], {name: hashlib.sha256(name.encode()).hexdigest() for name in worker.FILES})
            (directory / worker.FILES[0]).unlink()
            with self.assertRaisesRegex(ValueError, "Built-in model missing"):
                worker.build_claim_payload(directory)

    def test_bad_claim_stops_without_repeated_rpc_or_failure_write(self):
        cloud = Mock()
        cloud.rpc.side_effect = worker.CloudRequestError(400, "22023")
        capabilities = {"supporting_pool": True, "independent_admission": True, "language_scoped_training": True}
        payload = {"language_scope_protocol": 1}
        with patch.dict(os.environ, {"SENTIMENT_MODEL_REGISTRY_ENABLED": "true"}), \
             patch.object(worker.sys, "argv", ["worker"]), \
             patch.object(worker, "Cloud", return_value=cloud), \
             patch.object(worker, "install_stop_handlers"), \
             patch.object(worker, "wait_for_capabilities", return_value=capabilities), \
             patch.object(worker, "build_claim_payload", return_value=payload), \
             patch.object(worker.time, "sleep") as sleep, patch("builtins.print"):
            with self.assertRaisesRegex(ValueError, "Job claim was rejected"):
                worker.main()
        cloud.rpc.assert_called_once_with("claim", payload=payload)
        sleep.assert_not_called()

    def test_temporary_claim_outage_backs_off_and_resets_after_success(self):
        cloud = Mock()
        cloud.rpc.side_effect = [worker.CloudRequestError(503), worker.CloudRequestError(503), None, KeyboardInterrupt()]
        capabilities = {"supporting_pool": True, "independent_admission": True, "language_scoped_training": True}
        with patch.dict(os.environ, {"SENTIMENT_MODEL_REGISTRY_ENABLED": "true"}), \
             patch.object(worker.sys, "argv", ["worker"]), \
             patch.object(worker, "Cloud", return_value=cloud), \
             patch.object(worker, "install_stop_handlers"), \
             patch.object(worker, "wait_for_capabilities", return_value=capabilities), \
             patch.object(worker, "build_claim_payload", return_value={}), \
             patch.object(worker.time, "sleep") as sleep, patch("builtins.print"):
            worker.main()
        self.assertEqual([call.args[0] for call in sleep.call_args_list], [5, 10, 5])

    def test_400_error_exposes_safe_sqlstate_without_response_text(self):
        cloud = worker.Cloud.__new__(worker.Cloud)
        cloud.url, cloud.key = "https://example.test", "private-key"
        error = urllib.error.HTTPError("https://example.test", 400, "Bad Request", {},
            io.BytesIO(json.dumps({"code": "22023", "message": "private training sample"}).encode()))
        with patch.object(worker.urllib.request, "urlopen", side_effect=error):
            with self.assertRaises(worker.CloudRequestError) as caught:
                cloud.rpc("claim")
        self.assertEqual(caught.exception.api_code, "22023")
        self.assertIn("HTTP 400/22023", str(caught.exception))
        self.assertNotIn("private", str(caught.exception))

    def test_request_retains_only_safe_error_code_and_does_not_retry_writes(self):
        cloud = worker.Cloud.__new__(worker.Cloud)
        cloud.url, cloud.key = "https://example.test", "private-key"
        error = urllib.error.HTTPError("https://example.test", 409, "Conflict", {},
            io.BytesIO(json.dumps({"code": "40001", "message": "private sample"}).encode()))
        with patch.object(worker.urllib.request, "urlopen", side_effect=error) as request:
            with self.assertRaises(worker.CloudRequestError) as caught:
                cloud.rpc("heartbeat", {"id": "job", "lease_token": "lease"})
        self.assertEqual(caught.exception.api_code, "40001")
        self.assertNotIn("private", str(caught.exception))
        self.assertEqual(request.call_count, 1)

    def test_heartbeat_marks_first_stale_lease_rejection_terminal(self):
        cloud = Mock()
        cloud.rpc.side_effect = worker.CloudRequestError(409, "40001")
        lease = worker.Lease(cloud, {"id": "job", "lease_token": "lease"})
        lease.stop = Mock()
        lease.stop.wait.side_effect = [False, True]
        lease.heartbeat()
        self.assertTrue(lease.lost.is_set())
        self.assertEqual(cloud.rpc.call_count, 1)
        with self.assertRaises(worker.TrainingLeaseLost):
            lease.check()

    def test_main_does_not_attempt_failure_write_after_lease_rejection(self):
        for error in [worker.TrainingLeaseLost("lease lost"), worker.CloudRequestError(409, "40001")]:
            cloud = Mock()
            cloud.rpc.return_value = {"id": "job", "lease_token": "lease"}
            capabilities = {"supporting_pool": True, "independent_admission": True, "language_scoped_training": True}
            with patch.dict(os.environ, {"SENTIMENT_MODEL_REGISTRY_ENABLED": "true"}), \
                 patch.object(worker.sys, "argv", ["worker", "--once"]), \
                 patch.object(worker, "Cloud", return_value=cloud), \
                 patch.object(worker, "install_stop_handlers"), \
                 patch.object(worker, "wait_for_capabilities", return_value=capabilities), \
                 patch.object(worker, "build_claim_payload", return_value={}), \
                 patch.object(worker, "process_job", side_effect=error), patch("builtins.print"):
                worker.main()
            self.assertEqual([call.args[0] for call in cloud.rpc.call_args_list], ["claim"])


if __name__ == "__main__":
    unittest.main()
