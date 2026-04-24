import type { ToolExecutionContext } from '../../base.tool.js';
import { logger } from '../../../../../utils/logger.js';
import { GoogleWorkspaceMcpBridgeService } from './google-workspace-mcp-bridge.service.js';
import { GoogleWorkspaceTokenManagerService } from './google-workspace-token-manager.service.js';
import {
  extractGoogleWorkspaceErrorMessage,
  extractGoogleWorkspacePayload,
  filterGoogleWorkspaceToolDefinitions,
  isGoogleWorkspaceAllowedToolName,
} from './shared.js';
import { AgentEngineError } from '../../../exceptions/agent-engine.error.js';

const GOOGLE_WORKSPACE_TOOL_TIMEOUT_MS = 90_000;
const GOOGLE_WORKSPACE_SESSION_IDLE_TTL_MS = 2 * 60 * 1_000;
const GOOGLE_WORKSPACE_MAX_SESSIONS = 100;
const GOOGLE_WORKSPACE_MCP_DEFAULT_URL = 'http://127.0.0.1:8000/mcp';

interface GoogleWorkspaceSessionEntry {
  readonly bridge: GoogleWorkspaceMcpBridgeService;
  readonly userId: string;
  readonly googleEmail: string;
  readonly environment: ToolExecutionContext['environment'];
  lastUsedAtMs: number;
}

function isAuthenticationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /401|403|unauthorized|forbidden|invalid token|bearer/i.test(message.toLowerCase());
}

function normalizeGoogleWorkspaceMcpUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

export class GoogleWorkspaceMcpSessionService {
  private readonly sessions = new Map<string, GoogleWorkspaceSessionEntry>();
  private readonly endpointUrl: string;

  constructor(
    private readonly tokenManager: GoogleWorkspaceTokenManagerService = new GoogleWorkspaceTokenManagerService(),
    endpointUrl = process.env['GOOGLE_WORKSPACE_MCP_URL'] ??
      (process.env['NODE_ENV'] === 'production' ? '' : GOOGLE_WORKSPACE_MCP_DEFAULT_URL)
  ) {
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
    this.endpointUrl = normalized;
  }

  async listAllowedTools(
    context: ToolExecutionContext
  ): Promise<ReturnType<typeof filterGoogleWorkspaceToolDefinitions>> {
    const session = await this.getSession(context);
    try {
      const definitions = await session.bridge.listToolDefinitions();
      session.lastUsedAtMs = Date.now();
      return filterGoogleWorkspaceToolDefinitions(definitions);
    } catch (error) {
      if (session.cacheKey && isAuthenticationError(error)) {
        await this.destroySession(session.cacheKey);
        const retrySession = await this.getSession(context, false);
        try {
          const definitions = await retrySession.bridge.listToolDefinitions();
          retrySession.lastUsedAtMs = Date.now();
          return filterGoogleWorkspaceToolDefinitions(definitions);
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
    if (!isGoogleWorkspaceAllowedToolName(toolName)) {
      throw new AgentEngineError(
        'AGENT_TOOL_NOT_ALLOWED',
        `Google Workspace tool "${toolName}" is not allowed in Agent X.`,
        {
          metadata: { toolName },
        }
      );
    }

    const session = await this.getSession(context);
    const enrichedArgs = this.injectGoogleEmail(args, session.googleEmail);
    try {
      const result = await session.bridge.executeTool(toolName, enrichedArgs, {
        timeoutMs: GOOGLE_WORKSPACE_TOOL_TIMEOUT_MS,
        signal: context.signal,
      });
      session.lastUsedAtMs = Date.now();
      if (result.isError) {
        throw new AgentEngineError(
          'GOOGLE_WORKSPACE_REQUEST_FAILED',
          extractGoogleWorkspaceErrorMessage(result),
          {
            metadata: { toolName },
          }
        );
      }
      return extractGoogleWorkspacePayload(result);
    } catch (error) {
      if (session.cacheKey && isAuthenticationError(error)) {
        logger.warn('[GoogleWorkspaceMCP] Authentication failure detected, recreating session', {
          userId: context.userId,
          sessionId: context.sessionId,
          toolName,
        });
        await this.destroySession(session.cacheKey);
        const retrySession = await this.getSession(context, false);
        const retryEnrichedArgs = this.injectGoogleEmail(args, retrySession.googleEmail);
        try {
          const retryResult = await retrySession.bridge.executeTool(toolName, retryEnrichedArgs, {
            timeoutMs: GOOGLE_WORKSPACE_TOOL_TIMEOUT_MS,
            signal: context.signal,
          });
          retrySession.lastUsedAtMs = Date.now();
          if (retryResult.isError) {
            throw new AgentEngineError(
              'GOOGLE_WORKSPACE_REQUEST_FAILED',
              extractGoogleWorkspaceErrorMessage(retryResult),
              {
                cause: error,
                metadata: { toolName, retried: true },
              }
            );
          }
          return extractGoogleWorkspacePayload(retryResult);
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
  ): Promise<GoogleWorkspaceSessionEntry & { readonly cacheKey: string | null }> {
    this.evictExpiredSessions();

    const cacheKey = this.buildCacheKey(context);
    if (cacheKey && allowReuse) {
      const existing = this.sessions.get(cacheKey);
      if (existing) {
        // The Python workspace-mcp reads credentials from a GCS-backed file on
        // every call. If we skip the token manager here, the bucket file goes
        // stale and Python re-emits the OAuth authorization link even though
        // the backend has a valid refresh token. Always re-run the token
        // manager on reuse so the bucket file stays fresh.
        await this.tokenManager.getValidAccessToken(context);
        existing.lastUsedAtMs = Date.now();
        return { ...existing, cacheKey };
      }
    }

    context.emitStage?.('checking_status', {
      source: 'google_workspace',
      phase: 'connect_session',
      icon: 'document',
    });
    const { accessToken, email } = await this.tokenManager.getValidAccessToken(context);
    const entry: GoogleWorkspaceSessionEntry = {
      bridge: new GoogleWorkspaceMcpBridgeService(this.endpointUrl, accessToken),
      userId: context.userId,
      googleEmail: email,
      environment: context.environment,
      lastUsedAtMs: Date.now(),
    };

    if (cacheKey) {
      if (this.sessions.size >= GOOGLE_WORKSPACE_MAX_SESSIONS) {
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
      if (now - session.lastUsedAtMs <= GOOGLE_WORKSPACE_SESSION_IDLE_TTL_MS) continue;
      this.sessions.delete(cacheKey);
      void session.bridge.disconnect().catch((error) => {
        logger.warn('[GoogleWorkspaceMCP] Failed to disconnect expired session', {
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
      logger.warn('[GoogleWorkspaceMCP] Failed to disconnect evicted session', {
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
    session: GoogleWorkspaceSessionEntry & { readonly cacheKey: string | null }
  ): Promise<void> {
    if (session.cacheKey) return;
    await session.bridge.disconnect();
  }

  /**
   * Auto-inject user_google_email into MCP tool arguments.
   * The MCP server expects this parameter for all tools; we resolve it
   * from the stored OAuth token so the LLM never needs to know it.
   */
  private injectGoogleEmail(
    args: Record<string, unknown>,
    googleEmail: string
  ): Record<string, unknown> {
    if (!googleEmail || 'user_google_email' in args) return args;
    return { user_google_email: googleEmail, ...args };
  }
}
