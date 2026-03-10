/**
 * @fileoverview OpenRouter LLM Service
 * @module @nxt1/backend/modules/agent/llm
 *
 * Production-grade wrapper over the OpenRouter Chat Completions API.
 * This is the SOLE point of contact between the Agent X engine and any LLM.
 *
 * Responsibilities:
 * - Resolves model tier → concrete model slug.
 * - Formats messages and tool schemas for the OpenRouter API.
 * - Parses responses, extracts tool calls, and normalises the result.
 * - Tracks token usage, latency, and estimated cost for telemetry.
 * - Implements retry with exponential backoff for transient failures.
 *
 * Security:
 * - API key read from process.env.OPENROUTER_API_KEY (never hardcoded).
 * - Input sanitisation handled upstream by guardrails (this layer trusts the caller).
 *
 * @example
 * ```ts
 * const llm = new OpenRouterService();
 * const result = await llm.complete(messages, {
 *   tier: 'balanced',
 *   maxTokens: 2048,
 *   temperature: 0.7,
 * });
 * console.log(result.content);
 * ```
 */

import type {
  LLMMessage,
  LLMCompletionOptions,
  LLMCompletionResult,
  LLMToolCall,
  LLMTelemetryCallback,
} from './llm.types.js';
import { MODEL_CATALOGUE } from './llm.types.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_500;

/** Status codes that are safe to retry on. */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

// ─── Service ────────────────────────────────────────────────────────────────

export class OpenRouterService {
  private readonly apiKey: string;
  private readonly siteUrl: string;
  private readonly siteName: string;
  private readonly telemetryCallback?: LLMTelemetryCallback;

  constructor(options?: { onTelemetry?: LLMTelemetryCallback }) {
    const apiKey = process.env['OPENROUTER_API_KEY'];
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is not set. Add it to your .env file.');
    }
    this.apiKey = apiKey;
    this.siteUrl = process.env['OPENROUTER_SITE_URL'] ?? 'https://nxt1.com';
    this.siteName = process.env['OPENROUTER_SITE_NAME'] ?? 'NXT1 Sports';
    this.telemetryCallback = options?.onTelemetry;
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  /**
   * Send a chat completion request to OpenRouter.
   *
   * @param messages - The conversation history (system + user + assistant + tool messages).
   * @param options  - Model tier, temperature, max tokens, tool schemas, etc.
   * @returns Parsed completion result with content, tool calls, and telemetry data.
   */
  async complete(
    messages: readonly LLMMessage[],
    options: LLMCompletionOptions
  ): Promise<LLMCompletionResult> {
    const model = options.modelOverride ?? MODEL_CATALOGUE[options.tier];
    const startMs = Date.now();

    const body = this.buildRequestBody(messages, model, options);
    const raw = await this.fetchWithRetry(body, options.signal);
    const latencyMs = Date.now() - startMs;

    const result = this.parseResponse(raw, model, latencyMs);

    // Emit telemetry if a callback is registered
    this.telemetryCallback?.({
      operationId: options.telemetryContext?.operationId ?? '',
      userId: options.telemetryContext?.userId ?? '',
      agentId: options.telemetryContext?.agentId ?? 'router',
      model: result.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      costUsd: result.costUsd,
      latencyMs: result.latencyMs,
      hadToolCall: result.toolCalls.length > 0,
      timestamp: new Date().toISOString(),
    });

    return result;
  }

