#!/usr/bin/env python
"""TAG-56 — ``LLMSpec`` typed construction-spec integration smoke.

TAG-56 is pure-library (no HTTP surface) — the integration script is a
public-seam test run from a fresh Python interpreter. It proves that an
external caller (the registry/auth-resolver coming in TAG-57+) can:

  TC-01  import the new symbols from ``agent_search.agent_v2.llm``
  TC-02  construct a valid ``LLMSpec`` for every key-required provider
         without leaking the plaintext through ``repr`` / ``model_dump``
         / ``model_dump_json``
  TC-03  construct a keyless spec (``fake``, ``ollama``) with no key
  TC-04  reject an empty api_key for a key-required provider at
         construction time (before any HTTP client gets built)
  TC-05  reject unknown providers via the ``Literal`` (typo guard)
  TC-06  reject extra fields (``extra='forbid'``) — guards registry
         column typos
  TC-07  ``build_client`` returns the correct concrete client class for
         each ported provider
  TC-08  ``build_client`` raises ``ValueError`` for unported providers
         (``azure_openai``, ``bedrock``, ``ollama``) — fail-fast, not
         silent

No DB, no network, no env vars required. Runs in <1 s.

Usage:
    cd apps/agent_graph_backend
    python ../../scripts/TAG_56_integration.py
"""

from __future__ import annotations

import json
import os
import sys

# Allow running from repo root: scripts/TAG_56_integration.py
sys.path.insert(
    0,
    os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "apps", "agent_graph_backend")
    ),
)


_PLAINTEXT = "sk-tag56-do-not-log-1234567890"


