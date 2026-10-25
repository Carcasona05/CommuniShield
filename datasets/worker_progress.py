"""Read-only progress report for the supporting-model training worker.

Shows the active job's stage, elapsed time, worker heartbeat freshness, the
local training-log tail, evaluation gates, the event timeline, and a summary
of recent runs. It only ever sends GET requests: it cannot claim, change, or
fail any job, and it never prints credentials.

Usage (from the repository root):
    .venv-data\\Scripts\\python.exe datasets\\worker_progress.py --env-file server/.env
    .venv-data\\Scripts\\python.exe datasets\\worker_progress.py --env-file server/.env --watch 5 --tail 20
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode

BASE = Path(__file__).resolve().parent
RUNS = BASE / "training-runs"
JOB_FIELDS = ("id,status,created_at,available_at,started_at,finished_at,lease_until,"
              "error,metrics,datasets:snapshot->datasets")
ACTIVE_STATUSES = ("queued", "training", "evaluating")
STAGE_LABEL = {"queued": "1/4 queued", "training": "2/4 training", "evaluating": "3/4 checking"}


class ProgressError(Exception):
    """Configuration or transport failure while reading progress."""


def read_env_file(path: Path) -> dict[str, str]:
    """Minimal .env parser: KEY=VALUE lines, # comments, optional quotes/export."""
    if not path.is_file():
        raise ProgressError(f"Environment file not found: {path}")
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, _, value = stripped.partition("=")
        key = key.strip()
        if key.startswith("export "):
            key = key[7:].strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        if key:
            values[key] = value
    return values


def load_environment(path: Path) -> None:
    for key, value in read_env_file(path).items():
        os.environ.setdefault(key, value)


class Reader:
    """GET-only Supabase REST reader (mirrors the worker's proven auth setup)."""

    def __init__(self, url: str, key: str) -> None:
        self.url = (url or "").rstrip("/")
        self.key = key
        if not self.url:
            raise ProgressError("SUPABASE_URL is not set (pass --env-file server/.env)")
        if not self.url.startswith("https://"):
            raise ProgressError("Progress requires an HTTPS Supabase URL")

    def get(self, path: str, label: str):
        request = urllib.request.Request(self.url + path, method="GET", headers={
            "apikey": self.key, "Authorization": f"Bearer {self.key}", "Accept": "application/json",
        })
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.loads(response.read(8388608))
        except urllib.error.HTTPError as error:
            # Never print response bodies or headers: they can contain private text.
            raise ProgressError(f"Could not read {label} (HTTP {error.code})") from None
        except (urllib.error.URLError, TimeoutError) as error:
            raise ProgressError(f"Supabase could not be reached while reading {label}. Check your connection.") from None
        except ValueError:
            raise ProgressError(f"Unexpected response while reading {label}.") from None


def parse_time(value) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def fmt_time(value) -> str:
    moment = parse_time(value)
    if moment is None:
        return "-"
    if moment.tzinfo is not None:
        moment = moment.astimezone()
    return moment.strftime("%Y-%m-%d %H:%M:%S")


def fmt_clock(value) -> str:
    moment = parse_time(value)
    if moment is None:
        return "-"
    if moment.tzinfo is not None:
        moment = moment.astimezone()
    return moment.strftime("%H:%M:%S")


def fmt_duration(seconds: float) -> str:
    seconds = max(0, int(seconds))
    if seconds < 60:
        return f"{seconds}s"
    if seconds < 3600:
        return f"{seconds // 60}m {seconds % 60:02d}s"
    return f"{seconds // 3600}h {(seconds % 3600) // 60:02d}m"


def fmt_age(value, now: datetime) -> str:
    moment = parse_time(value) if isinstance(value, str) else value
    if not isinstance(moment, datetime):
        return "-"
    return fmt_duration((now - moment).total_seconds())


def pick_active(jobs: list[dict]) -> dict | None:
    """A running job beats a waiting one; otherwise prefer the newest."""
    candidates = [job for job in jobs if isinstance(job, dict) and job.get("status") in ACTIVE_STATUSES]
    if not candidates:
        return None
    running = [job for job in candidates if job.get("status") in ("training", "evaluating")]
    pool = running or candidates
    return max(pool, key=lambda job: job.get("created_at") or "")


def csv_row_count(path: Path) -> int | None:
    """Accurate row count (excludes the header), safe for quoted multiline text."""
    if not path.is_file():
        return None
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.reader(handle)
        try:
            next(reader)
        except StopIteration:
            return 0
        return sum(1 for _ in reader)


