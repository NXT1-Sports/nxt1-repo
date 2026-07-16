#!/usr/bin/env bash
# =============================================================================
# apply-storage-cors.sh — Apply GCS CORS configuration to Firebase Storage buckets
#
# Firebase Storage (backed by GCS) requires bucket-level CORS configuration so
# browsers can make direct PUT uploads and CORS-enabled media playback requests
# from the web app. Without this, requests from allowed app origins are blocked
# with 403/no CORS headers or browser-side media CORS failures.
#
# Usage:
#   ./apply-storage-cors.sh              # Apply to both production and staging
#   ./apply-storage-cors.sh production   # Production bucket only
#   ./apply-storage-cors.sh staging      # Staging bucket only
#
# Requirements:
#   - gcloud CLI authenticated: gcloud auth login
#   - Or service account key: GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
#   - gsutil is included with gcloud CLI
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

PROD_BUCKET="nxt-1-v2.firebasestorage.app"
STAGING_BUCKET="nxt-1-staging-v2.firebasestorage.app"
PROD_CORS="$REPO_ROOT/storage-cors-production.json"
STAGING_CORS="$REPO_ROOT/storage-cors-staging.json"

TARGET="${1:-both}"

apply_cors() {
  local bucket="$1"
  local cors_file="$2"
  local env_label="$3"

  echo "→ Applying CORS to $env_label bucket: gs://$bucket"
  gsutil cors set "$cors_file" "gs://$bucket"
  echo "  ✅ Done. Verifying..."
  gsutil cors get "gs://$bucket"
}

case "$TARGET" in
  production|prod)
    apply_cors "$PROD_BUCKET" "$PROD_CORS" "production"
    ;;
  staging)
    apply_cors "$STAGING_BUCKET" "$STAGING_CORS" "staging"
    ;;
  both|*)
    apply_cors "$PROD_BUCKET"    "$PROD_CORS"    "production"
    apply_cors "$STAGING_BUCKET" "$STAGING_CORS" "staging"
    ;;
esac

echo ""
echo "🎉 CORS configuration applied successfully."
echo "   Browser uploads and CORS-enabled media playback from configured app origins will now work."
