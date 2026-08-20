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
- `FFMPEG_MCP_SUBPROCESS_TIMEOUT_SECONDS=840` (optional Cloud Run MCP subprocess
  timeout for long FFmpeg re-encodes; keep this lower than the Cloud Run request
  timeout so the wrapper can return a structured error)

Deploy with:

```bash
backend/scripts/deployments/deploy-ffmpeg-mcp.sh --project <gcp-project-id>
```

The deploy script defaults Cloud Run request timeout to 900 seconds so longer
video re-encodes can outlive the backend client's
`FFMPEG_MCP_REENCODE_TIMEOUT_MS` window. It also defaults the FFmpeg subprocess
timeout to 840 seconds so Python can handle FFmpeg timeouts before Cloud Run
terminates the request.
