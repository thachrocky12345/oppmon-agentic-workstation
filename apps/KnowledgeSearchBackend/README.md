# KnowledgeSearchBackend (v2-only)

Trimmed fork of [InternLM/MindSearch](https://github.com/InternLM/MindSearch)
that serves only `POST /solve_v2`. The legacy `/solve` route and its
`mindsearch.agent` package have been deleted — see
[`docs/solve-v2.md`](../../docs/solve-v2.md) for the wire contract.

Used by Arkon's chat page when **Graph mode** is enabled. The browser hits
the same-origin Next.js proxy at `/api/graph/solve`, which forwards to this
service. Source for the proxy is in
[`apps/web/src/app/api/graph/solve/route.ts`](../web/src/app/api/graph/solve/route.ts).

## Layout

```
KnowledgeSearchBackend/
├── dockerfile                         # builds the v2-only image
├── requirement.locked.txt             # pinned pip deps (still includes some
│                                       legacy bloat — see Followups)
├── .env / .env.example                # LLM + search keys
└── mindsearch/
    ├── __init__.py                    # empty
    ├── v2_server.py                   # entry point — uvicorn on :8002
    └── agent_v2/                      # the v2 implementation
        ├── app.py                     # mount_v2(app) — adds /solve_v2
        ├── config.py                  # Settings (reads from env)
        ├── orchestrator/              # planner + searcher loop
        ├── llm/                       # anthropic / openai / fake clients
        ├── rag/                       # hybrid_search, retriever, web_search
        ├── memory/                    # conversational + tool_log
        ├── tools/                     # planner & searcher tool registries
        └── guardrails/                # constitution checks
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/healthz` | Liveness probe — `{"status": "ok", "service": "mindsearch-v2"}` |
| GET | `/` | FastAPI Swagger UI |
| POST | `/solve_v2` | SSE-streaming planner → searcher → synthesis |

## Run

### Locally (no Docker)

```bash
cd apps/KnowledgeSearchBackend
pip install -r requirement.locked.txt
cp .env.example .env       # then fill in ANTHROPIC_API_KEY etc.
python -m mindsearch.v2_server
```

### With Docker (recommended)

The service is wired into the monorepo's docker-compose under the `graph`
profile. From the repo root:

```bash
set -a && . apps/api/.env && set +a    # load secrets into shell
docker compose --profile dev --profile graph up --build
```

Then verify:

```bash
curl http://localhost:7002/healthz
curl -N -X POST http://localhost:7002/solve_v2 \
     -H 'Content-Type: application/json' \
     -d '{"inputs":"hello","web_fallback":false,"enable_tools":false,"collection_ids":[]}'
```

Inside the docker network the web app reaches this service at
`http://graph-agent:8002` — see `GRAPH_BACKEND_URL` in `apps/api/.env`.

## Required environment

| Var | Purpose | Default |
|---|---|---|
| `LLM_PROVIDER` | `anthropic` \| `openai` \| `fake` | `anthropic` |
| `ANTHROPIC_API_KEY` | Required if `LLM_PROVIDER=anthropic` | — |
| `OPENAI_API_KEY` | Required if `LLM_PROVIDER=openai` | — |
| `WEB_SEARCH_PROVIDER` | `google` \| `duckduckgo` \| empty (auto) | empty |
| `GOOGLE_SEARCH_API_KEY` | For Google Custom Search | — |
| `GOOGLE_SEARCH_ENGINE_ID` | For Google Custom Search | — |
| `PLANNER_MAX_ITERATIONS` | Planner loop cap | `8` |
| `SEARCHER_MAX_ITERATIONS` | Per-searcher loop cap | `4` |
| `MINDSEARCH_DEBUG` | `1` or `true` for DEBUG logs | unset |
| `MINDSEARCH_PORT` | Server port | `8002` |

Full list in [`.env.example`](.env.example). Keys must come from env — they
must never be hardcoded in `mindsearch/` source (push protection enforces).

## Followups

- **Prune `requirement.locked.txt`.** Legacy bloat still ships: `lmdeploy`,
  `streamlit`, `gradio`, `transformers`, `torch`, `jupyter*`, all the
  `nvidia-*` packages. None are used by `agent_v2/`. Dropping them would
  shrink the image from ~6.8 GB to a few hundred MB.
- **Add a `requirements-v2.txt`** with the minimal set: `fastapi`, `uvicorn`,
  `sse-starlette`, `pydantic`, `anthropic`, `openai`, `httpx`,
  `duckduckgo_search`, `google-api-python-client`, `python-dotenv`.
- **Containerize the entry without the apt heavyweights** (drop `python3-pandas`,
  `python3-matplotlib`, etc. from the Dockerfile's `apt-get install`).

## License

Apache 2.0. See [`LICENSE`](LICENSE). Original MindSearch:
[arxiv:2407.20183](https://arxiv.org/abs/2407.20183).
