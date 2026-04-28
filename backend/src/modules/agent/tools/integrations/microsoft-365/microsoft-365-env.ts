import type { ToolExecutionContext } from '../../base.tool.js';

const MICROSOFT_365_MCP_DEFAULT_URL = 'http://127.0.0.1:3000/mcp';

type Microsoft365RuntimeEnvironment = ToolExecutionContext['environment'] | undefined;

function isStagingEnvironment(environment?: Microsoft365RuntimeEnvironment): boolean {
  if (environment === 'staging') return true;
  if (environment === 'production') return false;
  return process.env['NODE_ENV'] === 'staging';
}

export function normalizeMicrosoft365McpUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

export function resolveMicrosoft365McpUrl(environment?: Microsoft365RuntimeEnvironment): string {
  const endpointUrl = isStagingEnvironment(environment)
    ? (process.env['STAGING_MICROSOFT_365_MCP_URL'] ??
      process.env['MICROSOFT_365_MCP_URL'] ??
      MICROSOFT_365_MCP_DEFAULT_URL)
    : (process.env['PRODUCTION_MICROSOFT_365_MCP_URL'] ??
      process.env['MICROSOFT_365_MCP_URL'] ??
      (process.env['NODE_ENV'] === 'production' ? '' : MICROSOFT_365_MCP_DEFAULT_URL));

  return normalizeMicrosoft365McpUrl(endpointUrl);
}

export function resolveMicrosoftOAuthCredentials(environment?: Microsoft365RuntimeEnvironment): {
  clientId: string;
  clientSecret: string;
} {
  const isStaging = isStagingEnvironment(environment);

  return {
    clientId: isStaging
      ? (process.env['STAGING_MICROSOFT_CLIENT_ID'] ?? process.env['MICROSOFT_CLIENT_ID'] ?? '')
      : (process.env['MICROSOFT_CLIENT_ID'] ?? ''),
    clientSecret: isStaging
      ? (process.env['STAGING_MICROSOFT_CLIENT_SECRET'] ??
        process.env['MICROSOFT_CLIENT_SECRET'] ??
        '')
      : (process.env['MICROSOFT_CLIENT_SECRET'] ?? ''),
  };
}
