import type { ToolExecutionContext } from '../../base.tool.js';
import { logger } from '../../../../../utils/logger.js';
import { AgentEngineError } from '../../../exceptions/agent-engine.error.js';
import { resolveMicrosoft365McpUrl } from './microsoft-365-env.js';
import { Microsoft365McpBridgeService } from './microsoft-365-mcp-bridge.service.js';
import { Microsoft365TokenManagerService } from './microsoft-365-token-manager.service.js';
import {
  extractMicrosoft365ErrorMessage,
  extractMicrosoft365Payload,
  filterMicrosoft365ToolDefinitions,
  getMicrosoft365ToolMetadataFromCatalog,
  type Microsoft365DiscoveredToolDefinition,
} from './shared.js';

const MICROSOFT_365_TOOL_TIMEOUT_MS = 90_000;
const MICROSOFT_365_SESSION_IDLE_TTL_MS = 2 * 60 * 1_000;
const MICROSOFT_365_MAX_SESSIONS = 100;

interface Microsoft365SessionEntry {
  readonly bridge: Microsoft365McpBridgeService;
  readonly userId: string;
  readonly microsoftEmail: string;
  readonly environment: ToolExecutionContext['environment'];
  lastUsedAtMs: number;
  toolsCache?: {
    readonly fetchedAtMs: number;
    readonly tools: readonly Microsoft365DiscoveredToolDefinition[];
  };
}

function isAuthenticationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /401|403|unauthorized|forbidden|invalid token|bearer/i.test(message.toLowerCase());
}

export class Microsoft365McpSessionService {
  private readonly sessions = new Map<string, Microsoft365SessionEntry>();

  constructor(
    private readonly tokenManager: Microsoft365TokenManagerService = new Microsoft365TokenManagerService(),
    private readonly endpointUrl = resolveMicrosoft365McpUrl()
  ) {
    if (!this.endpointUrl) {
      throw new AgentEngineError(
        'MICROSOFT_365_CONFIG_INVALID',
        'MICROSOFT_365_MCP_URL is required in production before Microsoft 365 MCP tools can be enabled.'
      );
    }

    if (!this.endpointUrl.startsWith('http://') && !this.endpointUrl.startsWith('https://')) {
      throw new AgentEngineError(
        'MICROSOFT_365_CONFIG_INVALID',
        'MICROSOFT_365_MCP_URL must be an absolute http(s) URL.'
      );
    }
  }

  async listAvailableTools(
    context: ToolExecutionContext
  ): Promise<readonly Microsoft365DiscoveredToolDefinition[]> {
    const session = await this.getSession(context);
    try {
      if (
        session.toolsCache &&
        Date.now() - session.toolsCache.fetchedAtMs <= MICROSOFT_365_SESSION_IDLE_TTL_MS
      ) {
        session.lastUsedAtMs = Date.now();
        return session.toolsCache.tools;
      }

      const definitions = await session.bridge.listToolDefinitions();
      const filtered = filterMicrosoft365ToolDefinitions(definitions);
      session.toolsCache = {
        fetchedAtMs: Date.now(),
        tools: filtered,
      };
      session.lastUsedAtMs = Date.now();
      return filtered;
    } catch (error) {
      if (session.cacheKey && isAuthenticationError(error)) {
        await this.destroySession(session.cacheKey);
        const retrySession = await this.getSession(context, false);
        try {
          const definitions = await retrySession.bridge.listToolDefinitions();
          const filtered = filterMicrosoft365ToolDefinitions(definitions);
          retrySession.lastUsedAtMs = Date.now();
          retrySession.toolsCache = {
            fetchedAtMs: Date.now(),
            tools: filtered,
          };
          return filtered;
        } finally {
          await this.releaseEphemeralSession(retrySession);
        }
      }
      throw error;
    } finally {
      await this.releaseEphemeralSession(session);
    }
  }

