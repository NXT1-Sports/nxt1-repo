# Chart MCP Service

Deployable authenticated HTTP wrapper for `@antv/mcp-server-chart` for NXT1
Agent X.

This service:

- runs the upstream AntV Chart MCP server in `streamable` mode on `/mcp`
- protects all MCP requests with a shared token header
- exposes a health check on `/health`
- supports passthrough upstream envs for private AntV rendering

Required runtime env:

- `CHART_MCP_BEARER_TOKEN`

Optional runtime env:

- `CHART_MCP_VIS_REQUEST_SERVER`
- `CHART_MCP_SERVICE_ID`
- `CHART_MCP_DISABLED_TOOLS`

Backend runtime env after deployment:

- `CHART_MCP_URL=https://<service-url>/mcp`
- `CHART_MCP_API_TOKEN=<same bearer token value>`

Deploy with:

```bash
backend/scripts/deploy-chart-mcp.sh --project <gcp-project-id>
```
