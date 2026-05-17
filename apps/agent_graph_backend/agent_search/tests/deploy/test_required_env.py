# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""TAG-65 — fail-fast env check tests.

These tests exercise `check_required_env()` (in `agent_v2/app.py`) and the
deploy-time parity script `scripts/check-jwt-parity.sh`.

The fail-fast contract: when `ENABLE_SOLVE_V3=true`, any empty value among
`JWT_SECRET`, `TAG_ENCRYPTION_MASTER_KEY`, `DATABASE_URL`, or the
`OPENAI_EMBED_API_KEY`/`OPENAI_API_KEY` fallback chain must raise SystemExit
*before* the FastAPI app starts taking traffic. The container then
CrashLoopBackOffs in prod, which is the desired operator signal.

The parity script tests cover only the exit-code contract — the cases
where both, one, or neither service has `JWT_SECRET`, and where the two
values match or drift. Real `docker service inspect` calls are stubbed
via the `API_INSPECT_CMD` / `GRAPH_INSPECT_CMD` env overrides.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

from agent_search.agent_v2.app import (
    SOLVE_V3_REQUIRED_ENV,
    check_required_env,
)
from agent_search.agent_v2.config import Settings


# ---------------------------------------------------------------------------
# check_required_env — Python-level unit tests
# ---------------------------------------------------------------------------


def _settings(**overrides: object) -> Settings:
    """Build a Settings instance from kwargs, bypassing env reads.

    Uses Pydantic's model_construct path so we can pin every field without
    depending on what env vars happen to be set in the test environment.
    """
    defaults: dict[str, object] = {
        "enable_solve_v3": True,
        "jwt_secret": "test-jwt",
        "tag_encryption_master_key": "test-master",
        "database_url": "postgresql://test",
        "openai_embed_api_key": "test-embed",
        "openai_api_key": "test-openai",
    }
    defaults.update(overrides)
    return Settings(**defaults)  # type: ignore[arg-type]


def test_required_env_constant_shape():
    """The exported tuple must include the four documented vars."""
    assert SOLVE_V3_REQUIRED_ENV == (
        "JWT_SECRET",
        "TAG_ENCRYPTION_MASTER_KEY",
        "DATABASE_URL",
        "OPENAI_EMBED_API_KEY",
    )


def test_flag_off_skips_all_checks():
    """ENABLE_SOLVE_V3=false is the rollback knob — must be a no-op."""
    # All required vars empty, but flag off → must not raise.
    s = _settings(
        enable_solve_v3=False,
        jwt_secret="",
        tag_encryption_master_key="",
        database_url="",
        openai_embed_api_key="",
        openai_api_key="",
    )
    check_required_env(s)  # no exception


def test_all_set_boots_cleanly():
    """Happy path: every required var populated."""
    check_required_env(_settings())


def test_missing_jwt_secret_exits():
    with pytest.raises(SystemExit) as excinfo:
        check_required_env(_settings(jwt_secret=""))
    assert "JWT_SECRET" in str(excinfo.value)


def test_missing_master_key_exits():
    with pytest.raises(SystemExit) as excinfo:
        check_required_env(_settings(tag_encryption_master_key=""))
    assert "TAG_ENCRYPTION_MASTER_KEY" in str(excinfo.value)


def test_missing_database_url_exits():
    with pytest.raises(SystemExit) as excinfo:
        check_required_env(_settings(database_url=""))
    assert "DATABASE_URL" in str(excinfo.value)


def test_missing_both_embed_keys_exits():
    """Embed fallback chain: only fail when BOTH are empty."""
    with pytest.raises(SystemExit) as excinfo:
        check_required_env(_settings(openai_embed_api_key="", openai_api_key=""))
    assert "OPENAI_EMBED_API_KEY" in str(excinfo.value)


def test_embed_fallback_via_openai_api_key_ok():
    """OPENAI_API_KEY alone is enough — mirrors rag/embedding.py fallback."""
    check_required_env(
        _settings(openai_embed_api_key="", openai_api_key="dedicated-fallback")
    )


def test_missing_multiple_lists_all():
    """When several vars are empty, the error must list every one."""
    with pytest.raises(SystemExit) as excinfo:
        check_required_env(
            _settings(jwt_secret="", database_url="", openai_embed_api_key="", openai_api_key="")
        )
    msg = str(excinfo.value)
    assert "JWT_SECRET" in msg
    assert "DATABASE_URL" in msg
    assert "OPENAI_EMBED_API_KEY" in msg
    # runbook pointer for the operator
    assert "swarm-debug" in msg


def test_uses_module_default_when_no_arg(monkeypatch):
    """No-arg call must read the module-level Settings singleton."""
    # Force the module singleton to a failing config and confirm the no-arg
    # path picks it up.
    from agent_search.agent_v2 import app as app_mod

    bad = _settings(jwt_secret="")
    monkeypatch.setattr(app_mod, "default_settings", bad)
    with pytest.raises(SystemExit):
        check_required_env()


# ---------------------------------------------------------------------------
# scripts/check-jwt-parity.sh — exit-code contract
# ---------------------------------------------------------------------------

