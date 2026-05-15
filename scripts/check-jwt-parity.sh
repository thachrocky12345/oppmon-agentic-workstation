#!/usr/bin/env bash
# TAG-65 — JWT_SECRET parity check for prod swarm.
#
# Verifies that oppmon_api and oppmon_graph-agent are running with the
# SAME JWT_SECRET in their service spec. A mismatch silently rejects
# every JWT minted by the API on the graph-agent side; the operator
# usually only finds out when /solve returns 401 for a valid login.
#
# Run from the swarm manager (old_windows) after every
# `docker stack deploy`. Invoked from the `prod-swarm-deploy` skill's
# `smoke` step and the `swarm-debug` skill's `solve-v3-check` subroutine.
#
# Exit codes:
#   0  parity OK
#   1  one or both services missing / mismatched / empty
#   2  docker / inspect failure (operator should re-check the deploy)
#
# Usage:
#   ./scripts/check-jwt-parity.sh                 # uses default stack name "oppmon"
#   STACK=mystack ./scripts/check-jwt-parity.sh   # custom stack name
#
# Override for unit testing:
#   API_INSPECT_CMD='cat fixtures/api.env'    \
#   GRAPH_INSPECT_CMD='cat fixtures/graph.env' \
#   ./scripts/check-jwt-parity.sh
#
# The two _INSPECT_CMD overrides let the pytest harness feed canned
# `docker service inspect` output without needing a real swarm.

set -eu

STACK="${STACK:-oppmon}"
API_SVC="${API_SVC:-${STACK}_api}"
GRAPH_SVC="${GRAPH_SVC:-${STACK}_graph-agent}"

# Default inspect commands shell out to docker. Override via env for tests.
API_INSPECT_CMD="${API_INSPECT_CMD:-docker service inspect ${API_SVC} --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}'}"
GRAPH_INSPECT_CMD="${GRAPH_INSPECT_CMD:-docker service inspect ${GRAPH_SVC} --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}'}"

# Pull JWT_SECRET=... from each service's env block. `head -1` because
# `printenv`-style env blocks can in theory have duplicates; we trust
# the first occurrence (which is what the container will see).
api_env="$(eval "$API_INSPECT_CMD" 2>/dev/null)" || {
  echo "ERROR: failed to inspect ${API_SVC}. Is the stack deployed?" >&2
  exit 2
}
graph_env="$(eval "$GRAPH_INSPECT_CMD" 2>/dev/null)" || {
  echo "ERROR: failed to inspect ${GRAPH_SVC}. Is the stack deployed?" >&2
  exit 2
}

api_secret="$(printf '%s\n' "$api_env" | grep -E '^JWT_SECRET=' | head -1 | cut -d'=' -f2-)"
graph_secret="$(printf '%s\n' "$graph_env" | grep -E '^JWT_SECRET=' | head -1 | cut -d'=' -f2-)"

if [ -z "$api_secret" ]; then
  echo "FAIL: ${API_SVC} has no JWT_SECRET (or it is empty)." >&2
  exit 1
fi
if [ -z "$graph_secret" ]; then
  echo "FAIL: ${GRAPH_SVC} has no JWT_SECRET (or it is empty)." >&2
  echo "      Did you source apps/api/.env before \`docker stack deploy\`?" >&2
  exit 1
fi

if [ "$api_secret" = "$graph_secret" ]; then
  # Never print the secret itself — print a length so the operator can
  # eyeball whether it looks like a real HMAC key without leaking it.
  echo "OK: JWT_SECRET parity confirmed (len=${#api_secret}) between ${API_SVC} and ${GRAPH_SVC}."
  exit 0
fi

echo "FAIL: JWT_SECRET MISMATCH between ${API_SVC} and ${GRAPH_SVC}." >&2
echo "      api len=${#api_secret}  graph len=${#graph_secret}" >&2
echo "      Fix: \`set -a && . apps/api/.env && set +a && docker stack deploy --with-registry-auth -c docker-stack.yml ${STACK}\`" >&2
exit 1
