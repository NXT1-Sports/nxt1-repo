#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  deploy-ffmpeg-mcp.sh \
    --project <gcp-project-id> \
    [--region <gcp-region>] \
    [--name <service-name>] \
    [--artifact-repo <artifact-registry-repo>] \
    [--cpu <number>] \
    [--memory <size>] \
    [--min-instances <number>] \
    [--max-instances <number>] \
    [--concurrency <number>] \
    [--service-account <email>] \
    [--token-secret <secret:version>] \
    [--set-env KEY=VALUE]... \
    [--dry-run]

Deploy the authenticated FFmpeg MCP HTTP service on Cloud Run.

After deployment set these in backend runtime:
- FFMPEG_MCP_URL=<service-url>/mcp
- FFMPEG_MCP_API_TOKEN=<same secret value as token-secret>
EOF
}

print_command() {
  printf '[dry-run]'
  printf ' %q' "$@"
  printf '\n'
}

validate_assignment() {
  local label="$1"
  local assignment="$2"
  if [[ "${assignment}" != *=* ]]; then
    echo "${label} must be in KEY=VALUE form." >&2
    exit 1
  fi
  local key="${assignment%%=*}"
  if [[ -z "${key}" ]]; then
    echo "${label} key cannot be empty." >&2
    exit 1
  fi
}

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-}"
REGION="${GOOGLE_CLOUD_REGION:-us-central1}"
SERVICE_NAME="mcp-ffmpeg"
ARTIFACT_REPO="mcp-runners"
CPU="2"
MEMORY="2Gi"
MIN_INSTANCES="0"
MAX_INSTANCES="3"
CONCURRENCY="4"
SERVICE_ACCOUNT=""
TOKEN_SECRET="FFMPEG_MCP_BEARER_TOKEN:latest"
DRY_RUN="false"

declare -a ENV_PAIRS=()

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
    --artifact-repo)
      ARTIFACT_REPO="$2"
      shift 2
      ;;
    --cpu)
      CPU="$2"
      shift 2
      ;;
    --memory)
      MEMORY="$2"
      shift 2
      ;;
    --min-instances)
      MIN_INSTANCES="$2"
      shift 2
      ;;
    --max-instances)
      MAX_INSTANCES="$2"
      shift 2
      ;;
    --concurrency)
      CONCURRENCY="$2"
      shift 2
      ;;
    --service-account)
      SERVICE_ACCOUNT="$2"
      shift 2
      ;;
    --token-secret)
      TOKEN_SECRET="$2"
      shift 2
      ;;
    --set-env)
      ENV_PAIRS+=("$2")
      shift 2
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

if [[ ${#ENV_PAIRS[@]} -gt 0 ]]; then
  for assignment in "${ENV_PAIRS[@]}"; do
    validate_assignment "--set-env" "${assignment}"
  done
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPO}/${SERVICE_NAME}:latest"
ENV_FILE="$(mktemp)"
BUILD_CONFIG_FILE="$(mktemp)"
trap 'rm -f "${ENV_FILE}" "${BUILD_CONFIG_FILE}"' EXIT

{
  printf 'FFMPEG_MCP_PATH: "/mcp"\n'
  printf 'FFMPEG_MCP_STATELESS_HTTP: "true"\n'
  if (( ${#ENV_PAIRS[@]} > 0 )); then
    for assignment in "${ENV_PAIRS[@]}"; do
      key="${assignment%%=*}"
      value="${assignment#*=}"
      printf '%s: "%s"\n' "${key}" "${value//\"/\\\"}"
    done
  fi
} > "${ENV_FILE}"

cat > "${BUILD_CONFIG_FILE}" <<EOF
steps:
  - name: gcr.io/cloud-builders/docker
    args:
      - build
      - -f
      - mcp/ffmpeg-mcp/Dockerfile
      - -t
      - ${IMAGE}
      - .
images:
  - ${IMAGE}
EOF

ARTIFACT_DESCRIBE_CMD=(
  gcloud artifacts repositories describe "${ARTIFACT_REPO}"
  --project "${PROJECT_ID}"
  --location "${REGION}"
)

ARTIFACT_CREATE_CMD=(
  gcloud artifacts repositories create "${ARTIFACT_REPO}"
  --project "${PROJECT_ID}"
  --location "${REGION}"
  --repository-format docker
)

BUILD_CMD=(
  gcloud builds submit "${BACKEND_DIR}"
  --project "${PROJECT_ID}"
  --config "${BUILD_CONFIG_FILE}"
)

DEPLOY_CMD=(
  gcloud run deploy "${SERVICE_NAME}"
  --project "${PROJECT_ID}"
  --region "${REGION}"
  --image "${IMAGE}"
  --execution-environment gen2
  --cpu "${CPU}"
  --memory "${MEMORY}"
  --concurrency "${CONCURRENCY}"
  --min-instances "${MIN_INSTANCES}"
  --max-instances "${MAX_INSTANCES}"
  --port 8080
  --allow-unauthenticated
  --env-vars-file "${ENV_FILE}"
  --update-secrets "FFMPEG_MCP_BEARER_TOKEN=${TOKEN_SECRET}"
)

if [[ -n "${SERVICE_ACCOUNT}" ]]; then
  DEPLOY_CMD+=(--service-account "${SERVICE_ACCOUNT}")
fi

if [[ "${DRY_RUN}" == "true" ]]; then
  echo "[dry-run] Generated env file:"
  cat "${ENV_FILE}"
  echo
  print_command "${ARTIFACT_DESCRIBE_CMD[@]}"
  print_command "${ARTIFACT_CREATE_CMD[@]}"
  print_command "${BUILD_CMD[@]}"
  print_command "${DEPLOY_CMD[@]}"
  exit 0
fi

if ! "${ARTIFACT_DESCRIBE_CMD[@]}" > /dev/null 2>&1; then
  "${ARTIFACT_CREATE_CMD[@]}"
fi

"${BUILD_CMD[@]}"
"${DEPLOY_CMD[@]}"

SERVICE_URL="$({
  gcloud run services describe "${SERVICE_NAME}" \
    --project "${PROJECT_ID}" \
    --region "${REGION}" \
    --format 'value(status.url)'
} | tr -d '\n')"

echo "Deployed ${SERVICE_NAME}"
echo "Service URL: ${SERVICE_URL}"
echo "Health URL: ${SERVICE_URL%/}/health"
echo "Backend FFMPEG_MCP_URL: ${SERVICE_URL%/}/mcp"
echo "Backend FFMPEG_MCP_API_TOKEN: use the same secret value as ${TOKEN_SECRET}"
