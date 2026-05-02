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

Deploy with:

```bash
backend/scripts/deploy-ffmpeg-mcp.sh --project <gcp-project-id>
```
