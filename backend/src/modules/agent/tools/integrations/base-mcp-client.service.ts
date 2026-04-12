/**
 * @fileoverview Base MCP Client Service — Universal MCP Server Integration Foundation
 * @module @nxt1/backend/modules/agent/tools/integrations
 *
 * Transport-agnostic abstract class for connecting to any remote MCP server
 * (Apify, Stripe, GitHub, Notion, etc.) over the Model Context Protocol.
 *
 * Production-grade features:
 * - **Lazy connection:** First `executeTool()` call triggers `connect()`.
 * - **Concurrency lock:** Prevents duplicate connections during parallel tool calls.
 * - **Exponential backoff:** Auto-reconnects on transient failures (up to 3 retries).
 * - **Per-call timeouts:** Wraps every `callTool()` in an AbortSignal deadline.
 * - **Structured logging:** Connection lifecycle, call durations, and errors.
 *
 * Subclasses implement `getTransport()` to return the appropriate transport
 * (StreamableHTTP, SSE, etc.) for a specific MCP server.
 *
 * @example
 * ```ts
 * class StripeMcpService extends BaseMcpClientService {
 *   readonly serverName = 'stripe';
 *   protected getTransport() {
 *     return new StreamableHTTPClientTransport(new URL('https://mcp.stripe.com'), { ... });
 *   }
 * }
 * ```
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { logger } from '../../../../utils/logger.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Result of an MCP tool call, matching the SDK's CallToolResult shape. */
export interface McpToolCallResult {
  readonly content: ReadonlyArray<{
    readonly type: string;
    readonly text?: string;
    readonly data?: string;
    readonly mimeType?: string;
  }>;
  readonly isError?: boolean;
}

/** Options for a single tool execution. */
export interface McpExecuteOptions {
  /** Per-call timeout in milliseconds. Defaults to 60_000 (1 minute). */
  readonly timeoutMs?: number;
  /** Optional AbortSignal to cancel the call from outside. */
  readonly signal?: AbortSignal;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum number of reconnection attempts before giving up. */
const MAX_RECONNECT_ATTEMPTS = 3;

/** Base delay (ms) for exponential backoff between reconnect attempts. */
const RECONNECT_BASE_DELAY_MS = 1_000;

/** Default timeout for individual tool calls (60 seconds). */
const DEFAULT_CALL_TIMEOUT_MS = 60_000;

/** Client protocol version advertised during MCP handshake. */
const CLIENT_VERSION = '1.0.0';

// ─── Abstract Base ──────────────────────────────────────────────────────────

export abstract class BaseMcpClientService {
  /**
   * Human-readable server name for logging/diagnostics.
   * Subclasses set this to identify which MCP server they connect to.
   */
  abstract readonly serverName: string;

  /** The active MCP SDK client instance (null until first connection). */
  private client: Client | null = null;

  /** Whether we currently have an active, healthy connection. */
  private connected = false;

  /**
   * Connection lock: resolves when the in-flight `connect()` call finishes.
   * Prevents N concurrent tool calls from each spawning a connection.
   */
  private connectingPromise: Promise<void> | null = null;

  /** Number of consecutive reconnect failures (reset on success). */
  private reconnectAttempts = 0;

  // ── Abstract ──────────────────────────────────────────────────────────

  /**
   * Subclasses return the transport for their specific MCP server.
   * Called once per connection (or on reconnect after a failure).
   *
   * Example: `new StreamableHTTPClientTransport(url, { headers })`
   */
  protected abstract getTransport(): Transport;

  // ── Connection Lifecycle ──────────────────────────────────────────────

  /**
   * Establish a connection to the MCP server. Lazy — only called on demand.
   * If a connection attempt is already in flight, subsequent callers await it.
   */
  async connect(): Promise<void> {
    // Already healthy — nothing to do
    if (this.connected && this.client) return;

    // Another caller is already connecting — wait for it
    if (this.connectingPromise) {
      await this.connectingPromise;
      return;
    }

    // Acquire the lock
    this.connectingPromise = this.performConnect();
    try {
      await this.connectingPromise;
    } finally {
      this.connectingPromise = null;
    }
  }

