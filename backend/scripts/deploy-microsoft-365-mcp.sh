#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  deploy-microsoft-365-mcp.sh \
    --project <gcp-project-id> \
    [--region <gcp-region>] \
    [--name <service-name>] \
    [--bucket <gcs-bucket>] \
    [--preset <mail,calendar,files,...>] \
    [--enabled-tools <regex>] \
    [--read-only] \
    [--dry-run]

Deploy the Microsoft 365 MCP server on Cloud Run using the shared
stateful MCP runner. This script launches @softeria/ms-365-mcp-server
in HTTP mode with org mode and dynamic discovery enabled.
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-}"
REGION="${GOOGLE_CLOUD_REGION:-us-central1}"
SERVICE_NAME="mcp-microsoft-365"
BUCKET_NAME=""
PRESET="mail,calendar,files"
ENABLED_TOOLS=""
READ_ONLY="false"
DRY_RUN="false"
MOUNT_PATH="/root/.ms365_mcp"
CLIENT_ID_SECRET="${MICROSOFT_MCP_CLIENT_ID_SECRET:-MS365_MCP_CLIENT_ID:latest}"
TENANT_ID_SECRET="${MICROSOFT_MCP_TENANT_ID_SECRET:-MS365_MCP_TENANT_ID:latest}"
CLIENT_SECRET_SECRET="${MICROSOFT_MCP_CLIENT_SECRET_SECRET:-MS365_MCP_CLIENT_SECRET:latest}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)
      PROJECT_ID="$2"
      shift 2
      ;;
    --region)
      REGION="$2"
      shift 2
      ;;
    --name)
      SERVICE_NAME="$2"
      shift 2
      ;;
    --bucket)
      BUCKET_NAME="$2"
      shift 2
      ;;
    --preset)
      PRESET="$2"
      shift 2
      ;;
    --enabled-tools)
      ENABLED_TOOLS="$2"
      shift 2
      ;;
    --read-only)
      READ_ONLY="true"
      shift
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "${PROJECT_ID}" ]]; then
  echo "--project is required." >&2
  exit 1
fi

LAUNCH_COMMAND="npx -y @softeria/ms-365-mcp-server --http 8080 --org-mode --discovery --preset ${PRESET}"
if [[ -n "${ENABLED_TOOLS}" ]]; then
  LAUNCH_COMMAND+=" --enabled-tools ${ENABLED_TOOLS}"
fi
if [[ "${READ_ONLY}" == "true" ]]; then
  LAUNCH_COMMAND+=" --read-only"
fi

DEPLOY_ARGS=(
  --name "${SERVICE_NAME}"
  --project "${PROJECT_ID}"
  --region "${REGION}"
  --mount-path "${MOUNT_PATH}"
  --launch-command "${LAUNCH_COMMAND}"
  --set-secret "MS365_MCP_CLIENT_ID=${CLIENT_ID_SECRET}"
  --set-secret "MS365_MCP_TENANT_ID=${TENANT_ID_SECRET}"
  --set-secret "MS365_MCP_CLIENT_SECRET=${CLIENT_SECRET_SECRET}"
  --set-env "MS365_MCP_TOKEN_CACHE_PATH=${MOUNT_PATH}/token-cache.json"
  --set-env "MS365_MCP_SELECTED_ACCOUNT_PATH=${MOUNT_PATH}/selected-account.json"
)

if [[ -n "${BUCKET_NAME}" ]]; then
  DEPLOY_ARGS+=(--bucket "${BUCKET_NAME}")
fi

if [[ "${DRY_RUN}" == "true" ]]; then
  DEPLOY_ARGS+=(--dry-run)
fi

bash "${SCRIPT_DIR}/deploy-stateful-mcp.sh" "${DEPLOY_ARGS[@]}"

if [[ "${DRY_RUN}" == "true" ]]; then
  exit 0
fi

SERVICE_URL="$({
  gcloud run services describe "${SERVICE_NAME}" \
    --project "${PROJECT_ID}" \
    --region "${REGION}" \
    --format 'value(status.url)'
} | tr -d '\n')"
MCP_URL="${SERVICE_URL%/}/mcp"

echo "Microsoft 365 MCP URL: ${MCP_URL}"
echo "Set backend MICROSOFT_365_MCP_URL to this value (or env-specific variants)."