class Runner:
    def __init__(self) -> None:
        self.rows: list[tuple[str, bool, str]] = []

    def _add(self, name: str, ok: bool, detail: str = "") -> None:
        self.rows.append((name, ok, detail))

    # ---- TC-01 imports ---------------------------------------------------

    def tc01_imports(self) -> None:
        try:
            from agent_search.agent_v2.llm import (  # noqa: F401
                LLMSpec,
                Provider,
                build_client,
            )

            self._add("TC-01 imports clean", True, "LLMSpec/Provider/build_client on public surface")
        except Exception as e:  # pragma: no cover - exercised by failing the test
            self._add("TC-01 imports clean", False, repr(e))

    # ---- TC-02 secret hygiene -------------------------------------------

    def tc02_secret_hygiene(self) -> None:
        from pydantic import SecretStr

        from agent_search.agent_v2.llm import LLMSpec

        try:
            specs = [
                LLMSpec(provider="anthropic", model="claude-x", api_key=SecretStr(_PLAINTEXT)),
                LLMSpec(provider="openai", model="gpt-x", api_key=SecretStr(_PLAINTEXT)),
                LLMSpec(provider="cerebras", model="llama-x", api_key=SecretStr(_PLAINTEXT)),
            ]
            for s in specs:
                if _PLAINTEXT in repr(s):
                    self._add("TC-02 secret hygiene", False, f"plaintext in repr for {s.provider}")
                    return
                if _PLAINTEXT in str(s.model_dump()):
                    self._add("TC-02 secret hygiene", False, f"plaintext in dump for {s.provider}")
                    return
                if _PLAINTEXT in s.model_dump_json():
                    self._add(
                        "TC-02 secret hygiene", False, f"plaintext in dump_json for {s.provider}"
                    )
                    return
                if json.loads(s.model_dump_json())["api_key"] != "**********":
                    self._add(
                        "TC-02 secret hygiene", False, f"api_key not masked for {s.provider}"
                    )
                    return
            self._add(
                "TC-02 secret hygiene",
                True,
                "repr / model_dump / model_dump_json all masked",
            )
        except Exception as e:
            self._add("TC-02 secret hygiene", False, repr(e))

    # ---- TC-03 keyless construction -------------------------------------

    def tc03_keyless(self) -> None:
        from agent_search.agent_v2.llm import LLMSpec

        try:
            fake = LLMSpec(provider="fake", model="echo")
            ollama = LLMSpec(provider="ollama", model="llama3")
            ok = fake.api_key.get_secret_value() == "" and ollama.api_key.get_secret_value() == ""
            self._add(
                "TC-03 keyless construction",
                ok,
                "fake + ollama construct with empty SecretStr",
            )
        except Exception as e:
            self._add("TC-03 keyless construction", False, repr(e))

    # ---- TC-04 empty key for key-required provider rejected -------------

    def tc04_empty_key_rejected(self) -> None:
        from pydantic import SecretStr, ValidationError

        from agent_search.agent_v2.llm import LLMSpec

        for p in ("anthropic", "openai", "cerebras", "azure_openai", "bedrock"):
            try:
                LLMSpec(provider=p, model="x", api_key=SecretStr(""))
            except ValidationError as ve:
                if f"{p} provider requires api_key" not in str(ve):
                    self._add("TC-04 empty key rejected", False, f"{p} validator msg wrong: {ve}")
                    return
            else:
                self._add("TC-04 empty key rejected", False, f"{p} accepted empty key")
                return
        self._add(
            "TC-04 empty key rejected",
            True,
            "anthropic/openai/cerebras/azure_openai/bedrock all rejected",
        )

    # ---- TC-05 unknown provider rejected --------------------------------

    def tc05_unknown_provider_rejected(self) -> None:
        from pydantic import SecretStr, ValidationError

        from agent_search.agent_v2.llm import LLMSpec

        try:
            LLMSpec(provider="anthrpic", model="x", api_key=SecretStr("k"))  # type: ignore[arg-type]
        except ValidationError:
            self._add("TC-05 unknown provider rejected", True, "Literal guard fires on typo")
            return
        self._add("TC-05 unknown provider rejected", False, "Literal accepted typo")

    # ---- TC-06 extra fields rejected ------------------------------------

    def tc06_extra_fields_rejected(self) -> None:
        from pydantic import SecretStr, ValidationError

        from agent_search.agent_v2.llm import LLMSpec

        try:
            LLMSpec(
                provider="anthropic",
                model="claude-x",
                api_key=SecretStr("k"),
                api_keyy="oops",  # type: ignore[call-arg]
            )
        except ValidationError:
            self._add("TC-06 extra fields rejected", True, "extra='forbid' catches misspell")
            return
        self._add("TC-06 extra fields rejected", False, "extra field silently dropped")

    # ---- TC-07 build_client returns correct class -----------------------

    def tc07_build_client_dispatch(self) -> None:
        from pydantic import SecretStr

        from agent_search.agent_v2.llm import LLMSpec, build_client
        from agent_search.agent_v2.llm.anthropic_client import AnthropicClient
        from agent_search.agent_v2.llm.cerebras_client import CerebrasClient
        from agent_search.agent_v2.llm.fake_client import FakeLLMClient
        from agent_search.agent_v2.llm.openai_client import OpenAIClient

        try:
            cases = [
                (
                    LLMSpec(provider="anthropic", model="claude-x", api_key=SecretStr("k")),
                    AnthropicClient,
                ),
                (
                    LLMSpec(provider="cerebras", model="llama-x", api_key=SecretStr("k")),
                    CerebrasClient,
                ),
                (
                    LLMSpec(
                        provider="openai",
                        model="gpt-x",
                        api_key=SecretStr("k"),
                        api_base="https://gw.example.com/v1",
                    ),
                    OpenAIClient,
                ),
                (
                    LLMSpec(
                        provider="openai_compatible",
                        model="local",
                        api_key=SecretStr("k"),
                        api_base="http://localhost:11434/v1",
                    ),
                    OpenAIClient,
                ),
                (LLMSpec(provider="fake", model="echo"), FakeLLMClient),
            ]
            for spec, expected_cls in cases:
                client = build_client(spec)
                if not isinstance(client, expected_cls):
                    self._add(
                        "TC-07 build_client dispatch",
                        False,
                        f"{spec.provider} -> {type(client).__name__}, want {expected_cls.__name__}",
                    )
                    return
            self._add(
                "TC-07 build_client dispatch",
                True,
                "anthropic/cerebras/openai/openai_compatible/fake all map correctly",
            )
        except Exception as e:
            self._add("TC-07 build_client dispatch", False, repr(e))

    # ---- TC-08 unported providers raise --------------------------------

    def tc08_unported_raise(self) -> None:
        from pydantic import SecretStr

        from agent_search.agent_v2.llm import LLMSpec, build_client

        for p in ("azure_openai", "bedrock", "ollama"):
            kwargs: dict[str, object] = {"provider": p, "model": "x"}
            if p != "ollama":
                kwargs["api_key"] = SecretStr("k")
            try:
                spec = LLMSpec(**kwargs)  # type: ignore[arg-type]
                build_client(spec)
            except ValueError:
                continue
            else:
                self._add(
                    "TC-08 unported providers raise",
                    False,
                    f"{p} did not raise ValueError",
                )
                return
        self._add(
            "TC-08 unported providers raise",
            True,
            "azure_openai/bedrock/ollama all raise ValueError",
        )

    # ---- run -------------------------------------------------------------

    def run(self) -> int:
        for name in sorted(m for m in dir(self) if m.startswith("tc")):
            getattr(self, name)()
        passed = sum(1 for _, ok, _ in self.rows if ok)
        failed = len(self.rows) - passed
        for name, ok, detail in self.rows:
            tag = "[PASS]" if ok else "[FAIL]"
            print(f"{tag} {name} | {detail}")
        print(f"\ntotal={len(self.rows)} passed={passed} failed={failed}")
        return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(Runner().run())
