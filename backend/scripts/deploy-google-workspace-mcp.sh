#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  deploy-google-workspace-mcp.sh \
    --project <gcp-project-id> \
    [--region <gcp-region>] \
    [--name <service-name>] \
    [--bucket <gcs-bucket>] \
    [--version <workspace-mcp-version>] \
    [--tool-tier <core|extended|complete>] \
    [--read-only] \
    [--dry-run]

Deploy the Google Workspace MCP server on Cloud Run using the shared
file-state MCP runner. This script also sets GOOGLE_OAUTH_REDIRECT_URI to
<service-url>/oauth2callback after deployment.
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-}"
REGION="${GOOGLE_CLOUD_REGION:-us-central1}"
SERVICE_NAME="mcp-google-workspace"
BUCKET_NAME=""
WORKSPACE_MCP_VERSION="${WORKSPACE_MCP_VERSION:-1.19.0}"
TOOL_TIER="complete"
READ_ONLY="false"
DRY_RUN="false"
MOUNT_PATH="/root/.google_workspace_mcp/credentials"
CLIENT_ID_SECRET="${GOOGLE_OAUTH_CLIENT_ID_SECRET:-GOOGLE_OAUTH_CLIENT_ID:latest}"
CLIENT_SECRET_SECRET="${GOOGLE_OAUTH_CLIENT_SECRET_SECRET:-GOOGLE_OAUTH_CLIENT_SECRET:latest}"

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
    --version)
      WORKSPACE_MCP_VERSION="$2"
      shift 2
      ;;
    --tool-tier)
      TOOL_TIER="$2"
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

LAUNCH_COMMAND="uvx \"workspace-mcp==${WORKSPACE_MCP_VERSION}\" --transport streamable-http --tool-tier ${TOOL_TIER}"
if [[ "${READ_ONLY}" == "true" ]]; then
  LAUNCH_COMMAND+=" --read-only"
fi

DEPLOY_ARGS=(
  --name "${SERVICE_NAME}"
  --project "${PROJECT_ID}"
  --region "${REGION}"
  --mount-path "${MOUNT_PATH}"
  --launch-command "${LAUNCH_COMMAND}"
  --set-secret "GOOGLE_OAUTH_CLIENT_ID=${CLIENT_ID_SECRET}"
  --set-secret "GOOGLE_OAUTH_CLIENT_SECRET=${CLIENT_SECRET_SECRET}"
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
REDIRECT_URI="${SERVICE_URL%/}/oauth2callback"
MCP_URL="${SERVICE_URL%/}/mcp"

gcloud run services update "${SERVICE_NAME}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --update-env-vars "MCP_PUBLIC_BASE_URL=${SERVICE_URL},GOOGLE_OAUTH_REDIRECT_URI=${REDIRECT_URI}"

echo "Google Workspace MCP redirect URI: ${REDIRECT_URI}"
echo "Backend GOOGLE_WORKSPACE_MCP_URL: ${MCP_URL}"
echo "Add ${REDIRECT_URI} to the Google OAuth client redirect URIs before production traffic."