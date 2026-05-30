#!/usr/bin/env python3
"""Run and control Commission Manager.

The deployment mode comes from CMGR_ENV in backend/.env (written by deploy/setup.py):

    dev   host servers with hot reload  — Postgres (Docker) + uvicorn --reload + vite
    test  run the backend test suite    — pytest (ephemeral Postgres via testcontainers)
    prod  full Docker stack             — docker compose (db + api + web/nginx)

    python3 main.py <start|stop|restart|status|logs|test> [service]

Stdlib only; orchestrates uv, pnpm, and docker compose. Dev servers run as background
processes tracked by pidfiles/logs under deploy/.run/.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

# Shared helpers live in deploy/ (next to setup.py and the compose files).
sys.path.insert(0, str(Path(__file__).resolve().parent / "deploy"))
import _cmgr as c  # noqa: E402

DEV_SERVICES = ("api", "web")


# ------------------------------------------------------------------------------- dev
def _require(tool: str) -> None:
    if not c.have(tool):
        c.die(f"{tool} not found on PATH — run: python3 deploy/setup.py")


def dev_start() -> None:
    _require("docker")
    _require("uv")
    _require("pnpm")

    c.step("Postgres (dev)")
    c.run(c.compose(c.COMPOSE_DEV, "up", "-d"))
    if c.wait_port(55432, timeout=30):
        c.ok("postgres ready on :55432")
    else:
        c.die("postgres did not become reachable on :55432")

    c.step("Migrations")
    c.run(["uv", "run", "alembic", "upgrade", "head"], cwd=c.BACKEND, env=c.uv_environ())
    c.ok("schema up to date")

    c.step("App servers")
    if c.is_running("api"):
        c.ok(f"api already running (pid {c.read_pid('api')})")
    else:
        pid = c.start_bg("api", ["uv", "run", "uvicorn", "app.main:app", "--reload",
                                 "--port", str(c.API_PORT)], cwd=c.BACKEND, env=c.uv_environ())
        c.ok(f"api started (pid {pid}) -> {c.log_file('api').relative_to(c.ROOT)}")
    if c.is_running("web"):
        c.ok(f"web already running (pid {c.read_pid('web')})")
    else:
        pid = c.start_bg("web", ["pnpm", "dev"], cwd=c.FRONTEND)
        c.ok(f"web started (pid {pid}) -> {c.log_file('web').relative_to(c.ROOT)}")

    c.step("Waiting for servers")
    api_up = c.wait_port(c.API_PORT)
    web_up = c.wait_port(c.WEB_PORT)
    _report_dev_urls(api_up, web_up)


def _report_dev_urls(api_up: bool, web_up: bool) -> None:
    if api_up and web_up:
        print()
        c.ok(c.color("1", f"App:  http://localhost:{c.WEB_PORT}"))
        c.ok(f"API:  http://localhost:{c.API_PORT}/docs")
        c.info("logs:  python3 main.py logs   |   stop: python3 main.py stop")
    else:
        if not api_up:
            c.err(f"api did not open :{c.API_PORT} — see {c.log_file('api').relative_to(c.ROOT)}")
        if not web_up:
            c.err(f"web did not open :{c.WEB_PORT} — see {c.log_file('web').relative_to(c.ROOT)}")
        sys.exit(1)


def dev_stop() -> None:
    c.step("Stopping app servers")
    for name in DEV_SERVICES:
        c.ok(f"{name} stopped") if c.stop_bg(name) else c.info(f"{name} not running")
    c.info("dev Postgres left running — stop with: "
           f"docker compose -f {c.COMPOSE_DEV.relative_to(c.ROOT)} down")


def dev_status() -> None:
    c.step("Dev status")
    for name, port in (("api", c.API_PORT), ("web", c.WEB_PORT)):
        pid = c.read_pid(name)
        if pid and c.pid_alive(pid):
            mark = "listening" if c.port_open(port) else "starting/not listening"
            c.ok(f"{name}: running (pid {pid}, :{port} {mark})")
        else:
            c.warn(f"{name}: not running")
    c.info("postgres:")
    c.run(c.compose(c.COMPOSE_DEV, "ps"), check=False)


def dev_logs(service: str | None) -> None:
    names = [service] if service in DEV_SERVICES else list(DEV_SERVICES)
    files = [c.log_file(n) for n in names if c.log_file(n).exists()]
    if not files:
        c.die("no dev logs yet — start the app first")
    c.info(f"tailing: {', '.join(f.name for f in files)} (Ctrl-C to stop)")
    try:
        subprocess.run(["tail", "-n", "40", "-f", *[str(f) for f in files]])
    except KeyboardInterrupt:
        pass


# ------------------------------------------------------------------------------- prod
def prod_start() -> None:
    _require("docker")
    c.step("Full stack (build + up)")
    c.run(c.compose(c.COMPOSE_FULL, "up", "-d", "--build"))
    print()
    c.ok(c.color("1", f"App:  http://localhost:{c.PROD_WEB_PORT}"))
    c.info("status: python3 main.py status   |   logs: python3 main.py logs")


def prod_stop() -> None:
    c.step("Stopping full stack")
    c.run(c.compose(c.COMPOSE_FULL, "down"))


def prod_status() -> None:
    c.step("Prod status")
    c.run(c.compose(c.COMPOSE_FULL, "ps"), check=False)


def prod_logs(service: str | None) -> None:
    args = ["logs", "-f"] + ([service] if service else [])
    try:
        c.run(c.compose(c.COMPOSE_FULL, *args), check=False)
    except KeyboardInterrupt:
        pass


# ------------------------------------------------------------------------------- test
def run_tests() -> None:
    _require("uv")
    _require("docker")  # testcontainers needs Docker for the ephemeral Postgres
    c.step("Backend test suite")
    code = c.run(["uv", "run", "pytest", "-q"], cwd=c.BACKEND, env=c.uv_environ(), check=False)
    sys.exit(code)


# ------------------------------------------------------------------------------- dispatch
def main() -> None:
    ap = argparse.ArgumentParser(description="Run/control Commission Manager.")
    ap.add_argument("command", choices=["start", "stop", "restart", "status", "logs", "test"])
    ap.add_argument("service", nargs="?", help="for logs: api|web (dev) or a compose service")
    args = ap.parse_args()

    values = c.load_env(announce=True)
    mode = c.env_mode(values)
    c.info(f"environment: {c.color('1', mode)}")
    if mode not in {"dev", "test", "prod"}:
        c.die(f"unknown CMGR_ENV '{mode}' (expected dev|test|prod)")

    # TEST mode means "run the suite" regardless of the start/stop verb users reach for.
    if mode == "test":
        if args.command in ("start", "test", "restart"):
            run_tests()
        c.die("in test mode only `start`/`test` are meaningful (they run the suite)")

    if args.command == "test":
        run_tests()

    handlers = {
        "dev": {"start": dev_start, "stop": dev_stop, "status": dev_status},
        "prod": {"start": prod_start, "stop": prod_stop, "status": prod_status},
    }
    logs = {"dev": dev_logs, "prod": prod_logs}

    if args.command == "logs":
        logs[mode](args.service)
    elif args.command == "restart":
        handlers[mode]["stop"]()
        handlers[mode]["start"]()
    else:
        handlers[mode][args.command]()


if __name__ == "__main__":
    main()