  /**
   * Gracefully close the MCP connection and release resources.
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch (err) {
        logger.warn(`[MCP:${this.serverName}] Error during disconnect`, { error: err });
      }
      this.client = null;
      this.connected = false;
      logger.info(`[MCP:${this.serverName}] Disconnected`);
    }
  }

  // ── Tool Execution ────────────────────────────────────────────────────

  /**
   * Execute an MCP tool by name with the given arguments.
   *
   * Handles:
   * - Lazy connection (first call triggers connect).
   * - Per-call timeout via AbortSignal.
   * - Automatic reconnection on transport failure (up to MAX_RECONNECT_ATTEMPTS).
   *
   * @param toolName - The MCP tool name exactly as registered on the server.
   * @param args - JSON-serializable arguments for the tool.
   * @param options - Timeout and signal overrides.
   * @returns The structured MCP tool call result.
   */
  async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    options?: McpExecuteOptions
  ): Promise<McpToolCallResult> {
    const startMs = Date.now();
    const timeoutMs = options?.timeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;

    // Ensure we're connected (lazy init or reconnect)
    await this.ensureConnected();

    logger.info(`[MCP:${this.serverName}] Calling tool "${toolName}"`, {
      argsKeys: Object.keys(args),
      timeoutMs,
    });

    try {
      const result = (await this.callWithTimeout(
        toolName,
        args,
        timeoutMs,
        options?.signal
      )) as McpToolCallResult;
      const durationMs = Date.now() - startMs;

      logger.info(`[MCP:${this.serverName}] Tool "${toolName}" completed`, {
        durationMs,
        contentItems: result.content?.length ?? 0,
        isError: result.isError ?? false,
      });

      // Reset reconnect counter on success
      this.reconnectAttempts = 0;

      return result;
    } catch (err) {
      const durationMs = Date.now() - startMs;
      logger.error(`[MCP:${this.serverName}] Tool "${toolName}" failed`, {
        error: err instanceof Error ? err.message : String(err),
        durationMs,
      });

      // If it looks like a connection/transport error, try reconnecting once
      if (this.isTransportError(err)) {
        logger.warn(`[MCP:${this.serverName}] Transport error detected — attempting reconnect`);
        this.connected = false;
        await this.ensureConnected();
        // Single retry after reconnect
        return (await this.callWithTimeout(
          toolName,
          args,
          timeoutMs,
          options?.signal
        )) as McpToolCallResult;
      }

      throw err;
    }
  }

  /**
   * List all tools available on the connected MCP server.
   * Useful for discovery/diagnostics.
   */
  async listTools(): Promise<ReadonlyArray<{ name: string; description?: string }>> {
    await this.ensureConnected();
    const result = await this.client!.listTools();
    return result.tools.map((t) => ({ name: t.name, description: t.description }));
  }

  // ── Private Helpers ───────────────────────────────────────────────────

  /**
   * Internal connection logic with exponential backoff.
   */
  private async performConnect(): Promise<void> {
    while (this.reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
      try {
        const transport = this.getTransport();
        const client = new Client(
          { name: `nxt1-${this.serverName}`, version: CLIENT_VERSION },
          { capabilities: {} }
        );

        await client.connect(transport);

        this.client = client;
        this.connected = true;
        this.reconnectAttempts = 0;

        logger.info(`[MCP:${this.serverName}] Connected successfully`);
        return;
      } catch (err) {
        this.reconnectAttempts++;
        const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1);

        logger.warn(
          `[MCP:${this.serverName}] Connection attempt ${this.reconnectAttempts} failed`,
          {
            error: err instanceof Error ? err.message : String(err),
            nextRetryMs: this.reconnectAttempts <= MAX_RECONNECT_ATTEMPTS ? delay : null,
          }
        );

        if (this.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
          throw new Error(
            `[MCP:${this.serverName}] Failed to connect after ${MAX_RECONNECT_ATTEMPTS} attempts: ` +
              (err instanceof Error ? err.message : String(err)),
            { cause: err }
          );
        }

        // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Guarantee an active connection, triggering (re)connect if needed.
   */
  private async ensureConnected(): Promise<void> {
    if (!this.connected || !this.client) {
      await this.connect();
    }
  }

  /**
   * Call an MCP tool with an AbortSignal-based timeout.
   */
  private async callWithTimeout(
    toolName: string,
    args: Record<string, unknown>,
    timeoutMs: number,
    externalSignal?: AbortSignal
  ): Promise<unknown> {
    if (!this.client) {
      throw new Error(`[MCP:${this.serverName}] Client is not connected`);
    }

    // Create a timeout controller
    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), timeoutMs);

    // If the caller provided an external signal, propagate its abort
    const onExternalAbort = () => timeoutController.abort();
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

    try {
      const result = await this.client.callTool({ name: toolName, arguments: args }, undefined, {
        signal: timeoutController.signal,
      });
      return result;
    } catch (err) {
      // Distinguish timeout from other errors
      if (timeoutController.signal.aborted && !externalSignal?.aborted) {
        throw new Error(
          `[MCP:${this.serverName}] Tool "${toolName}" timed out after ${timeoutMs}ms`,
          { cause: err }
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    }
  }

  /**
   * Heuristic: is this error caused by a broken transport/network connection?
   */
  private isTransportError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    const msg = err.message.toLowerCase();
    return (
      msg.includes('transport') ||
      msg.includes('connection') ||
      msg.includes('econnrefused') ||
      msg.includes('econnreset') ||
      msg.includes('socket') ||
      msg.includes('network') ||
      msg.includes('fetch failed') ||
      msg.includes('stream') ||
      err.name === 'AbortError'
    );
  }
}
