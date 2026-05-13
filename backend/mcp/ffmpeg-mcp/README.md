# FFmpeg MCP Service

Deployable HTTP wrapper for `dubnium0/ffmpeg-mcp` for NXT1 Agent X.

This service:

- installs upstream `ffmpeg-mcp` directly from GitHub
- exposes Streamable HTTP on `/mcp`
- protects all MCP requests with a bearer token
- exposes a health check on `/health`

Required runtime env:

- `FFMPEG_MCP_BEARER_TOKEN`

Backend runtime env after deployment:

- `FFMPEG_MCP_URL=https://<service-url>/mcp`
- `FFMPEG_MCP_API_TOKEN=<same bearer token value>`
- `FFMPEG_MCP_DEFAULT_TIMEOUT_MS=60000` (optional backend client timeout for
  light operations)
- `FFMPEG_MCP_LONG_TIMEOUT_MS=180000` (optional backend client timeout for
  trim/merge/resize)
- `FFMPEG_MCP_REENCODE_TIMEOUT_MS=300000` (optional backend client timeout for
  overlay/subtitle/convert/compress)

Deploy with:

```bash
backend/scripts/deploy-ffmpeg-mcp.sh --project <gcp-project-id>
```

The deploy script defaults Cloud Run request timeout to 900 seconds so longer
video re-encodes can outlive the backend client's
`FFMPEG_MCP_REENCODE_TIMEOUT_MS` window.
