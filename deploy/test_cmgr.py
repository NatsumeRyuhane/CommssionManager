import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import main as manager
from deploy import _cmgr as c


class ProdWebPortTests(unittest.TestCase):
    def test_defaults_when_deploy_env_has_no_app_port(self) -> None:
        with self._env_file("ADMIN_USERNAME=admin\n"), patch.dict(os.environ, {}, clear=True):
            self.assertEqual(c.prod_web_port(), 8080)

    def test_reads_app_port_from_deploy_env(self) -> None:
        with self._env_file("APP_PORT=9090\n"), patch.dict(os.environ, {}, clear=True):
            self.assertEqual(c.prod_web_port(), 9090)

    def test_shell_app_port_overrides_deploy_env(self) -> None:
        with self._env_file("APP_PORT=9090\n"), patch.dict(
            os.environ, {"APP_PORT": "7070"}, clear=True
        ):
            self.assertEqual(c.prod_web_port(), 7070)

    def test_empty_shell_app_port_uses_default(self) -> None:
        with self._env_file("APP_PORT=9090\n"), patch.dict(
            os.environ, {"APP_PORT": ""}, clear=True
        ):
            self.assertEqual(c.prod_web_port(), 8080)

    def _env_file(self, contents: str):
        temp_dir = tempfile.TemporaryDirectory()
        env_file = Path(temp_dir.name) / ".env"
        env_file.write_text(contents)
        return _PatchedEnvFile(temp_dir, env_file)


class ProdComposeTests(unittest.TestCase):
    def test_uses_deploy_as_project_directory(self) -> None:
        self.assertEqual(
            c.prod_compose("config"),
            ["docker", "compose", "--project-directory", str(c.DEPLOY), "config"],
        )


class ProdUninstallTests(unittest.TestCase):
    def test_requires_explicit_confirmation(self) -> None:
        with patch.object(manager.c, "die", side_effect=SystemExit) as die:
            with self.assertRaises(SystemExit):
                manager.prod_uninstall(False)
        die.assert_called_once_with(
            "uninstall deletes the bundled database volume and built images; rerun with --yes"
        )

    def test_removes_local_stack_resources_and_retains_bind_data(self) -> None:
        with (
            patch.object(manager.c, "step"),
            patch.object(manager.c, "warn"),
            patch.object(manager.c, "info") as info,
            patch.object(manager.c, "run") as run,
        ):
            manager.prod_uninstall(True)

        run.assert_called_once_with(
            manager.c.compose(
                manager.c.COMPOSE_FULL,
                "down",
                "--remove-orphans",
                "--volumes",
                "--rmi",
                "local",
            ),
            cwd=manager.c.ROOT,
        )
        info.assert_called_once_with(
            "deploy/.env, backend/.env, uploaded files, and external databases retained"
        )


class StorageToolTests(unittest.TestCase):
    def test_rejects_unknown_action(self) -> None:
        with patch.object(manager.c, "die", side_effect=SystemExit) as die:
            with self.assertRaises(SystemExit):
                manager.storage_tool("dev", "frobnicate", False)
        die.assert_called_once_with(
            "usage: python3 main.py storage <status|migrate> [--dry-run]"
        )

    def test_dev_mode_runs_cli_via_uv(self) -> None:
        env = {"PATH": "/stub"}
        with (
            patch.object(manager, "_require"),
            patch.object(manager.c, "step"),
            patch.object(manager.c, "uv_environ", return_value=env),
            patch.object(manager.c, "run") as run,
        ):
            manager.storage_tool("dev", "status", False)
        run.assert_called_once_with(
            ["uv", "run", "python", "-m", "app.storage.migrate", "status"],
            cwd=manager.c.BACKEND,
            env=env,
        )

    def test_prod_mode_execs_inside_api_container(self) -> None:
        with (
            patch.object(manager, "_require"),
            patch.object(manager.c, "step"),
            patch.object(manager.c, "run") as run,
        ):
            manager.storage_tool("prod", "migrate", True)
        run.assert_called_once_with(
            manager.c.prod_compose(
                "exec", "api", "python", "-m", "app.storage.migrate", "migrate", "--dry-run"
            ),
            cwd=manager.c.ROOT,
        )


class _PatchedEnvFile:
    def __init__(self, temp_dir: tempfile.TemporaryDirectory, env_file: Path) -> None:
        self.temp_dir = temp_dir
        self.patch = patch.object(c, "PROD_ENV_FILE", env_file)

    def __enter__(self):
        self.patch.start()
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.patch.stop()
        self.temp_dir.cleanup()
