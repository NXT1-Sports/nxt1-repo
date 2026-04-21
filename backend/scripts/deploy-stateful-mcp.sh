#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  deploy-stateful-mcp.sh \
    --name <service-name> \
    --project <gcp-project-id> \
    --region <gcp-region> \
    --mount-path <container-path> \
    --launch-command <shell-command> \
    [--bucket <gcs-bucket>] \
    [--artifact-repo <artifact-registry-repo>] \
    [--cpu <number>] \
    [--memory <size>] \
    [--min-instances <number>] \
    [--max-instances <number>] \
    [--concurrency <number>] \
    [--service-account <email>] \
    [--set-env KEY=VALUE]... \
    [--set-secret KEY=SECRET:VERSION]... \
    [--dry-run]

Deploy a reusable Cloud Run container for MCP servers that:
- expose an HTTP endpoint on $PORT
- persist file-based state under a mounted directory

This runner is intended for flat-file state such as OAuth credentials or JSON caches.
Do not use it for SQLite or workloads requiring POSIX file locking.
EOF
}

yaml_quote() {
  local value="${1//\'/\'\'}"
  printf "'%s'" "${value}"
}

print_command() {
  printf '[dry-run]'
  printf ' %q' "$@"
  printf '\n'
}

require_value() {
  local flag="$1"
  local value="$2"
  if [[ -z "${value}" ]]; then
    echo "${flag} requires a value." >&2
    exit 1
  fi
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

SERVICE_NAME=""
PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-}"
REGION="${GOOGLE_CLOUD_REGION:-us-central1}"
MOUNT_PATH=""
LAUNCH_COMMAND=""
BUCKET_NAME=""
ARTIFACT_REPO="mcp-runners"
CPU="1"
MEMORY="512Mi"
MIN_INSTANCES="0"
MAX_INSTANCES="1"
CONCURRENCY="8"
SERVICE_ACCOUNT=""
DRY_RUN="false"

declare -a ENV_PAIRS=()
declare -a SECRET_PAIRS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)
      SERVICE_NAME="$2"
      shift 2
      ;;
    --project)
      PROJECT_ID="$2"
      shift 2
      ;;
    --region)
      REGION="$2"
      shift 2
      ;;
    --mount-path)
      MOUNT_PATH="$2"
      shift 2
      ;;
    --launch-command)
      LAUNCH_COMMAND="$2"
      shift 2
      ;;
    --bucket)
      BUCKET_NAME="$2"
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
    --set-env)
      ENV_PAIRS+=("$2")
      shift 2
      ;;
    --set-secret)
      SECRET_PAIRS+=("$2")
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

require_value "--name" "${SERVICE_NAME}"
require_value "--project" "${PROJECT_ID}"
require_value "--region" "${REGION}"
require_value "--mount-path" "${MOUNT_PATH}"
require_value "--launch-command" "${LAUNCH_COMMAND}"

if (( ${#ENV_PAIRS[@]} > 0 )); then
  for assignment in "${ENV_PAIRS[@]}"; do
    validate_assignment "--set-env" "${assignment}"
  done
fi

if (( ${#SECRET_PAIRS[@]} > 0 )); then
  for assignment in "${SECRET_PAIRS[@]}"; do
    validate_assignment "--set-secret" "${assignment}"
  done
fi

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUCKET_NAME="${BUCKET_NAME:-${PROJECT_ID}-${SERVICE_NAME}-state}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPO}/${SERVICE_NAME}:latest"

ENV_FILE="$(mktemp)"
trap 'rm -f "${ENV_FILE}"' EXIT

{
  printf 'MCP_LAUNCH_COMMAND: %s\n' "$(yaml_quote "${LAUNCH_COMMAND}")"
  printf 'MCP_STATE_DIR: %s\n' "$(yaml_quote "${MOUNT_PATH}")"
  if (( ${#ENV_PAIRS[@]} > 0 )); then
    for assignment in "${ENV_PAIRS[@]}"; do
      key="${assignment%%=*}"
      value="${assignment#*=}"
      printf '%s: %s\n' "${key}" "$(yaml_quote "${value}")"
    done
  fi
} > "${ENV_FILE}"

BUILD_CMD=(
  gcloud builds submit "${BACKEND_DIR}"
  --project "${PROJECT_ID}"
  --tag "${IMAGE}"
  --file "${BACKEND_DIR}/mcp/Dockerfile"
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
  --add-volume "name=mcp-state,type=cloud-storage,bucket=${BUCKET_NAME}"
  --add-volume-mount "volume=mcp-state,mount-path=${MOUNT_PATH}"
)

if [[ -n "${SERVICE_ACCOUNT}" ]]; then
  DEPLOY_CMD+=(--service-account "${SERVICE_ACCOUNT}")
fi

if [[ ${#SECRET_PAIRS[@]} -gt 0 ]]; then
  SECRET_STRING="$(IFS=,; echo "${SECRET_PAIRS[*]}")"
  DEPLOY_CMD+=(--update-secrets "${SECRET_STRING}")
fi

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

BUCKET_DESCRIBE_CMD=(
  gcloud storage buckets describe "gs://${BUCKET_NAME}"
  --project "${PROJECT_ID}"
)

BUCKET_CREATE_CMD=(
  gcloud storage buckets create "gs://${BUCKET_NAME}"
  --project "${PROJECT_ID}"
  --location "${REGION}"
  --uniform-bucket-level-access
)

if [[ "${DRY_RUN}" == "true" ]]; then
  echo "[dry-run] Generated env file:"
  cat "${ENV_FILE}"
  echo
  print_command "${ARTIFACT_DESCRIBE_CMD[@]}"
  print_command "${ARTIFACT_CREATE_CMD[@]}"
  print_command "${BUCKET_DESCRIBE_CMD[@]}"
  print_command "${BUCKET_CREATE_CMD[@]}"
  print_command "${BUILD_CMD[@]}"
  print_command "${DEPLOY_CMD[@]}"
  exit 0
fi

if ! "${ARTIFACT_DESCRIBE_CMD[@]}" > /dev/null 2>&1; then
  "${ARTIFACT_CREATE_CMD[@]}"
fi

if ! "${BUCKET_DESCRIBE_CMD[@]}" > /dev/null 2>&1; then
  "${BUCKET_CREATE_CMD[@]}"
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
echo "State bucket: gs://${BUCKET_NAME}"