  /**
   * Convenience: Send a single system + user prompt and get text back.
   * Used for structured JSON extraction (planning, classification, etc.).
   */
  async prompt(
    systemPrompt: string,
    userMessage: string,
    options: Omit<LLMCompletionOptions, 'tools'>
  ): Promise<LLMCompletionResult> {
    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];
    return this.complete(messages, options);
  }

  // ─── Request Builder ────────────────────────────────────────────────────

  private buildRequestBody(
    messages: readonly LLMMessage[],
    model: string,
    options: LLMCompletionOptions
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model,
      messages: messages.map((m) => this.serializeMessage(m)),
      max_tokens: options.maxTokens ?? 2048,
      temperature: options.temperature ?? 0.7,
    };

    if (options.tools?.length) {
      body['tools'] = options.tools;
      body['tool_choice'] = 'auto';
    }

    if (options.jsonMode) {
      body['response_format'] = { type: 'json_object' };
    }

    return body;
  }

  /**
   * Serialise an LLMMessage into the shape OpenRouter expects.
   * Strips undefined fields so the API doesn't reject the payload.
   */
  private serializeMessage(msg: LLMMessage): Record<string, unknown> {
    const out: Record<string, unknown> = {
      role: msg.role,
      content: msg.content,
    };
    if (msg.tool_calls?.length) out['tool_calls'] = msg.tool_calls;
    if (msg.tool_call_id) out['tool_call_id'] = msg.tool_call_id;
    return out;
  }

  // ─── HTTP Layer (Retry + Timeout) ───────────────────────────────────────

  private async fetchWithRetry(
    body: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<OpenRouterRawResponse> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.fetchOnce(body, signal);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Abort-first: do not retry user-initiated or external cancellations
        if (signal?.aborted) throw lastError;
        if (!this.isRetryable(lastError)) throw lastError;

        // Exponential backoff
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    throw lastError ?? new Error('OpenRouter request failed after retries');
  }

  private async fetchOnce(
    body: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<OpenRouterRawResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    // Merge external abort signal with our timeout
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort);

    try {
      const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'HTTP-Referer': this.siteUrl,
          'X-Title': this.siteName,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unknown error');
        const err = new OpenRouterError(
          `OpenRouter API error ${response.status}: ${errorBody}`,
          response.status
        );
        throw err;
      }

      return (await response.json()) as OpenRouterRawResponse;
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  private isRetryable(error: Error): boolean {
    if (error instanceof OpenRouterError) {
      return RETRYABLE_STATUS_CODES.has(error.status);
    }
    // Only retry genuine network failures (not user/external aborts)
    if (error.name === 'AbortError') return false;
    return error.message.includes('fetch failed');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ─── Response Parser ────────────────────────────────────────────────────

  private parseResponse(
    raw: OpenRouterRawResponse,
    requestedModel: string,
    latencyMs: number
  ): LLMCompletionResult {
    const choice = raw.choices?.[0];
    if (!choice) {
      throw new Error('OpenRouter returned no choices.');
    }

    const message = choice.message;
    const content = message?.content ?? null;

    // Extract tool calls (normalise to our internal shape)
    const toolCalls: LLMToolCall[] = (message?.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      type: 'function' as const,
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
    }));

    const inputTokens = raw.usage?.prompt_tokens ?? 0;
    const outputTokens = raw.usage?.completion_tokens ?? 0;

    return {
      content,
      toolCalls,
      model: raw.model ?? requestedModel,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      latencyMs,
      costUsd: this.estimateCost(requestedModel, inputTokens, outputTokens),
      finishReason: choice.finish_reason ?? 'unknown',
    };
  }

  // ─── Cost Estimation ────────────────────────────────────────────────────

  /**
   * Rough cost estimation based on known OpenRouter pricing.
   * These are approximate — actual billing comes from the OpenRouter dashboard.
   */
  private estimateCost(model: string, inputTokens: number, outputTokens: number): number {
    // Pricing per 1M tokens (input / output) — update as prices change
    const pricing: Record<string, [number, number]> = {
      'anthropic/claude-3.5-haiku': [0.8, 4.0],
      'anthropic/claude-3.5-sonnet': [3.0, 15.0],
      'openai/gpt-4o': [2.5, 10.0],
      'openai/gpt-4o-mini': [0.15, 0.6],
    };

    const [inputRate, outputRate] = pricing[model] ?? [3.0, 15.0];
    return (inputTokens * inputRate + outputTokens * outputRate) / 1_000_000;
  }
}

// ─── Error Class ──────────────────────────────────────────────────────────

export class OpenRouterError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'OpenRouterError';
  }
}

// ─── OpenRouter Raw Response Shape ──────────────────────────────────────────

/** The raw JSON shape returned by the OpenRouter /chat/completions endpoint. */
interface OpenRouterRawResponse {
  readonly id?: string;
  readonly model?: string;
  readonly choices?: readonly {
    readonly index: number;
    readonly message?: {
      readonly role: string;
      readonly content: string | null;
      readonly tool_calls?: readonly {
        readonly id: string;
        readonly type: string;
        readonly function: {
          readonly name: string;
          readonly arguments: string;
        };
      }[];
    };
    readonly finish_reason?: string;
  }[];
  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
    readonly total_tokens?: number;
  };
}
