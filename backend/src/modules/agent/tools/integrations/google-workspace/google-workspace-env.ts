import type { ToolExecutionContext } from '../../base.tool.js';

const GOOGLE_WORKSPACE_MCP_DEFAULT_URL = 'http://127.0.0.1:8000/mcp';

type GoogleWorkspaceRuntimeEnvironment = ToolExecutionContext['environment'] | undefined;

function isStagingEnvironment(environment?: GoogleWorkspaceRuntimeEnvironment): boolean {
  if (environment === 'staging') return true;
  if (environment === 'production') return false;
  return process.env['NODE_ENV'] === 'staging';
}

export function normalizeGoogleWorkspaceMcpUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

export function resolveGoogleWorkspaceMcpUrl(
  environment?: GoogleWorkspaceRuntimeEnvironment
): string {
  const endpointUrl = isStagingEnvironment(environment)
    ? (process.env['STAGING_GOOGLE_WORKSPACE_MCP_URL'] ??
      process.env['GOOGLE_WORKSPACE_MCP_URL'] ??
      GOOGLE_WORKSPACE_MCP_DEFAULT_URL)
    : (process.env['PRODUCTION_GOOGLE_WORKSPACE_MCP_URL'] ??
      process.env['GOOGLE_WORKSPACE_MCP_URL'] ??
      (process.env['NODE_ENV'] === 'production' ? '' : GOOGLE_WORKSPACE_MCP_DEFAULT_URL));

  return normalizeGoogleWorkspaceMcpUrl(endpointUrl);
}

export function resolveGoogleWorkspaceMcpStateBucket(
  environment?: GoogleWorkspaceRuntimeEnvironment
): string {
  return isStagingEnvironment(environment)
    ? (process.env['STAGING_GOOGLE_WORKSPACE_MCP_STATE_BUCKET'] ??
        process.env['GOOGLE_WORKSPACE_MCP_STATE_BUCKET'] ??
        'nxt-1-staging-v2-mcp-gw-state')
    : (process.env['PRODUCTION_GOOGLE_WORKSPACE_MCP_STATE_BUCKET'] ??
        process.env['GOOGLE_WORKSPACE_MCP_STATE_BUCKET'] ??
        'nxt1-mcp-gw-state');
}
