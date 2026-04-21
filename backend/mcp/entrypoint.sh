#!/usr/bin/env bash

set -euo pipefail

if [[ -z "${MCP_LAUNCH_COMMAND:-}" ]]; then
  echo "MCP_LAUNCH_COMMAND is required." >&2
  exit 1
fi

export PORT="${PORT:-8080}"

if [[ -n "${MCP_STATE_DIR:-}" ]]; then
  mkdir -p "${MCP_STATE_DIR}"
fi

if [[ -n "${MCP_PUBLIC_BASE_URL:-}" && -z "${GOOGLE_OAUTH_REDIRECT_URI:-}" ]]; then
  export GOOGLE_OAUTH_REDIRECT_URI="${MCP_PUBLIC_BASE_URL%/}/oauth2callback"
fi

echo "[NXT1 MCP Runner] Starting container"
echo "[NXT1 MCP Runner] Port: ${PORT}"
if [[ -n "${MCP_STATE_DIR:-}" ]]; then
  echo "[NXT1 MCP Runner] State directory: ${MCP_STATE_DIR}"
fi

exec /bin/sh -lc "${MCP_LAUNCH_COMMAND}"