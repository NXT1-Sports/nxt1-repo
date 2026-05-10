#!/usr/bin/env bash
#
# Launch the taylorwilsdon/google_workspace_mcp server locally with the
# Google OAuth credentials the NXT1 backend already uses for Gmail/Calendar.
#
# Prereqs:
#   1. `uv` installed (https://docs.astral.sh/uv/).
#   2. backend/.env contains CLIENT_ID / CLIENT_SECRET (Google OAuth client
#      from Google Cloud Console — the same pair used by the Gmail connector).
#   3. That OAuth client must have `http://localhost:8000/oauth2callback`
#      registered as an Authorized redirect URI in GCP console.
#
# Usage:
#   ./scripts/start-workspace-mcp.sh
#
# Stop with Ctrl+C.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${REPO_ROOT}/backend/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "❌ backend/.env not found at ${ENV_FILE}" >&2
  exit 1
fi

# Load ONLY the keys we need, without polluting the shell.
# Strips surrounding quotes and whitespace.
get_env() {
  local key="$1"
  local line
  line="$(grep -E "^\s*${key}\s*=" "${ENV_FILE}" | head -n1 || true)"
  [[ -z "${line}" ]] && return 0
  local value="${line#*=}"
  # trim surrounding whitespace
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  # strip surrounding quotes
  value="${value%\"}"; value="${value#\"}"
  value="${value%\'}"; value="${value#\'}"
  printf '%s' "${value}"
}

CLIENT_ID_VALUE="$(get_env CLIENT_ID)"
CLIENT_SECRET_VALUE="$(get_env CLIENT_SECRET)"

if [[ -z "${CLIENT_ID_VALUE}" || -z "${CLIENT_SECRET_VALUE}" ]]; then
  echo "❌ CLIENT_ID or CLIENT_SECRET missing in ${ENV_FILE}" >&2
  exit 1
fi

# Kill any existing workspace-mcp process on :8000 to avoid port conflicts.
if pgrep -f "workspace-mcp" > /dev/null; then
  echo "⚠️  Existing workspace-mcp process detected — terminating it..."
  pkill -f "workspace-mcp" || true
  sleep 1
fi

export GOOGLE_OAUTH_CLIENT_ID="${CLIENT_ID_VALUE}"
export GOOGLE_OAUTH_CLIENT_SECRET="${CLIENT_SECRET_VALUE}"
# workspace-mcp defaults to this redirect; keep explicit for clarity.
export GOOGLE_OAUTH_REDIRECT_URI="${GOOGLE_OAUTH_REDIRECT_URI:-http://localhost:8000/oauth2callback}"
# Optional: pin a known-good version to match NXT1's dynamic discovery layer.
WORKSPACE_MCP_VERSION="${WORKSPACE_MCP_VERSION:-1.19.0}"

echo "🚀 Starting google_workspace_mcp@${WORKSPACE_MCP_VERSION} on http://127.0.0.1:8000/mcp"
echo "   OAuth client: ${GOOGLE_OAUTH_CLIENT_ID:0:12}..."
echo "   Redirect URI: ${GOOGLE_OAUTH_REDIRECT_URI}"
echo ""

exec uvx "workspace-mcp==${WORKSPACE_MCP_VERSION}" --transport streamable-http
