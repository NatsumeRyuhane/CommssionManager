"""Shared helpers for the deploy/ tooling (setup.py, main.py).

Vanilla stdlib only — no third-party deps and no project virtualenv required. These scripts
just orchestrate the existing tools (uv, pnpm, docker compose), so the host only needs Python 3.
"""

from __future__ import annotations

import os
import shutil
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path
from typing import NoReturn

# ---------------------------------------------------------------------------- paths
DEPLOY = Path(__file__).resolve().parent
ROOT = DEPLOY.parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
RUN_DIR = DEPLOY / ".run"  # pidfiles + captured logs for host (dev) processes

ENV_FILE = BACKEND / ".env"
ENV_EXAMPLE = BACKEND / ".env.example"

COMPOSE_DEV = DEPLOY / "docker-compose.dev.yml"
COMPOSE_FULL = DEPLOY / "docker-compose.yml"
NGINX_CONF = DEPLOY / "nginx.conf"

# Local dev service endpoints.
API_PORT = 8000
WEB_PORT = 5173
PROD_WEB_PORT = 8080  # host port published by the full-stack web container

# ---------------------------------------------------------------------------- output
_TTY = sys.stdout.isatty()

# Line-buffer our own output so it stays correctly ordered relative to subprocess output
# even when piped (e.g. `python3 main.py status | tail`).
try:
    sys.stdout.reconfigure(line_buffering=True)
except (AttributeError, ValueError):
    pass


def color(code: str, text: str) -> str:
    return f"\033[{code}m{text}\033[0m" if _TTY else text


def step(msg: str) -> None:
    print(color("1;36", f"▶ {msg}"))


def ok(msg: str) -> None:
    print(color("32", f"  ✓ {msg}"))


def info(msg: str) -> None:
    print(f"  {msg}")


def warn(msg: str) -> None:
    print(color("33", f"  ! {msg}"))


def err(msg: str) -> None:
    print(color("31", f"  ✗ {msg}"))


def die(msg: str, code: int = 1) -> NoReturn:
    err(msg)
    sys.exit(code)


# ---------------------------------------------------------------------------- env file
def read_env_file(path: Path) -> dict[str, str]:
    """Parse a simple KEY=VALUE .env file (ignores comments / blank lines, strips quotes)."""
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        val = val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
            val = val[1:-1]
        values[key.strip()] = val
    return values


def load_env(announce: bool = True) -> dict[str, str]:
    """Load backend/.env and (optionally) announce where config came from."""
    values = read_env_file(ENV_FILE)
    if announce:
        if ENV_FILE.exists():
            ok(f"Loaded config from {ENV_FILE.relative_to(ROOT)}")
        else:
            warn(f"No {ENV_FILE.relative_to(ROOT)} found — run: python3 deploy/setup.py")
    return values


def env_mode(values: dict[str, str], default: str = "dev") -> str:
    mode = values.get("CMGR_ENV", "").strip().lower()
    return mode or default


# ---------------------------------------------------------------------------- tools
def have(tool: str) -> bool:
    return shutil.which(tool) is not None


def uv_environ() -> dict[str, str]:
    """Environment for `uv` calls: drop VIRTUAL_ENV so uv targets the project's .venv."""
    env = dict(os.environ)
    env.pop("VIRTUAL_ENV", None)
    return env


def run(cmd: list[str], cwd: Path | None = None, env: dict[str, str] | None = None,
        check: bool = True) -> int:
    """Run a command in the foreground, streaming its output."""
    info(color("2", f"$ {' '.join(cmd)}" + (f"   (in {cwd.relative_to(ROOT)})" if cwd else "")))
    result = subprocess.run(cmd, cwd=cwd, env=env)
    if check and result.returncode != 0:
        die(f"command failed ({result.returncode}): {' '.join(cmd)}", result.returncode)
    return result.returncode


# ---------------------------------------------------------------------------- ports
def port_open(port: int, host: str = "localhost") -> bool:
    # Try every address family `host` resolves to — vite binds IPv6 (::1) while uvicorn
    # binds IPv4 (127.0.0.1), so checking only one family gives false negatives.
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return False
    for family, socktype, proto, _canon, sockaddr in infos:
        with socket.socket(family, socktype, proto) as s:
            s.settimeout(0.4)
            if s.connect_ex(sockaddr) == 0:
                return True
    return False


def wait_port(port: int, timeout: float = 40.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if port_open(port):
            return True
        time.sleep(0.5)
    return False


# ---------------------------------------------------------------------------- background procs
def _pid_file(name: str) -> Path:
    return RUN_DIR / f"{name}.pid"


def log_file(name: str) -> Path:
    return RUN_DIR / f"{name}.log"


def read_pid(name: str) -> int | None:
    p = _pid_file(name)
    if not p.exists():
        return None
    try:
        return int(p.read_text().strip())
    except ValueError:
        return None


def pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def is_running(name: str) -> bool:
    pid = read_pid(name)
    return pid is not None and pid_alive(pid)


def start_bg(name: str, cmd: list[str], cwd: Path, env: dict[str, str] | None = None) -> int:
    """Launch a detached background process, capturing output to deploy/.run/<name>.log.

    Uses its own session/process-group so stop_bg can take down the whole tree (uvicorn's
    reloader child, vite's workers, etc.)."""
    RUN_DIR.mkdir(exist_ok=True)
    logf = log_file(name).open("ab")
    proc = subprocess.Popen(
        cmd, cwd=cwd, env=env,
        stdout=logf, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
        start_new_session=True,
    )
    _pid_file(name).write_text(str(proc.pid))
    return proc.pid


def stop_bg(name: str, timeout: float = 8.0) -> bool:
    """Terminate a background process group started by start_bg. Returns True if it was running."""
    pid = read_pid(name)
    if pid is None:
        return False
    running = pid_alive(pid)
    if running:
        try:
            pgid = os.getpgid(pid)
            os.killpg(pgid, signal.SIGTERM)
            deadline = time.time() + timeout
            while time.time() < deadline and pid_alive(pid):
                time.sleep(0.2)
            if pid_alive(pid):
                os.killpg(pgid, signal.SIGKILL)
        except ProcessLookupError:
            running = False
    _pid_file(name).unlink(missing_ok=True)
    return running


# ---------------------------------------------------------------------------- docker compose
def compose(file: Path, *args: str) -> list[str]:
    return ["docker", "compose", "-f", str(file), *args]
