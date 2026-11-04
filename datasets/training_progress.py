"""Bounded, text-free trainer telemetry. Never used for model selection."""
from __future__ import annotations

import json
import math
import os
import time
from pathlib import Path


def write_fit_progress(completed: int, total: int) -> None:
    path = os.environ.get("CS_TRAINING_PROGRESS_FILE")
    if not path:
        return
    if type(completed) is not int or type(total) is not int or not 0 <= completed <= total or total < 1:
        raise ValueError("Invalid fitting progress")
    try:
        target = Path(path)
        temporary = target.with_suffix(".tmp")
        temporary.write_text(json.dumps({"completed": completed, "total": total}), encoding="utf-8")
        temporary.replace(target)
    except OSError:
        pass  # Optional telemetry must not affect fitting or quality decisions.


class TrainingLeaseLost(RuntimeError):
    """Terminal fencing rejection, not an optional telemetry outage."""


class TrainingProgress:
    def __init__(self, cloud, job, languages, clock=time.monotonic):
        self.cloud, self.job, self.languages, self.clock = cloud, job, list(languages), clock
        self.total = 3 + 2 * len(self.languages)  # prepare, fit/check each language, upload, register
        self.sequence, self.completed, self.last_sent = 0, 0.0, float("-inf")
        self.warned = False
        self.failures, self.next_attempt = 0, float("-inf")
        self.lease_lost = False

    def emit(self, completed, stage, language=None, force=True):
        if self.lease_lost:
            raise TrainingLeaseLost("Training lease was already rejected; this job must stop.")
        if getattr(self.cloud, "progress_enabled", False) is not True:
            return
        if not math.isfinite(completed) or not self.completed <= completed < self.total:
            raise ValueError("Invalid or backwards training progress")
        now = self.clock()
        if now < self.next_attempt or (not force and now - self.last_sent < 5):
            return
        self.sequence += 1
        # Failed attempts must be throttled too; the trainer polls this every second.
        self.last_sent = now
        try:
            self.cloud.report_progress(self.job, self.sequence, completed, self.total, stage, language)
            self.completed = completed
            self.failures, self.next_attempt = 0, float("-inf")
        except Exception as error:
            if getattr(error, "api_code", None) == "40001":
                self.lease_lost = True
                raise TrainingLeaseLost("Training lease rejected; stopping this job without publishing a candidate.") from None
            self.failures += 1
            self.next_attempt = self.clock() + min(60, 5 * 2 ** min(self.failures - 1, 4))
            if not self.warned:
                print("Training progress reporting unavailable; training and lease checks continue.", flush=True)
                self.warned = True

    def fitting(self, path, index, language):
        try:
            if path.stat().st_size > 1024:
                return
            value = json.loads(path.read_text(encoding="utf-8"))
            done, total = value["completed"], value["total"]
            if type(done) is not int or type(total) is not int or not 0 <= done <= total or not 1 <= total <= 1000:
                return
            self.emit(1 + index + done / total, "fitting", language, force=False)
        except (OSError, ValueError, KeyError, TypeError):
            return