# Locate the repo root by walking up until we find docker-stack.yml.
def _repo_root() -> Path:
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "docker-stack.yml").exists():
            return parent
    raise RuntimeError("docker-stack.yml not found upward from test file")


PARITY_SCRIPT = _repo_root() / "scripts" / "check-jwt-parity.sh"


def _run_bash(env: dict[str, str]) -> subprocess.CompletedProcess:
    """Pipe the parity script into `bash` via stdin.

    Two Windows-specific quirks handled here:

    1. WSL bash filters env vars unless they're listed in `WSLENV`. Without
       this, our `API_INSPECT_CMD` / `GRAPH_INSPECT_CMD` stubs would be
       invisible to the script and it would fall through to the real
       `docker service inspect` defaults (and exit 2).
    2. `bash C:/...` doesn't work inside the WSL filesystem view, so we
       feed the script via stdin instead of as an argv path. This also
       works identically on Linux / macOS / native bash.
    """
    env = dict(env)  # don't mutate caller's copy
    # Append our test vars to any existing WSLENV value so we don't clobber
    # vars the host might already be forwarding.
    existing = env.get("WSLENV", "")
    forwarded = "API_INSPECT_CMD:GRAPH_INSPECT_CMD"
    env["WSLENV"] = f"{existing}:{forwarded}" if existing else forwarded
    with open(PARITY_SCRIPT, "rb") as f:
        return subprocess.run(
            ["bash"],
            stdin=f,
            capture_output=True,
            text=True,
            env=env,
            check=False,
        )


bash_available = shutil.which("bash") is not None
requires_bash = pytest.mark.skipif(
    not bash_available,
    reason="bash not available on this host (Windows without Git Bash / WSL)",
)


def _run_parity(api_env: str, graph_env: str) -> subprocess.CompletedProcess:
    """Invoke the parity script with stubbed `docker service inspect` output.

    Windows env vars can't carry embedded newlines, so we encode the stub
    output as a single-line `printf '%b' ...` invocation with `\\n` escapes
    that `printf` interprets at script time.
    """
    env = os.environ.copy()
    env["API_INSPECT_CMD"] = _printf_b(api_env)
    env["GRAPH_INSPECT_CMD"] = _printf_b(graph_env)
    return _run_bash(env)


def _printf_b(s: str) -> str:
    """Encode `s` (possibly multi-line) as a one-line `printf '%b' '...'` command.

    Real newlines become the two-char sequence `\\n` so the value can survive
    being passed through a Windows env var; `printf '%b'` re-interprets them
    inside bash.
    """
    escaped = s.replace("\\", "\\\\").replace("\n", "\\n").replace("'", "'\\''")
    return f"printf '%b' '{escaped}'"


@requires_bash
def test_parity_script_exists_and_executable():
    assert PARITY_SCRIPT.exists(), f"missing {PARITY_SCRIPT}"


@requires_bash
def test_parity_match_exits_zero():
    api_env = "JWT_SECRET=abcdef123456\nOTHER=ignored\n"
    graph_env = "FOO=bar\nJWT_SECRET=abcdef123456\n"
    proc = _run_parity(api_env, graph_env)
    assert proc.returncode == 0, proc.stderr
    assert "parity confirmed" in proc.stdout
    # The script MUST NOT echo the secret itself — only its length.
    assert "abcdef123456" not in proc.stdout
    assert "abcdef123456" not in proc.stderr


@requires_bash
def test_parity_mismatch_exits_one():
    api_env = "JWT_SECRET=keyA\n"
    graph_env = "JWT_SECRET=keyB\n"
    proc = _run_parity(api_env, graph_env)
    assert proc.returncode == 1
    assert "MISMATCH" in proc.stderr
    # Lengths may appear, but never the values.
    assert "keyA" not in proc.stdout and "keyA" not in proc.stderr
    assert "keyB" not in proc.stdout and "keyB" not in proc.stderr


@requires_bash
def test_parity_api_empty_exits_one():
    api_env = "OTHER=x\n"  # no JWT_SECRET line at all
    graph_env = "JWT_SECRET=anything\n"
    proc = _run_parity(api_env, graph_env)
    assert proc.returncode == 1
    assert "no JWT_SECRET" in proc.stderr


@requires_bash
def test_parity_graph_empty_exits_one():
    api_env = "JWT_SECRET=anything\n"
    graph_env = "OTHER=x\n"
    proc = _run_parity(api_env, graph_env)
    assert proc.returncode == 1
    assert "no JWT_SECRET" in proc.stderr
    assert "source apps/api/.env" in proc.stderr or "apps/api/.env" in proc.stderr


@requires_bash
def test_parity_inspect_failure_exits_two():
    """A non-zero `docker service inspect` returns exit 2 (operator should retry)."""
    env = os.environ.copy()
    env["API_INSPECT_CMD"] = "false"  # always exits 1
    env["GRAPH_INSPECT_CMD"] = "printf '%s' 'JWT_SECRET=anything\\n'"
    proc = _run_bash(env)
    assert proc.returncode == 2
    assert "failed to inspect" in proc.stderr
