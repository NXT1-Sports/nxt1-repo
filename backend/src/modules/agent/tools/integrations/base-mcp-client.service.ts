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
import { StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { logger } from '../../../../utils/logger.js';
import { AgentEngineError } from '../../exceptions/agent-engine.error.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Result of an MCP tool call, matching the SDK's CallToolResult shape. */
export interface McpToolCallResult {
  readonly content: ReadonlyArray<{
    readonly type: string;
    readonly text?: string;
    readonly data?: string;
    readonly mimeType?: string;
  }>;
  readonly structuredContent?: Record<string, unknown>;
  readonly isError?: boolean;
}

/** Tool definition exposed by an MCP server via tools/list. */
export interface McpToolDefinition {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema?: Record<string, unknown>;
}

/** Options for a single tool execution. */
export interface McpExecuteOptions {
  /** Per-call timeout in milliseconds. Defaults to 60_000 (1 minute). */
  readonly timeoutMs?: number;
  /** Optional AbortSignal to cancel the call from outside. */
  readonly signal?: AbortSignal;
  /** Whether transport failures may be retried after reconnect. Defaults to true. */
  readonly retryOnTransportError?: boolean;
}

type McpCircuitState = 'closed' | 'open' | 'half-open';

type McpErrorKind =
  | 'cancelled'
  | 'timeout'
  | 'rate_limit'
  | 'client'
  | 'transport'
  | 'server'
  | 'unknown';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum number of reconnection attempts before giving up. */
const MAX_RECONNECT_ATTEMPTS = 3;

/** Base delay (ms) for exponential backoff between reconnect attempts. */
const RECONNECT_BASE_DELAY_MS = 1_000;

/** Default timeout for individual tool calls (60 seconds). */
const DEFAULT_CALL_TIMEOUT_MS = 60_000;

/** Client protocol version advertised during MCP handshake. */
const CLIENT_VERSION = '1.0.0';

/** Number of consecutive dependency failures before the circuit opens. */
const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3;

/** Default time to keep the circuit open after dependency failures. */
const CIRCUIT_BREAKER_DEFAULT_OPEN_MS = 30_000;

/** Default time to keep the circuit open after a 429 rate limit. */
const CIRCUIT_BREAKER_RATE_LIMIT_OPEN_MS = 60_000;

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

  /** Current circuit breaker state for this MCP dependency. */
  private circuitState: McpCircuitState = 'closed';

  /** Number of consecutive dependency failures observed since the last success. */
  private consecutiveFailures = 0;

  /** Epoch time when the circuit entered OPEN state. */
  private circuitOpenedAtMs: number | null = null;

  /** Duration to keep the circuit open before allowing a half-open probe. */
  private circuitOpenDurationMs = CIRCUIT_BREAKER_DEFAULT_OPEN_MS;

  /** Only one half-open probe is allowed at a time. */
  private halfOpenProbeInFlight = false;

  // ── Abstract ──────────────────────────────────────────────────────────

  /**
   * Subclasses return the transport for their specific MCP server.
   * Called once per connection (or on reconnect after a failure).
   *
   * Example: `new StreamableHTTPClientTransport(url, { headers })`
   */
  protected abstract getTransport(): Transport;

  /**
   * Optional hook for transports that can capture server-provided Retry-After data.
   * Subclasses may override this to feed precise rate-limit durations into the breaker.
   */
  protected consumeRateLimitDelayMs(): number | null {
    return null;
  }

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

    try {
      this.assertCircuitAllowsExecution(toolName);

      // Ensure we're connected (lazy init or reconnect)
      await this.ensureConnected();

      logger.info(`[MCP:${this.serverName}] Calling tool "${toolName}"`, {
        argsKeys: Object.keys(args),
        timeoutMs,
      });

      const result = (await this.callWithTimeout(
        toolName,
        args,
        timeoutMs,
        options?.signal
      )) as McpToolCallResult;
      const durationMs = Date.now() - startMs;

      this.recordExecutionSuccess();

      logger.info(`[MCP:${this.serverName}] Tool "${toolName}" completed`, {
        durationMs,
        contentItems: result.content?.length ?? 0,
        isError: result.isError ?? false,
      });

      this.recordTrace(toolName, durationMs, {
        success: true,
        timeoutMs,
        contentItems: result.content?.length ?? 0,
        isError: result.isError ?? false,
      });

      return result;
    } catch (err) {
      const durationMs = Date.now() - startMs;
      const errorKind = this.classifyError(err, options?.signal);
      const retryAfterMs =
        errorKind === 'rate_limit'
          ? (this.consumeRateLimitDelayMs() ?? this.extractRetryAfterMs(err))
          : null;

      if (errorKind === 'cancelled') {
        this.clearHalfOpenProbe();
      } else {
        this.recordExecutionFailure(errorKind, retryAfterMs);
      }

      logger.error(`[MCP:${this.serverName}] Tool "${toolName}" failed`, {
        error: err instanceof Error ? err.message : String(err),
        durationMs,
        errorKind,
        retryAfterMs,
        circuitState: this.circuitState,
      });

      this.recordTrace(toolName, durationMs, {
        success: false,
        timeoutMs,
        errorKind,
        retryAfterMs,
      });

      // If it looks like a retryable dependency failure, try reconnecting once.
      const shouldRetry =
        this.circuitState === 'closed' &&
        options?.retryOnTransportError !== false &&
        this.shouldRetryAfterFailure(errorKind);

      if (shouldRetry) {
        logger.warn(
          `[MCP:${this.serverName}] Dependency failure (${errorKind}) — attempting reconnect`
        );
        await this.reconnectGracefully();

        try {
          const retryResult = (await this.callWithTimeout(
            toolName,
            args,
            timeoutMs,
            options?.signal
          )) as McpToolCallResult;
          const retryDurationMs = Date.now() - startMs;

          this.recordExecutionSuccess();

          logger.info(`[MCP:${this.serverName}] Tool "${toolName}" recovered after reconnect`, {
            durationMs: retryDurationMs,
            contentItems: retryResult.content?.length ?? 0,
            isError: retryResult.isError ?? false,
          });

          this.recordTrace(toolName, retryDurationMs, {
            success: true,
            timeoutMs,
            retryCount: 1,
            contentItems: retryResult.content?.length ?? 0,
            isError: retryResult.isError ?? false,
          });

          return retryResult;
        } catch (retryErr) {
          const retryDurationMs = Date.now() - startMs;
          const retryErrorKind = this.classifyError(retryErr, options?.signal);
          const retryAfterDelayMs =
            retryErrorKind === 'rate_limit'
              ? (this.consumeRateLimitDelayMs() ?? this.extractRetryAfterMs(retryErr))
              : null;

          if (retryErrorKind === 'cancelled') {
            this.clearHalfOpenProbe();
          } else {
            this.recordExecutionFailure(retryErrorKind, retryAfterDelayMs);
          }

          logger.error(`[MCP:${this.serverName}] Tool "${toolName}" retry failed`, {
            error: retryErr instanceof Error ? retryErr.message : String(retryErr),
            durationMs: retryDurationMs,
            errorKind: retryErrorKind,
            retryAfterMs: retryAfterDelayMs,
            circuitState: this.circuitState,
          });

          this.recordTrace(toolName, retryDurationMs, {
            success: false,
            timeoutMs,
            retryCount: 1,
            errorKind: retryErrorKind,
            retryAfterMs: retryAfterDelayMs,
          });

          throw retryErr;
        }
      }

      throw err;
    }
  }

  /**
   * Reconnect without introducing a shared `client = null` window.
   *
   * Why: A hard disconnect followed by connect can create a brief gap where
   * concurrent callers observe no client and fail with "Client is not connected".
   * This method marks the connection unhealthy, establishes a replacement
   * client first, then closes the previous client instance.
   */
  private async reconnectGracefully(): Promise<void> {
    const previousClient = this.client;

    // Force connect() to create a new client even if previous flags were stale.
    this.connected = false;
    await this.connect();

    // Close old client only after replacement is active.
    if (previousClient && previousClient !== this.client) {
      try {
        await previousClient.close();
      } catch (err) {
        logger.warn(`[MCP:${this.serverName}] Error closing previous client after reconnect`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  /**
   * List all tools available on the connected MCP server.
   * Useful for discovery/diagnostics.
   */
  async listToolDefinitions(): Promise<ReadonlyArray<McpToolDefinition>> {
    await this.ensureConnected();
    const result = await this.client!.listTools();
    return result.tools.map((t) => ({
      name: t.name,
      ...(t.description ? { description: t.description } : {}),
      ...(t.inputSchema && typeof t.inputSchema === 'object'
        ? { inputSchema: t.inputSchema as Record<string, unknown> }
        : {}),
    }));
  }

  /**
   * List all tools available on the connected MCP server.
   * Useful for discovery/diagnostics.
   */
  async listTools(): Promise<ReadonlyArray<{ name: string; description?: string }>> {
    const definitions = await this.listToolDefinitions();
    return definitions.map((tool) => ({
      name: tool.name,
      ...(tool.description ? { description: tool.description } : {}),
    }));
  }

  // ── Private Helpers ───────────────────────────────────────────────────

  /**
   * Internal connection logic with exponential backoff.
   *
   * Note: `reconnectAttempts` is reset to 0 at the start of every invocation.
   * Without this reset, a previous fully-exhausted retry cycle would leave the
   * counter at MAX+1, causing the while-loop to be skipped entirely on the next
   * call — returning void silently without setting `this.client`, which then
   * surfaces as the misleading "Client is not connected" error with durationMs: 0.
   */
  private async performConnect(): Promise<void> {
    // Reset counter so every fresh connect() invocation gets a full retry budget.
    this.reconnectAttempts = 0;

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
          throw new AgentEngineError(
            'AGENT_SERVICE_UNAVAILABLE',
            `[MCP:${this.serverName}] Failed to connect after ${MAX_RECONNECT_ATTEMPTS} attempts: ` +
              (err instanceof Error ? err.message : String(err)),
            {
              cause: err,
              metadata: {
                serverName: this.serverName,
                reconnectAttempts: this.reconnectAttempts,
              },
            }
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

    // Defensive invariant check for rare concurrent reconnect/disconnect races.
    // If flags drift (connected=true but client missing), force one clean reconnect.
    if (!this.client) {
      this.connected = false;
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
    // Acquire a stable client reference for this invocation.
    // Another concurrent call may temporarily disconnect/reconnect the shared client.
    let client = this.client;
    if (!client) {
      this.connected = false;
      await this.ensureConnected();
      client = this.client;
    }

    if (!client) {
      throw new AgentEngineError(
        'AGENT_SERVICE_UNAVAILABLE',
        `[MCP:${this.serverName}] Client is not connected`,
        {
          metadata: { serverName: this.serverName },
        }
      );
    }

    // Create a timeout controller
    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), timeoutMs);

    if (externalSignal?.aborted) {
      timeoutController.abort();
      throw new AgentEngineError(
        'AGENT_PIPELINE_FAILED',
        `[MCP:${this.serverName}] Tool "${toolName}" was cancelled before execution`,
        {
          metadata: { serverName: this.serverName, toolName },
        }
      );
    }

    // If the caller provided an external signal, propagate its abort
    const onExternalAbort = () => timeoutController.abort();
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

    try {
      const result = await client.callTool({ name: toolName, arguments: args }, undefined, {
        signal: timeoutController.signal,
        // Align the SDK's internal request timer with our per-operation timeout.
        // Without this, the SDK defaults to 60 s and fires before our AbortSignal
        // for longer operations (e.g. EXTRACT_TIMEOUT_MS = 90 s).
        timeout: timeoutMs,
      });
      return result;
    } catch (err) {
      // Distinguish timeout from other errors
      if (timeoutController.signal.aborted && !externalSignal?.aborted) {
        throw new AgentEngineError(
          'AGENT_PIPELINE_FAILED',
          `[MCP:${this.serverName}] Tool "${toolName}" timed out after ${timeoutMs}ms`,
          {
            cause: err,
            metadata: { serverName: this.serverName, toolName, timeoutMs },
          }
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    }
  }

  /**
   * Gate execution through a lightweight process-local circuit breaker.
   */
  private assertCircuitAllowsExecution(toolName: string): void {
    if (this.circuitState === 'open') {
      const elapsedMs = Date.now() - (this.circuitOpenedAtMs ?? 0);
      if (elapsedMs < this.circuitOpenDurationMs) {
        const retryAfterMs = Math.max(this.circuitOpenDurationMs - elapsedMs, 0);
        throw new AgentEngineError(
          'AGENT_SERVICE_UNAVAILABLE',
          `[MCP:${this.serverName}] Circuit breaker OPEN for "${toolName}". Retry after ${retryAfterMs}ms.`
        );
      }

      this.circuitState = 'half-open';
      this.halfOpenProbeInFlight = false;
      logger.warn(`[MCP:${this.serverName}] Circuit breaker entering HALF_OPEN`, {
        toolName,
      });
    }

    if (this.circuitState === 'half-open') {
      if (this.halfOpenProbeInFlight) {
        throw new AgentEngineError(
          'AGENT_SERVICE_UNAVAILABLE',
          `[MCP:${this.serverName}] Circuit breaker HALF_OPEN for "${toolName}". Probe already in flight.`
        );
      }
      this.halfOpenProbeInFlight = true;
    }
  }

  /**
   * Reset failure counters after a successful MCP exchange.
   */
  private recordExecutionSuccess(): void {
    this.reconnectAttempts = 0;
    this.consecutiveFailures = 0;
    this.circuitState = 'closed';
    this.circuitOpenedAtMs = null;
    this.circuitOpenDurationMs = CIRCUIT_BREAKER_DEFAULT_OPEN_MS;
    this.halfOpenProbeInFlight = false;
  }

  /**
   * Feed a dependency failure into the circuit breaker.
   */
  private recordExecutionFailure(errorKind: McpErrorKind, retryAfterMs: number | null): void {
    this.halfOpenProbeInFlight = false;

    if (!this.countsTowardCircuit(errorKind)) {
      return;
    }

    if (errorKind === 'rate_limit') {
      this.openCircuit(retryAfterMs ?? CIRCUIT_BREAKER_RATE_LIMIT_OPEN_MS, errorKind);
      return;
    }

    if (this.circuitState === 'half-open') {
      this.openCircuit(retryAfterMs ?? CIRCUIT_BREAKER_DEFAULT_OPEN_MS, errorKind);
      return;
    }

    this.consecutiveFailures++;
    if (this.consecutiveFailures >= CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
      this.openCircuit(retryAfterMs ?? CIRCUIT_BREAKER_DEFAULT_OPEN_MS, errorKind);
    }
  }

  /**
   * Transition the dependency circuit into OPEN state.
   */
  private openCircuit(durationMs: number, errorKind: McpErrorKind): void {
    this.circuitState = 'open';
    this.circuitOpenedAtMs = Date.now();
    this.circuitOpenDurationMs = durationMs;
    this.halfOpenProbeInFlight = false;

    logger.warn(`[MCP:${this.serverName}] Circuit breaker OPEN`, {
      errorKind,
      openForMs: durationMs,
      consecutiveFailures: this.consecutiveFailures,
    });
  }

  /**
   * Ensure user cancellations do not leave half-open probes stuck.
   */
  private clearHalfOpenProbe(): void {
    this.halfOpenProbeInFlight = false;
  }

  /**
   * Structured trace logging for MCP latency and failure visibility.
   */
  private recordTrace(
    toolName: string,
    durationMs: number,
    details: {
      success: boolean;
      timeoutMs: number;
      retryCount?: number;
      contentItems?: number;
      isError?: boolean;
      errorKind?: McpErrorKind;
      retryAfterMs?: number | null;
    }
  ): void {
    logger.info('[Performance]', {
      trace: this.getTraceName(toolName),
      duration: `${durationMs}ms`,
      serverName: this.serverName,
      toolName,
      success: details.success,
      timeoutMs: details.timeoutMs,
      retryCount: details.retryCount ?? 0,
      contentItems: details.contentItems ?? 0,
      isError: details.isError ?? false,
      errorKind: details.errorKind,
      retryAfterMs: details.retryAfterMs ?? undefined,
      circuitState: this.circuitState,
    });
  }

  /**
   * Build a stable backend trace name for this MCP tool call.
   */
  private getTraceName(toolName: string): string {
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    return `backend_mcp_${normalize(this.serverName)}_${normalize(toolName)}`;
  }

  /**
   * Identify the failure class so retries and breaker behavior stay safe.
   */
  private classifyError(err: unknown, externalSignal?: AbortSignal): McpErrorKind {
    if (externalSignal?.aborted || this.isAbortError(err)) {
      return 'cancelled';
    }

    if (this.isRateLimitError(err)) {
      return 'rate_limit';
    }

    if (this.isClientError(err)) {
      return 'client';
    }

    if (this.isTimeoutError(err)) {
      return 'timeout';
    }

    if (this.isServerError(err)) {
      return 'server';
    }

    if (this.isTransportError(err)) {
      return 'transport';
    }

    return 'unknown';
  }

  /**
   * Only external dependency failures should affect the breaker.
   */
  private countsTowardCircuit(errorKind: McpErrorKind): boolean {
    return ['timeout', 'rate_limit', 'transport', 'server'].includes(errorKind);
  }

  /**
   * Retry only safe, retryable dependency failures.
   *
   * NOTE: `timeout` is intentionally excluded. A timeout means the remote
   * service is slow/overloaded — reconnecting does not help and doubles the
   * user-visible wait time. Only broken-transport and server-crash errors
   * benefit from a reconnect+retry.
   */
  private shouldRetryAfterFailure(errorKind: McpErrorKind): boolean {
    return ['transport', 'server'].includes(errorKind);
  }

  /**
   * Extract server-provided retry delay hints when available.
   */
  private extractRetryAfterMs(err: unknown): number | null {
    if (!(err instanceof Error)) return null;

    const record = err as Error & {
      retryAfterMs?: unknown;
      retryAfter?: unknown;
      cause?: unknown;
    };

    if (typeof record.retryAfterMs === 'number' && record.retryAfterMs > 0) {
      return record.retryAfterMs;
    }

    if (typeof record.retryAfter === 'number' && record.retryAfter > 0) {
      return record.retryAfter * 1_000;
    }

    const match = err.message.match(/retry after (\d+)(ms|s)/i);
    if (match) {
      const value = Number(match[1]);
      return match[2].toLowerCase() === 's' ? value * 1_000 : value;
    }

    return null;
  }

  /**
   * Abort errors come from explicit cancellation, not dependency health.
   */
  private isAbortError(err: unknown): boolean {
    return err instanceof Error && err.name === 'AbortError';
  }

  /**
   * Distinguish timeout errors thrown by callWithTimeout.
   */
  private isTimeoutError(err: unknown): boolean {
    return err instanceof Error && err.message.toLowerCase().includes('timed out');
  }

  /**
   * Detect HTTP 429 responses or equivalent rate-limit messages.
   */
  private isRateLimitError(err: unknown): boolean {
    if (err instanceof StreamableHTTPError) {
      return err.code === 429;
    }

    if (!(err instanceof Error)) return false;
    const msg = err.message.toLowerCase();
    return msg.includes('429') || msg.includes('too many requests') || msg.includes('rate limit');
  }

  /**
   * Detect non-rate-limit 4xx responses that should not trip retries or the breaker.
   */
  private isClientError(err: unknown): boolean {
    return (
      err instanceof StreamableHTTPError &&
      typeof err.code === 'number' &&
      err.code >= 400 &&
      err.code < 500 &&
      err.code !== 429
    );
  }

  /**
   * Detect server-side dependency failures returned over HTTP.
   */
  private isServerError(err: unknown): boolean {
    return err instanceof StreamableHTTPError && typeof err.code === 'number' && err.code >= 500;
  }

  /**
   * Heuristic: is this error caused by a broken transport/network connection?
   */
  private isTransportError(err: unknown): boolean {
    if (err instanceof StreamableHTTPError) {
      if (typeof err.code === 'number') {
        return err.code >= 500 || err.code < 0;
      }
      return true;
    }

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
      msg.includes('stream')
    );
  }
}