def tail_lines(path: Path, count: int) -> tuple[list[str], int | None]:
    """Last `count` lines plus the file's age in seconds (None if missing)."""
    if not path.is_file() or count <= 0:
        return [], None
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    age = max(0.0, time.time() - path.stat().st_mtime)
    return lines[-count:], int(age)


def summarize_metrics(metrics) -> list[str]:
    if not isinstance(metrics, dict):
        return []
    lines: list[str] = []
    if isinstance(metrics.get('requested_languages'), list):
        lines.append('requested languages: ' + ', '.join(metrics['requested_languages']))
        lines.append('qualified languages: ' + (', '.join(metrics.get('qualified_languages', [])) or 'none'))
    if isinstance(metrics.get("training_mode"), str):
        lines.append(f"training evidence: {metrics['training_mode']}")
    data = metrics.get("data")
    if isinstance(data, dict) and "accepted" in data:
        lines.append(f"samples: {data.get('accepted')} accepted | {data.get('duplicates')} duplicates skipped"
                     f" | {data.get('held_out')} held out")
    languages = metrics.get("languages")
    if isinstance(languages, dict):
        for language in sorted(languages):
            result = languages[language]
            if not isinstance(result, dict):
                continue
            baseline = (result.get("baseline") or {}).get("macro_f1")
            candidate = (result.get("candidate") or {}).get("macro_f1")
            if metrics.get('admission') == 'independent-v1' and isinstance(candidate, (int, float)):
                lines.append(f'{language} candidate macro-F1 {candidate:.3f} (absolute target 0.600)')
            elif isinstance(baseline, (int, float)) and isinstance(candidate, (int, float)):
                lines.append(f"{language} macro-F1 {baseline:.3f} -> {candidate:.3f}")
    routing = metrics.get("routing_policy")
    if isinstance(routing, dict) and "passed" in routing:
        label = 'independent quality policy' if routing.get('version') == 2 else 'full-pool fallback policy'
        lines.append(f"{label}: {'verified' if routing.get('passed') else 'not verified'}")
    reasons = metrics.get("reasons")
    if isinstance(reasons, list):
        lines.extend(f"gate: {reason}" for reason in reasons if isinstance(reason, str))
    if isinstance(metrics.get("passed"), bool):
        lines.append(f"evaluation gates: {'passed' if metrics['passed'] else 'failed'}")
    return lines


def run_result_line(job: dict, limit: int = 110) -> str:
    status = str(job.get("status") or "unknown")
    identifier = str(job.get("id") or "")[:8]
    when = fmt_time(job.get("finished_at") or job.get("created_at"))
    mode = job.get("training_mode") or "continue"
    detail = ""
    metrics = job.get("metrics")
    error = job.get("error")
    if status == "ready":
        routing = metrics.get("routing_policy") if isinstance(metrics, dict) else None
        if isinstance(metrics, dict) and metrics.get('partial_pass') is True:
            detail = 'partial pass | qualified: ' + ', '.join(metrics.get('qualified_languages', [])) + ' | manual review'
        elif isinstance(metrics, dict) and metrics.get('admission') == 'independent-v1':
            detail = 'independent checks passed | registered disabled for manual review'
        elif isinstance(routing, dict) and routing.get("passed") is True:
            detail = "gates passed | fallback verified"
        elif isinstance(metrics, dict) and metrics.get("passed") is True:
            detail = "gates passed | registered disabled (no verified fallback region)"
        else:
            detail = "registered without evaluation details"
    elif status == "failed":
        detail = str(error or "failed before evaluation").replace("\n", " ")[:limit]
    elif status in ACTIVE_STATUSES:
        detail = STAGE_LABEL.get(status, status)
    return f"{status:<10} {identifier}  {when}  {mode:<8}  {detail}".rstrip()


def worker_line(pids: list[str] | None, checked: bool = True) -> str:
    if not checked:
        return "Worker process: check skipped (--skip-process-check)"
    if pids is None:
        return "Worker process: check unavailable on this system"
    if not pids:
        return "Worker process: NOT RUNNING (start it with the documented worker command)"
    return f"Worker process: running (pid {', '.join(pids)})"


def find_worker_pids() -> list[str] | None:
    try:
        if os.name == "nt":
            command = ("Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | "
                       "Where-Object { $_.CommandLine -like '*sentiment_training_worker*' } | "
                       "ForEach-Object { $_.ProcessId }")
            result = subprocess.run(["powershell", "-NoProfile", "-Command", command],
                                    capture_output=True, text=True, timeout=20)
        else:
            result = subprocess.run(["pgrep", "-f", "sentiment_training_worker"],
                                    capture_output=True, text=True, timeout=20)
        if result.returncode not in (0, 1):
            return None
        return [token for token in result.stdout.replace("\r", " ").split() if token.isdigit()]
    except Exception:
        return None


