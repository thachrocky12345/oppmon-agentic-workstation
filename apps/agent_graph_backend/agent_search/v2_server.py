"""V2-only FastAPI server.

Skips the legacy mindsearch/app.py entirely (which depends on the `class_registry`
package that isn't installed in this environment). Mounts only the agent_v2
`/solve_v2` route. Used by Arkon's chat page when graph mode is enabled.

Run:
    python -m mindsearch.v2_server
or
    uvicorn mindsearch.v2_server:app --host 0.0.0.0 --port 8002

CORS is wide-open for local dev so the Arkon frontend (port 3002) can call this.
"""

from __future__ import annotations

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from mindsearch.agent_v2.app import mount_v2

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger(__name__)

app = FastAPI(title="MindSearch v2 (agent_v2 only)", docs_url="/")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

mount_v2(app)


@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "mindsearch-v2"}


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("MINDSEARCH_PORT", "8002"))
    log.info("Starting MindSearch v2 server on :%s", port)
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