  async executeAllowedTool(
    toolName: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<unknown> {
    const session = await this.getSession(context);
    try {
      const tools = await this.listAvailableTools(context);
      const metadata = getMicrosoft365ToolMetadataFromCatalog(tools, toolName);

      context.emitStage?.(metadata.isMutation ? 'submitting_job' : 'fetching_data', {
        source: 'microsoft_365',
        phase: metadata.isMutation ? 'execute_action' : 'read_data',
        service: metadata.service,
        toolName,
        icon: metadata.service === 'mail' ? 'email' : 'document',
      });

      const result = await session.bridge.executeTool(toolName, args, {
        timeoutMs: MICROSOFT_365_TOOL_TIMEOUT_MS,
        signal: context.signal,
      });

      session.lastUsedAtMs = Date.now();
      if (result.isError) {
        throw new AgentEngineError(
          'MICROSOFT_365_REQUEST_FAILED',
          extractMicrosoft365ErrorMessage(result),
          {
            metadata: { toolName },
          }
        );
      }

      return extractMicrosoft365Payload(result);
    } catch (error) {
      if (session.cacheKey && isAuthenticationError(error)) {
        logger.warn('[Microsoft365MCP] Authentication failure detected, recreating session', {
          userId: context.userId,
          sessionId: context.sessionId,
          toolName,
        });

        await this.destroySession(session.cacheKey);

        const retrySession = await this.getSession(context, false);
        try {
          const retryResult = await retrySession.bridge.executeTool(toolName, args, {
            timeoutMs: MICROSOFT_365_TOOL_TIMEOUT_MS,
            signal: context.signal,
          });

          if (retryResult.isError) {
            throw new AgentEngineError(
              'MICROSOFT_365_REQUEST_FAILED',
              extractMicrosoft365ErrorMessage(retryResult),
              {
                metadata: { toolName, retried: true },
              }
            );
          }

          return extractMicrosoft365Payload(retryResult);
        } finally {
          await this.releaseEphemeralSession(retrySession);
        }
      }

      throw error;
    } finally {
      await this.releaseEphemeralSession(session);
    }
  }

  async shutdown(): Promise<void> {
    await Promise.all(
      [...this.sessions.values()].map(async (session) => {
        await session.bridge.disconnect();
      })
    );
    this.sessions.clear();
  }

  private async getSession(
    context: ToolExecutionContext,
    allowReuse = true
  ): Promise<Microsoft365SessionEntry & { readonly cacheKey: string | null }> {
    this.evictExpiredSessions();

    const cacheKey = this.buildCacheKey(context);
    if (cacheKey && allowReuse) {
      const existing = this.sessions.get(cacheKey);
      if (existing) {
        await this.tokenManager.getValidAccessToken(context);
        existing.lastUsedAtMs = Date.now();
        return { ...existing, cacheKey };
      }
    }

    const { accessToken, email } = await this.tokenManager.getValidAccessToken(context);
    const entry: Microsoft365SessionEntry = {
      bridge: new Microsoft365McpBridgeService(this.endpointUrl, accessToken),
      userId: context.userId,
      microsoftEmail: email,
      environment: context.environment,
      lastUsedAtMs: Date.now(),
    };

    if (cacheKey) {
      if (this.sessions.size >= MICROSOFT_365_MAX_SESSIONS) {
        this.evictOldestSession();
      }
      this.sessions.set(cacheKey, entry);
    }

    return { ...entry, cacheKey };
  }

  private buildCacheKey(context: ToolExecutionContext): string | null {
    if (!context.sessionId) return null;
    const environment =
      context.environment ?? (process.env['NODE_ENV'] === 'staging' ? 'staging' : 'production');
    return `${environment}:${context.userId}:${context.sessionId}`;
  }

  private evictExpiredSessions(): void {
    const now = Date.now();
    for (const [cacheKey, session] of this.sessions.entries()) {
      if (now - session.lastUsedAtMs <= MICROSOFT_365_SESSION_IDLE_TTL_MS) continue;
      this.sessions.delete(cacheKey);
      void session.bridge.disconnect().catch((error) => {
        logger.warn('[Microsoft365MCP] Failed to disconnect expired session', {
          cacheKey,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }

  private evictOldestSession(): void {
    const oldest = [...this.sessions.entries()].sort(
      (left, right) => left[1].lastUsedAtMs - right[1].lastUsedAtMs
    )[0];
    if (!oldest) return;

    const [cacheKey, session] = oldest;
    this.sessions.delete(cacheKey);
    void session.bridge.disconnect().catch((error) => {
      logger.warn('[Microsoft365MCP] Failed to disconnect evicted session', {
        cacheKey,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  private async destroySession(cacheKey: string): Promise<void> {
    const session = this.sessions.get(cacheKey);
    if (!session) return;
    this.sessions.delete(cacheKey);
    await session.bridge.disconnect();
  }

  private async releaseEphemeralSession(
    session: Microsoft365SessionEntry & { readonly cacheKey: string | null }
  ): Promise<void> {
    if (session.cacheKey) return;
    await session.bridge.disconnect();
  }
}