def render(report: dict) -> list[str]:
    """Pure formatting: tests build report dicts directly."""
    now: datetime = report["now"]
    lines = [f"CommuniShield worker progress - {now.strftime('%Y-%m-%d %H:%M:%S')} local"]
    lines.append(worker_line(report.get("worker_pids"), report.get("process_check", True)))

    capabilities = report.get("capabilities")
    if isinstance(capabilities, dict):
        pool_ok = capabilities.get("supporting_pool") is True
        fresh = capabilities.get("fresh_candidates") is True
        lines.append(f"Capabilities: supporting pool {'ok' if pool_ok else 'MISSING (apply sentiment_supporting_pool.sql)'}"
                     f" | fresh challengers {'ready' if fresh else 'not applied yet (sentiment_fresh_candidates.sql)'}")
        if capabilities.get('independent_admission'):
            lines.append('Admission: independent held-out quality | manual training and manual enabling')
    else:
        lines.append("Capabilities: unavailable")

    pool = report.get("pool")
    if isinstance(pool, dict):
        lines.append(f"Pool: {pool.get('enabled', 0)}/{pool.get('max_enabled', '?')} supporting slots enabled"
                     f" | {pool.get('total', 0)} registered supporting models")
    state = report.get("state")
    if isinstance(state, dict):
        lines.append(f"Model state: generation {state.get('generation', '-')} | data revision {state.get('data_revision', '-')}")
    lines.append("")

    active = report.get("active")
    if not isinstance(active, dict):
        lines.append("No queued or running jobs. The worker is idle.")
    else:
        status = active.get("status")
        lines.append(f"Active job [{STAGE_LABEL.get(status, status)}]: {active.get('id')}")
        mode = active.get("training_mode") or "continue"
        lines.append(f"  mode        {'fresh challenger (trained from scratch)' if mode == 'fresh' else 'continued training from the built-in state'}")
        started = parse_time(active.get("started_at") or active.get("created_at"))
        elapsed = fmt_duration((now - started).total_seconds()) if started else "-"
        lines.append(f"  started     {fmt_time(active.get('started_at') or active.get('created_at'))} | elapsed {elapsed}")
        if status in ("training", "evaluating"):
            lease = parse_time(active.get("lease_until"))
            if lease is None:
                lines.append("  heartbeat   no lease recorded")
            elif lease.astimezone(timezone.utc) >= now.astimezone(timezone.utc):
                lines.append(f"  heartbeat   worker alive - lease valid until {fmt_clock(lease.isoformat())}")
            else:
                lines.append(f"  heartbeat   INTERRUPTED - lease expired {fmt_age(lease.isoformat(), now)} ago;"
                             " restart the worker and re-queue this run")
        elif status == "queued":
            available = parse_time(active.get("available_at"))
            if available is None or available.astimezone(timezone.utc) <= now.astimezone(timezone.utc):
                lines.append("  start       ready to start as soon as the worker polls (5s cadence)")
            else:
                lines.append(f"  start       after {fmt_time(active.get('available_at'))} (batching window)")
        datasets = active.get("datasets")
        if isinstance(datasets, list):
            lines.append(f"  datasets    {len(datasets)} approved dataset version(s) in this snapshot")

        run_lines = render_run_directory(Path(report["runs_dir"]) / str(active.get("id")),
                                         int(report.get("tail", 12)), now, status)
        lines.extend(f"  {line}" if line else "" for line in run_lines)

        events = report.get("events")
        if isinstance(events, list) and events:
            timeline = " | ".join(f"{event.get('action')} {fmt_clock(event.get('created_at'))}"
                                  for event in events if isinstance(event, dict))
            lines.append(f"  timeline    {timeline}")
        lines.append("")

    recent = report.get("recent")
    if isinstance(recent, list) and recent:
        lines.append("Recent runs:")
        lines.extend(f"  {run_result_line(job)}" for job in recent if isinstance(job, dict))
    return lines


