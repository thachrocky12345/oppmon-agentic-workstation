# TAG-56: `LLMSpec` Pydantic Schema + Factory Adapter

## Description

**Suggested Points:** 2
**Type:** Story
**Epic:** [TAG-50](./TAG-50-authenticated-solve-endpoint-epic.md)
**Status:** Open

Introduce a typed `LLMSpec` schema as the wire contract between auth/registry
resolution and `create_llm_client_from_spec()`. Removes the "loose kwargs" pattern
introduced in TAG-49's factory rewrite and makes the resolution boundary explicit.

## Objective

```python
class LLMSpec(BaseModel):
    provider: Literal["anthropic","openai","openai_compatible","cerebras","azure_openai","bedrock","ollama","fake"]
    model: str                    # e.g. "claude-sonnet-4-20250514"
    api_key: SecretStr = SecretStr("")
    api_base: str | None = None
    extra_headers: dict[str, str] | None = None
    max_tokens: int = 4096
    timeout: float = 60.0

def build_client(spec: LLMSpec) -> LLMClient: ...
```

`build_client` delegates to `create_llm_client_from_spec(...)` and never re-exposes
`spec.api_key.get_secret_value()` to its caller — only the constructed `LLMClient`.

## Requirements

### Schema

`agent_v2/llm/spec.py`:

```python
from pydantic import BaseModel, SecretStr, model_validator
from typing import Literal

Provider = Literal[
    "anthropic", "openai", "openai_compatible", "cerebras",
    "azure_openai", "bedrock", "ollama", "fake",
]

class LLMSpec(BaseModel):
    provider: Provider
    model: str
    api_key: SecretStr = SecretStr("")
    api_base: str | None = None
    extra_headers: dict[str, str] | None = None
    max_tokens: int = 4096
    timeout: float = 60.0

    @model_validator(mode="after")
    def _check_key_required(self):
        needs_key = self.provider not in ("ollama", "fake")
        if needs_key and not self.api_key.get_secret_value():
            raise ValueError(f"{self.provider} requires api_key")
        return self
```

### Factory adapter

`agent_v2/llm/spec.py`:

```python
from .factory import create_llm_client_from_spec
from .base import LLMClient

def build_client(spec: LLMSpec) -> LLMClient:
    return create_llm_client_from_spec(
        provider=spec.provider,
        api_key=spec.api_key.get_secret_value(),
        model=spec.model,
        api_base=spec.api_base,
        max_tokens=spec.max_tokens,
        timeout=spec.timeout,
    )
```

### Repr safety

`LLMSpec`'s `__repr__` and `model_dump()` MUST mask `api_key`. `SecretStr` does
this by default; add a smoke test to lock the behavior.

## Implementation Notes

- TAG-49 already shipped `create_llm_client_from_spec`. This ticket is the schema +
  thin adapter on top. Do NOT duplicate provider-routing logic — call into the factory.
- `extra_headers` is accepted in the schema but NOT yet plumbed through `OpenAIClient`
  (per TAG-49 gap). Carry it through the spec but document that it is currently no-op;
  a follow-up ticket wires it through.
- Azure OpenAI and Bedrock are listed in the literal but neither has a working
  client yet (per TAG-49 gaps). `build_client` will currently `ValueError` on those —
  the factory raises a clear error.

## Tests

| File | Test | Assertion |
|---|---|---|
| `tests/llm/test_spec.py` | valid Anthropic spec | builds `AnthropicClient` |
| `tests/llm/test_spec.py` | valid Cerebras spec | builds `CerebrasClient` |
| `tests/llm/test_spec.py` | OpenAI w/ api_base override | client uses passed base |
| `tests/llm/test_spec.py` | empty `api_key` for OpenAI | validation error |
| `tests/llm/test_spec.py` | empty `api_key` for Ollama | OK (no key needed) |
| `tests/llm/test_spec.py` | `repr(spec)` does NOT contain plaintext key | masked |
| `tests/llm/test_spec.py` | `spec.model_dump()` masks key | `"**********"` style |

## Acceptance Criteria

- [ ] All factory call sites in TAG-57+ go through `build_client(spec)`.
- [ ] `repr` and `model_dump` mask `api_key`.
- [ ] All seven tests pass.
- [ ] No public function returns `LLMSpec` without `SecretStr` wrapping.

## Dependencies

**Depends on:** TAG-49 (factory already exists)
**Blocks:** TAG-57

## Risk Factors

| Risk | Mitigation |
|---|---|
| Plaintext key in `pydantic.ValidationError` message | `SecretStr` excludes value from validation errors by design; smoke-tested. |
| Spec passed to logging/tracing | `model_dump_json()` likewise masks. |
