#!/usr/bin/env bash
set -euo pipefail

# Configure Firebase/GCS bucket CORS for direct browser uploads (signed URL PUT).
# Usage:
#   ./scripts/configure-storage-cors.sh <bucket-name> [origin1 origin2 ...]
# Example:
#   ./scripts/configure-storage-cors.sh nxt-1-staging-v2.firebasestorage.app http://localhost:4200 https://staging.nxt1.com

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <bucket-name> [origin1 origin2 ...]"
  exit 1
fi

bucket_name="$1"
shift || true

if [[ $# -gt 0 ]]; then
  origins=("$@")
else
  origins=(
    "http://localhost:4200"
    "http://127.0.0.1:4200"
  )
fi

tmp_file="$(mktemp)"
trap 'rm -f "$tmp_file"' EXIT

origin_json=""
for origin in "${origins[@]}"; do
  if [[ -n "$origin_json" ]]; then
    origin_json+=$',\n'
  fi
  origin_json+="    \"${origin}\""
done

cat >"$tmp_file" <<EOF
[
  {
    "origin": [
${origin_json}
    ],
    "method": ["GET", "PUT", "HEAD", "OPTIONS"],
    "responseHeader": [
      "Content-Type",
      "x-goog-resumable",
      "x-goog-meta-*",
      "x-goog-content-sha256"
    ],
    "maxAgeSeconds": 3600
  }
]
EOF

echo "Applying CORS config to gs://${bucket_name}"
gcloud storage buckets update "gs://${bucket_name}" --cors-file="$tmp_file"
echo "CORS configuration applied successfully."