def render_run_directory(directory: Path, tail: int, now: datetime, status: str) -> list[str]:
    if not directory.is_dir():
        if status == "queued":
            return ["log         not created yet (the worker builds this directory when it claims the job)"]
        return ["log         local run directory not found (worker runs on another machine, or the directory was cleaned)"]
    lines: list[str] = []
    counts = [(split, csv_row_count(directory / "data" / f"{split}.csv"))
              for split in ("train", "validation", "test")]
    if any(count is not None for _, count in counts):
        lines.append("data split  " + " | ".join(
            f"{split} {count if count is not None else '-'} rows" for split, count in counts))
    log = directory / "training.log"
    tail_text, age = tail_lines(log, tail)
    if age is not None:
        lines.append(f"log         training.log | last output {fmt_duration(age)} ago")
        lines.extend(f"    | {line}" for line in tail_text)
    evaluation = directory / "evaluation.json"
    if evaluation.is_file():
        try:
            metrics = json.loads(evaluation.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            metrics = None
        for line in summarize_metrics(metrics):
            lines.append(f"evaluation  {line}")
    elif status in ("training", "evaluating"):
        lines.append("evaluation  not written yet (gates run after training completes)")
    return lines


def collect(reader: Reader, runs_dir: Path, tail: int, limit: int, check_process: bool) -> dict:
    capabilities = None
    try:
        capabilities = reader.get("/rest/v1/rpc/sentiment_training_capabilities", "capabilities")
    except ProgressError:
        pass
    fields = JOB_FIELDS
    if isinstance(capabilities, dict) and capabilities.get("fresh_candidates") is True:
        fields = fields + ",training_mode"
    active_rows = reader.get("/rest/v1/sentiment_training_jobs?" + urlencode({
        "status": f"in.({','.join(ACTIVE_STATUSES)})", "select": fields,
        "order": "created_at.desc", "limit": "2"}), "active job")
    recent = reader.get("/rest/v1/sentiment_training_jobs?" + urlencode({
        "select": fields, "order": "created_at.desc", "limit": str(limit)}), "recent jobs")
    active = pick_active(active_rows if isinstance(active_rows, list) else [])
    events = []
    if isinstance(active, dict) and active.get("id"):
        try:
            events = reader.get("/rest/v1/sentiment_training_events?" + urlencode({
                "job_id": f"eq.{active['id']}", "select": "action,created_at",
                "order": "created_at.asc", "limit": "20"}), "job timeline")
        except ProgressError:
            events = []
    state = pool = None
    try:
        rows = reader.get("/rest/v1/sentiment_model_state?" + urlencode({
            "id": "eq.1", "select": "generation,data_revision"}), "model state")
        state = rows[0] if isinstance(rows, list) and rows else None
    except ProgressError:
        state = None
    try:
        settings = reader.get("/rest/v1/sentiment_supporting_settings?" + urlencode({
            "id": "eq.1", "select": "max_enabled"}), "pool limit")
        models = reader.get("/rest/v1/sentiment_supporting_models?" + urlencode({
            "select": "status", "limit": "200"}), "supporting models")
        if isinstance(settings, list) and settings and isinstance(models, list):
            live = [model for model in models if model.get("status") != "deleted"]
            pool = {"max_enabled": settings[0].get("max_enabled", "?"),
                    "enabled": sum(1 for model in live if model.get("status") == "enabled"),
                    "total": len(live)}
    except ProgressError:
        pool = None
    return {"now": datetime.now().astimezone(), "worker_pids": find_worker_pids() if check_process else None,
            "process_check": check_process,
            "capabilities": capabilities, "state": state, "pool": pool, "active": active,
            "events": events, "recent": recent if isinstance(recent, list) else [],
            "runs_dir": str(runs_dir), "tail": tail}


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only progress report for the sentiment training worker.")
    parser.add_argument("--env-file", type=Path, default=BASE.parent / "server" / ".env",
                        help="Private .env file with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
    parser.add_argument("--watch", nargs="?", const=5.0, type=float, metavar="SECONDS",
                        help="Refresh continuously (default every 5 seconds); Ctrl+C to stop")
    parser.add_argument("--tail", type=int, default=12, help="Training-log lines to show (default 12)")
    parser.add_argument("--limit", type=int, default=6, help="Recent runs to list (default 6)")
    parser.add_argument("--runs-dir", type=Path, default=RUNS, help="Worker runs directory")
    parser.add_argument("--skip-process-check", action="store_true",
                        help="Do not probe for the local worker process")
    args = parser.parse_args()
    try:
        try:
            load_environment(args.env_file)
        except ProgressError:
            if not (os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_ROLE_KEY")):
                raise
        reader = Reader(os.environ.get("SUPABASE_URL", ""), os.environ.get("SUPABASE_SERVICE_ROLE_KEY", ""))
        while True:
            try:
                report = collect(reader, args.runs_dir.resolve(), max(0, args.tail), max(1, args.limit),
                                 not args.skip_process_check)
                output = render(report)
            except ProgressError as error:
                output = [f"Progress unavailable: {error}"]
            if args.watch is None:
                print("\n".join(output))
                return 0
            print("\033[2J\033[H" + "\n".join(output), flush=True)
            time.sleep(max(2.0, args.watch))
    except ProgressError as error:
        print(f"Worker progress unavailable: {error}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("", file=sys.stderr)
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
