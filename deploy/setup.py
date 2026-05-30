#!/usr/bin/env python3
"""One-time project setup for Commission Manager.

Checks host tooling, installs backend + frontend dependencies, scaffolds backend/.env, and
(for prod) sanity-checks the deploy assets. Stdlib only — just needs Python 3 on the host.

    python3 deploy/setup.py [--env dev|test|prod]
"""

from __future__ import annotations

import argparse
import sys

import _cmgr as c


def check_tools(mode: str) -> None:
    c.step("Checking host tools")
    py = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
    c.ok(f"python {py}")

    # uv + pnpm/node are only needed for host (dev/test) runs; prod runs everything in Docker.
    host_tools = {
        "uv": "https://docs.astral.sh/uv/  (backend Python toolchain)",
        "pnpm": "https://pnpm.io/  (or run: corepack enable)",
        "node": "Node 22+  (frontend build/runtime)",
    }
    docker_hint = "Docker Desktop/Engine  (Postgres, test DB, prod stack)"

    missing_required = False
    for tool, hint in host_tools.items():
        if c.have(tool):
            c.ok(tool)
        elif mode == "prod":
            c.warn(f"{tool} not found — not required for prod (Docker-only), skipping")
        else:
            c.err(f"{tool} not found — needed for {mode}: {hint}")
            missing_required = True

    if c.have("docker"):
        c.ok("docker")
    else:
        c.err(f"docker not found: {docker_hint}")
        missing_required = True

    if missing_required:
        c.die("install the missing tools above, then re-run setup")


def ensure_env(requested: str | None) -> str:
    c.step("Backend configuration (.env)")
    if not c.ENV_FILE.exists():
        if not c.ENV_EXAMPLE.exists():
            c.die(f"missing {c.ENV_EXAMPLE.relative_to(c.ROOT)}")
        c.ENV_FILE.write_text(c.ENV_EXAMPLE.read_text())
        c.ok(f"created {c.ENV_FILE.relative_to(c.ROOT)} from .env.example")
    else:
        c.ok(f"{c.ENV_FILE.relative_to(c.ROOT)} already present")

    values = c.read_env_file(c.ENV_FILE)
    current = values.get("CMGR_ENV", "").strip().lower()
    target = (requested or current or "dev").lower()
    if target not in {"dev", "test", "prod"}:
        c.die(f"invalid env '{target}' (expected dev|test|prod)")

    if current != target:
        _set_env_var(target)
        c.ok(f"set CMGR_ENV={target}")
    else:
        c.ok(f"CMGR_ENV={target}")

    if requested is None and current == "":
        c.info("(defaulted to dev — re-run with --env to change)")
    return target


def _set_env_var(value: str) -> None:
    """Add or replace CMGR_ENV in backend/.env, preserving the rest of the file."""
    lines = c.ENV_FILE.read_text().splitlines()
    out, replaced = [], False
    for line in lines:
        if line.strip().startswith("CMGR_ENV="):
            out.append(f"CMGR_ENV={value}")
            replaced = True
        else:
            out.append(line)
    if not replaced:
        out.append(f"CMGR_ENV={value}")
    c.ENV_FILE.write_text("\n".join(out) + "\n")


def install_backend(mode: str) -> None:
    c.step("Backend dependencies (uv sync)")
    if mode == "prod":
        c.info("prod runs the backend in Docker — skipping host uv sync")
        return
    c.run(["uv", "sync"], cwd=c.BACKEND, env=c.uv_environ())
    c.ok("backend deps installed")


def install_frontend(mode: str) -> None:
    c.step("Frontend dependencies (pnpm install)")
    if mode == "prod":
        c.info("prod builds the frontend in Docker — skipping host pnpm install")
        return
    if c.have("corepack"):
        c.run(["corepack", "enable"], check=False)
    c.run(["pnpm", "install"], cwd=c.FRONTEND)
    c.ok("frontend deps installed")


def check_prod_assets(mode: str) -> None:
    if mode != "prod":
        return
    c.step("Prod deploy assets")
    for path in (c.COMPOSE_FULL, c.NGINX_CONF):
        if path.exists():
            c.ok(path.relative_to(c.ROOT).as_posix())
        else:
            c.die(f"missing {path.relative_to(c.ROOT)}")
    c.warn("prod uses fallback secrets unless overridden — set strong values in deploy/.env "
           "(POSTGRES_PASSWORD, ADMIN_PASSWORD, SECRET_KEY, CORS_ORIGINS). See README.")


def main() -> None:
    ap = argparse.ArgumentParser(description="Set up Commission Manager for local use.")
    ap.add_argument("--env", choices=["dev", "test", "prod"],
                    help="deployment mode to write into backend/.env (CMGR_ENV)")
    args = ap.parse_args()

    print(c.color("1", "Commission Manager — setup"))
    mode = ensure_env(args.env)
    check_tools(mode)
    install_backend(mode)
    install_frontend(mode)
    check_prod_assets(mode)

    c.step("Done")
    c.ok(f"environment: {mode}")
    c.info("next:  python3 main.py start")


if __name__ == "__main__":
    main()
