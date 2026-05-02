import type { ToolExecutionContext } from '../../base.tool.js';
import axios from 'axios';
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
import { resolveGoogleWorkspaceMcpUrl } from './google-workspace-env.js';
import {
  renderRichContentAsDocumentText,
  renderRichContentAsEmailHtml,
} from '../../../../../services/communications/rich-content-formatting.js';
import {
  buildGoogleDocsRichFormattingPlan,
  shouldUseGoogleDocsRichFormatting,
} from './google-docs-rich-formatting.js';

const GOOGLE_WORKSPACE_TOOL_TIMEOUT_MS = 90_000;
const GOOGLE_WORKSPACE_SESSION_IDLE_TTL_MS = 2 * 60 * 1_000;
const GOOGLE_WORKSPACE_MAX_SESSIONS = 100;

interface GoogleWorkspaceSessionEntry {
  readonly bridge: GoogleWorkspaceMcpBridgeService;
  readonly userId: string;
  googleEmail: string;
  accessToken: string;
  readonly environment: ToolExecutionContext['environment'];
  lastUsedAtMs: number;
}

function isAuthenticationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /401|403|unauthorized|forbidden|invalid token|bearer/i.test(message.toLowerCase());
}

export class GoogleWorkspaceMcpSessionService {
  private readonly sessions = new Map<string, GoogleWorkspaceSessionEntry>();
  private readonly endpointUrl: string;

  constructor(
    private readonly tokenManager: GoogleWorkspaceTokenManagerService = new GoogleWorkspaceTokenManagerService(),
    endpointUrl = resolveGoogleWorkspaceMcpUrl()
  ) {
    if (!endpointUrl) {
      throw new AgentEngineError(
        'GOOGLE_WORKSPACE_CONFIG_INVALID',
        'GOOGLE_WORKSPACE_MCP_URL is required in production before Google Workspace MCP tools can be enabled.'
      );
    }
    if (!endpointUrl.startsWith('http://') && !endpointUrl.startsWith('https://')) {
      throw new AgentEngineError(
        'GOOGLE_WORKSPACE_CONFIG_INVALID',
        'GOOGLE_WORKSPACE_MCP_URL must be an absolute http(s) URL.'
      );
    }
    this.endpointUrl = endpointUrl;
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
    if (this.isRichDocsTextMutation(toolName, args)) {
      try {
        const data = await this.executeRichDocsTextMutation(toolName, args, session);
        session.lastUsedAtMs = Date.now();
        return data;
      } finally {
        await this.releaseEphemeralSession(session);
      }
    }

    const preparedArgs = this.prepareToolArguments(toolName, args);
    const enrichedArgs = this.injectGoogleEmail(preparedArgs, session.googleEmail);
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
        const retryEnrichedArgs = this.injectGoogleEmail(preparedArgs, retrySession.googleEmail);
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
        const refreshed = await this.tokenManager.getValidAccessToken(context);
        existing.accessToken = refreshed.accessToken;
        existing.googleEmail = refreshed.email;
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
      accessToken,
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

  private prepareToolArguments(
    toolName: string,
    args: Record<string, unknown>
  ): Record<string, unknown> {
    if (toolName === 'gmail_send_email' || toolName === 'create_gmail_draft') {
      if (typeof args['body'] !== 'string') return args;
      return { ...args, body: renderRichContentAsEmailHtml(args['body']) };
    }

    if (toolName === 'gmail_reply_to_email') {
      if (typeof args['reply_body'] !== 'string') return args;
      return { ...args, reply_body: renderRichContentAsEmailHtml(args['reply_body']) };
    }

    if (
      toolName === 'docs_append_text' ||
      toolName === 'docs_prepend_text' ||
      toolName === 'docs_insert_text'
    ) {
      if (typeof args['text'] !== 'string') return args;
      return { ...args, text: renderRichContentAsDocumentText(args['text']) };
    }

    return args;
  }

  private isRichDocsTextMutation(toolName: string, args: Record<string, unknown>): boolean {
    if (
      toolName !== 'docs_append_text' &&
      toolName !== 'docs_prepend_text' &&
      toolName !== 'docs_insert_text'
    ) {
      return false;
    }

    return typeof args['text'] === 'string' && shouldUseGoogleDocsRichFormatting(args['text']);
  }

  private async executeRichDocsTextMutation(
    toolName: string,
    args: Record<string, unknown>,
    session: GoogleWorkspaceSessionEntry & { readonly cacheKey: string | null }
  ): Promise<unknown> {
    const documentId = typeof args['document_id'] === 'string' ? args['document_id'].trim() : '';
    const text = typeof args['text'] === 'string' ? args['text'] : '';
    if (!documentId || !text) {
      throw new AgentEngineError(
        'GOOGLE_WORKSPACE_REQUEST_FAILED',
        'Google Docs rich formatting requires a document_id and text.'
      );
    }

    const documentState = await this.getGoogleDocumentState(documentId, session.accessToken);
    const insertionIndex =
      toolName === 'docs_prepend_text'
        ? 1
        : toolName === 'docs_insert_text' && typeof args['index'] === 'number'
          ? args['index']
          : documentState.endIndex;

    const plan = buildGoogleDocsRichFormattingPlan(text, insertionIndex, {
      preferDocumentHeaderStyles: toolName === 'docs_append_text' && documentState.isEmpty,
    });

    if (!plan) {
      const fallbackText = renderRichContentAsDocumentText(text);
      const fallbackArgs = this.injectGoogleEmail(
        { ...args, text: fallbackText },
        session.googleEmail
      );
      const result = await session.bridge.executeTool(toolName, fallbackArgs, {
        timeoutMs: GOOGLE_WORKSPACE_TOOL_TIMEOUT_MS,
      });
      if (result.isError) {
        throw new AgentEngineError(
          'GOOGLE_WORKSPACE_REQUEST_FAILED',
          extractGoogleWorkspaceErrorMessage(result),
          {
            metadata: { toolName, documentId, richFormattingFallback: true },
          }
        );
      }
      return extractGoogleWorkspacePayload(result);
    }

    await axios.post(
      `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`,
      { requests: plan.requests },
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: GOOGLE_WORKSPACE_TOOL_TIMEOUT_MS,
      }
    );

    return {
      documentId,
      operation: toolName,
      insertedTextLength: plan.insertText.length,
      styledBlockCount: plan.styledBlockCount,
      formattingApplied: true,
    };
  }

  private async getGoogleDocumentState(
    documentId: string,
    accessToken: string
  ): Promise<{ endIndex: number; isEmpty: boolean }> {
    const response = await axios.get(
      `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        params: {
          fields: 'body/content/endIndex',
        },
        timeout: GOOGLE_WORKSPACE_TOOL_TIMEOUT_MS,
      }
    );

    const content = Array.isArray(response.data?.body?.content)
      ? (response.data.body.content as Array<{ endIndex?: unknown; startIndex?: unknown }>)
      : [];
    const lastEndIndex = content.length > 0 ? content[content.length - 1]?.endIndex : null;
    const endIndex = typeof lastEndIndex === 'number' && lastEndIndex > 1 ? lastEndIndex - 1 : 1;
    return { endIndex, isEmpty: endIndex <= 1 };
  }
}
