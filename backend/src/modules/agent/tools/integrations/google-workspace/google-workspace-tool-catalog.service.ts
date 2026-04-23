import { logger } from '../../../../../utils/logger.js';
import { GoogleWorkspaceDiscoveryBridgeService } from './google-workspace-discovery-bridge.service.js';
import {
  filterGoogleWorkspaceToolDefinitions,
  type GoogleWorkspaceDiscoveredToolDefinition,
} from './shared.js';
import { AgentEngineError } from '../../../exceptions/agent-engine.error.js';

const GOOGLE_WORKSPACE_MCP_DEFAULT_URL = 'http://127.0.0.1:8000/mcp';

function normalizeGoogleWorkspaceMcpUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function resolveGoogleWorkspaceMcpUrl(): string {
  const endpointUrl =
    process.env['GOOGLE_WORKSPACE_MCP_URL'] ??
    (process.env['NODE_ENV'] === 'production' ? '' : GOOGLE_WORKSPACE_MCP_DEFAULT_URL);

  if (!endpointUrl) {
    throw new AgentEngineError(
      'GOOGLE_WORKSPACE_CONFIG_INVALID',
      'GOOGLE_WORKSPACE_MCP_URL is required in production before Google Workspace MCP tools can be enabled.'
    );
  }

  const normalized = normalizeGoogleWorkspaceMcpUrl(endpointUrl);
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    throw new AgentEngineError(
      'GOOGLE_WORKSPACE_CONFIG_INVALID',
      'GOOGLE_WORKSPACE_MCP_URL must be an absolute http(s) URL.'
    );
  }

  return normalized;
}

export class GoogleWorkspaceToolCatalogService {
  private cache: readonly GoogleWorkspaceDiscoveredToolDefinition[] | null = null;

  constructor(private readonly endpointUrl = resolveGoogleWorkspaceMcpUrl()) {}

  async listTools(
    forceRefresh = false
  ): Promise<readonly GoogleWorkspaceDiscoveredToolDefinition[]> {
    if (!forceRefresh && this.cache) return this.cache;

    const bridge = new GoogleWorkspaceDiscoveryBridgeService(this.endpointUrl);
    try {
      const definitions = await bridge.listToolDefinitions();
      const filtered = filterGoogleWorkspaceToolDefinitions(definitions);
      this.cache = filtered;
      return filtered;
    } catch (error) {
      logger.warn('[GoogleWorkspaceMCP] Failed to discover tool catalog', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      await bridge.disconnect().catch(() => undefined);
    }
  }
}
