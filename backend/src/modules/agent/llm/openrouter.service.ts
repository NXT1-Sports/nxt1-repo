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
 * ```
 */

import type {
  LLMMessage,
  LLMCompletionOptions,
  LLMCompletionResult,
  LLMToolCall,
  LLMTelemetryCallback,
  ImageGenerationOptions,
  ImageGenerationResult,
  LLMStreamOptions,
  LLMStreamDelta,
  LLMStreamResult,
} from './llm.types.js';
import {
  MODEL_CATALOGUE,
  MODEL_FALLBACK_CHAIN,
  IMAGE_MODEL,
  IMAGE_GENERATION_TIMEOUT_MS,
} from './llm.types.js';
import { logger } from '../../../utils/logger.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_500;

/** Status codes that are safe to retry on. */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/** Helicone proxy base URL (set to empty to disable). */
const HELICONE_API_KEY = process.env['HELICONE_API_KEY'] ?? '';

/**
 * OpenRouter endpoint — routes through the Helicone proxy when HELICONE_API_KEY is
 * configured so that every LLM call is automatically logged to Helicone. Without the
 * proxy, OpenRouter does NOT forward Helicone headers on its own, meaning
 * getJobCost() will always return requestCount=0.
 *
 * Helicone proxy for OpenRouter: https://openrouter.helicone.ai/api/v1
 */
const OPENROUTER_API_URL = HELICONE_API_KEY
  ? 'https://openrouter.helicone.ai/api/v1/chat/completions'
  : 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Build Helicone tracing headers when enabled.
 * These are passthrough headers — OpenRouter forwards them to Helicone
 * without affecting the LLM request itself.
 */
function buildHeliconeHeaders(
  ctx?: LLMCompletionOptions['telemetryContext']
): Record<string, string> {
  if (!HELICONE_API_KEY) return {};
  return {
    'Helicone-Auth': `Bearer ${HELICONE_API_KEY}`,
    // Sessions: group all LLM calls in one Agent X operation into a single Helicone session.
    // Helicone-Session-Path is REQUIRED alongside Session-Id for sessions to be created.
    ...(ctx?.operationId && { 'Helicone-Session-Id': ctx.operationId }),
    ...(ctx?.operationId && {
      'Helicone-Session-Path': ctx.agentId ? `/${ctx.agentId}` : '/agent',
    }),
    // Custom property for cost lookup by job — stored in lowercase because HTTP/2
    // normalises header names to lowercase before Helicone indexes them.
    ...(ctx?.operationId && { 'Helicone-Property-job-id': ctx.operationId }),
    // Tags the coordinator / planner name so the waterfall shows which agent made the call
    ...(ctx?.agentId && { 'Helicone-Session-Name': ctx.agentId }),
    ...(ctx?.userId && { 'Helicone-User-Id': ctx.userId }),
    // Tags the feature for per-feature cost analytics
    ...(ctx?.feature && { 'Helicone-Property-feature': ctx.feature }),
    'Helicone-Property-platform': 'nxt1',
  };
}

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
   * If the primary model fails with a non-transient error (e.g. 400 context-too-large,
   * model unavailable, content policy), the request is automatically retried with the
   * next model in the tier's fallback chain. This ensures scraping and extraction
   * tasks degrade gracefully instead of failing outright.
   *
   * @param messages - The conversation history (system + user + assistant + tool messages).
   * @param options  - Model tier, temperature, max tokens, tool schemas, etc.
   * @returns Parsed completion result with content, tool calls, and telemetry data.
   */
  async complete(
    messages: readonly LLMMessage[],
    options: LLMCompletionOptions
  ): Promise<LLMCompletionResult> {
    // If caller specified an exact model override, skip fallback chain
    if (options.modelOverride) {
      return this.completeWithModel(messages, options, options.modelOverride);
    }

    // Build fallback chain: primary model + alternatives for this tier
    const originalChain = MODEL_FALLBACK_CHAIN[options.tier] ?? [MODEL_CATALOGUE[options.tier]];
    const chain = originalChain;
    let lastError: Error | undefined;

    for (let i = 0; i < chain.length; i++) {
      const model = chain[i];
      try {
        return await this.completeWithModel(messages, options, model);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Never retry on user abort
        if (options.signal?.aborted) throw lastError;

        // If this was a transient error (5xx, 429), fetchWithRetry already
        // exhausted its retry budget for this same model. Fall through to
        // the next model in the chain.
        const isLastModel = i === chain.length - 1;
        if (isLastModel) throw lastError;

        logger.warn('[OpenRouter] Model failed, trying fallback', {
          failedModel: model,
          nextModel: chain[i + 1],
          tier: options.tier,
          error: lastError.message,
        });
      }
    }

    throw lastError ?? new Error('OpenRouter request failed: no models available');
  }

  /**
   * Execute a completion with a specific model (no fallback logic).
   * Handles body building, retry, parsing, and telemetry emission.
   */
  private async completeWithModel(
    messages: readonly LLMMessage[],
    options: LLMCompletionOptions,
    model: string
  ): Promise<LLMCompletionResult> {
    const startMs = Date.now();

    logger.info(`[DEBUGLOG] completeWithModel called!`, {
      model,
      operationId: options.telemetryContext?.operationId,
    });

    const body = this.buildRequestBody(messages, model, options);
    const raw = await this.fetchWithRetry(
      body,
      options.signal,
      DEFAULT_TIMEOUT_MS,
      options.telemetryContext
    );
    const latencyMs = Date.now() - startMs;

    let result = this.parseResponse(raw, model, latencyMs);

    // If the API response is missing usage (e.g. the Helicone proxy sometimes
    // omits it), fall back to a character-based estimate (~4 chars per token).
    // This ensures billing always fires even when the proxy strips token counts.
    if (result.usage.inputTokens === 0) {
      const inputChars = messages.reduce<number>(
        (sum, m) =>
          sum +
          (typeof m.content === 'string'
            ? m.content.length
            : JSON.stringify(m.content ?? '').length),
        0
      );
      const outputChars = result.content?.length ?? 0;
      const estimatedInput = Math.max(1, Math.ceil(inputChars / 4));
      const estimatedOutput = Math.max(1, Math.ceil(outputChars / 4));
      logger.info('[OpenRouter] usage missing from API response — using char-based estimate', {
        operationId: options.telemetryContext?.operationId ?? '(none)',
        model: result.model,
        estimatedInput,
        estimatedOutput,
      });
      result = {
        ...result,
        usage: {
          inputTokens: estimatedInput,
          outputTokens: estimatedOutput,
          totalTokens: estimatedInput + estimatedOutput,
        },
        costUsd: this.estimateCost(result.model, estimatedInput, estimatedOutput),
      };
    }

    // Emit telemetry if a callback is registered
    logger.info('[OpenRouter] completeWithModel telemetry', {
      operationId: options.telemetryContext?.operationId ?? '(none)',
      model: result.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      costUsd: result.costUsd,
      hasCallback: !!this.telemetryCallback,
    });
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

  /**
   * Generate an image using an OpenRouter multimodal model.
   *
   * Uses the dedicated IMAGE_MODEL with extended timeout and `modalities: ["text", "image"]`.
   * Supports optional reference image input for compositing / image-to-image workflows.
   *
   * @param options - Prompt, optional reference image, and telemetry context.
   * @returns Image data (base64), metadata, and telemetry info.
   */
  async generateImage(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
    const model = options.modelOverride ?? IMAGE_MODEL;
    const startMs = Date.now();

    // Build user content — plain text or multimodal (text + reference image)
    let userContent: string | Array<Record<string, unknown>>;
    if (options.referenceImageUrl) {
      userContent = [
        { type: 'image_url', image_url: { url: options.referenceImageUrl } },
        { type: 'text', text: options.prompt },
      ];
    } else {
      userContent = options.prompt;
    }

    const body: Record<string, unknown> = {
      model,
      messages: [{ role: 'user', content: userContent }],
      max_tokens: 4096,
      temperature: 0.8,
      modalities: ['text', 'image'],
    };

    const raw = await this.fetchWithRetry(
      body,
      options.signal,
      IMAGE_GENERATION_TIMEOUT_MS,
      options.telemetryContext
    );
    const latencyMs = Date.now() - startMs;

    // Extract image from response (base64 inline_data or URL)
    const choice = raw.choices?.[0];
    if (!choice?.message) {
      throw new Error('Image model returned no response.');
    }

    const { imageBase64, mimeType, textContent } = this.extractImageFromResponse(choice.message);

    const inputTokens = raw.usage?.prompt_tokens ?? 0;
    const outputTokens = raw.usage?.completion_tokens ?? 0;

    const result: ImageGenerationResult = {
      imageBase64,
      mimeType,
      textContent,
      model: raw.model ?? model,
      usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
      latencyMs,
      costUsd: this.estimateCost(model, inputTokens, outputTokens),
    };

    // Emit telemetry
    this.telemetryCallback?.({
      operationId: options.telemetryContext?.operationId ?? '',
      userId: options.telemetryContext?.userId ?? '',
      agentId: options.telemetryContext?.agentId ?? 'brand_media_coordinator',
      model: result.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      costUsd: result.costUsd,
      latencyMs: result.latencyMs,
      hadToolCall: false,
      timestamp: new Date().toISOString(),
    });

    return result;
  }

  // ─── Streaming API ──────────────────────────────────────────────────────

  /**
   * Stream a chat completion from OpenRouter using Server-Sent Events.
   *
   * Yields `LLMStreamDelta` objects as tokens arrive. The caller (typically
   * an Express SSE route) writes each delta to the response. After the stream
   * completes, the returned `LLMStreamResult` contains the complete response,
   * token usage, latency, and cost — ready for persistence and telemetry.
   *
   * @param messages - The conversation history.
   * @param options  - Model tier, temperature, max tokens.
   * @param onDelta  - Called for every text fragment as it arrives.
   * @returns Final aggregated result (content, usage, cost).
   */
  async completeStream(
    messages: readonly LLMMessage[],
    options: LLMStreamOptions,
    onDelta: (delta: LLMStreamDelta) => void
  ): Promise<LLMStreamResult> {
    const model = options.modelOverride ?? MODEL_CATALOGUE[options.tier];
    const startMs = Date.now();

    const body = this.buildStreamRequestBody(messages, model, options);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    // Merge external abort signal with our timeout
    const onAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onAbort);

    let fullContent = '';
    let finishReason = 'unknown';
    let inputTokens = 0;
    let outputTokens = 0;
    let responseModel = model;

    try {
      const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'HTTP-Referer': this.siteUrl,
          'X-Title': this.siteName,
          'Content-Type': 'application/json',
          ...buildHeliconeHeaders(options.telemetryContext),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unknown error');
        throw new OpenRouterError(
          `OpenRouter streaming error ${response.status}: ${errorBody}`,
          response.status
        );
      }

      if (!response.body) {
        throw new Error('OpenRouter returned no streaming body.');
      }

      // Read the SSE stream from OpenRouter
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE protocol: each event is separated by double newlines
        const lines = buffer.split('\n');
        // Keep the last incomplete line in the buffer
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          const jsonStr = trimmed.slice(6);
          try {
            const chunk = JSON.parse(jsonStr) as OpenRouterStreamChunk;

            // Capture model from first chunk
            if (chunk.model) responseModel = chunk.model;

            const delta = chunk.choices?.[0]?.delta;
            if (delta?.content) {
              fullContent += delta.content;
              onDelta({ content: delta.content, done: false });
            }

            // Capture finish reason
            const reason = chunk.choices?.[0]?.finish_reason;
            if (reason) finishReason = reason;

            // Capture usage from the final chunk (OpenRouter sends it on the last event)
            if (chunk.usage) {
              inputTokens = chunk.usage.prompt_tokens ?? 0;
              outputTokens = chunk.usage.completion_tokens ?? 0;
            }
          } catch {
            // Skip malformed JSON lines — non-critical during streaming
          }
        }
      }

      // Signal completion
      onDelta({ content: '', done: true });
    } finally {
      clearTimeout(timeoutId);
      options.signal?.removeEventListener('abort', onAbort);
    }

    const latencyMs = Date.now() - startMs;
    const costUsd = this.estimateCost(responseModel, inputTokens, outputTokens);

    // Emit telemetry
    this.telemetryCallback?.({
      operationId: options.telemetryContext?.operationId ?? '',
      userId: options.telemetryContext?.userId ?? '',
      agentId: options.telemetryContext?.agentId ?? 'general',
      model: responseModel,
      inputTokens,
      outputTokens,
      costUsd,
      latencyMs,
      hadToolCall: false,
      timestamp: new Date().toISOString(),
    });

    return {
      content: fullContent,
      model: responseModel,
      usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
      latencyMs,
      costUsd,
      finishReason,
    };
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

    // For Anthropic models, exclude Amazon Bedrock which rejects the OpenRouter
    // slug format ("The provided model identifier is invalid").
    // Using `ignore` (not `order`+`allow_fallbacks:false`) so other providers
    // like Anthropic direct or Azure can still serve the request.
    if (model.startsWith('anthropic/')) {
      body['provider'] = { ignore: ['Amazon Bedrock'], allow_fallbacks: true };
    }

    return body;
  }

  /**
   * Build the request body for a streaming completion.
   * Sets `stream: true` and requests usage in the final chunk.
   */
  private buildStreamRequestBody(
    messages: readonly LLMMessage[],
    model: string,
    options: LLMStreamOptions
  ): Record<string, unknown> {
    const streamBody: Record<string, unknown> = {
      model,
      messages: messages.map((m) => this.serializeMessage(m)),
      max_tokens: options.maxTokens ?? 2048,
      temperature: options.temperature ?? 0.7,
      stream: true,
      // OpenRouter includes usage in the final streamed chunk when requested
      stream_options: { include_usage: true },
    };

    // Same Bedrock avoidance as non-streaming path
    if (model.startsWith('anthropic/')) {
      streamBody['provider'] = { ignore: ['Amazon Bedrock'], allow_fallbacks: true };
    }

    return streamBody;
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
    signal?: AbortSignal,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
    telemetryContext?: LLMCompletionOptions['telemetryContext']
  ): Promise<OpenRouterRawResponse> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.fetchOnce(body, signal, timeoutMs, telemetryContext);
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
    signal?: AbortSignal,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
    telemetryContext?: LLMCompletionOptions['telemetryContext']
  ): Promise<OpenRouterRawResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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
          ...buildHeliconeHeaders(telemetryContext),
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

  /**
   * Extract base64 image data from a multimodal model response.
   * Handles multiple response shapes: inline_data, data URI in content, or URL.
   */
  private extractImageFromResponse(message: NonNullable<OpenRouterRawChoice['message']>): {
    imageBase64: string;
    mimeType: string;
    textContent: string | null;
  } {
    const content = message.content;

    // Shape 1: Multipart content array (e.g. Gemini-style with inline_data)
    if (Array.isArray(content)) {
      let imageBase64 = '';
      let mimeType = 'image/png';
      const textParts: string[] = [];

      for (const part of content as Array<Record<string, unknown>>) {
        if (part['type'] === 'image_url' && typeof part['image_url'] === 'object') {
          const imgUrl = (part['image_url'] as Record<string, string>)['url'] ?? '';
          const dataUriMatch = imgUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
          if (dataUriMatch) {
            mimeType = dataUriMatch[1];
            imageBase64 = dataUriMatch[2];
          }
        } else if (part['type'] === 'inline_data' && typeof part['inline_data'] === 'object') {
          const inline = part['inline_data'] as Record<string, string>;
          mimeType = inline['mime_type'] ?? 'image/png';
          imageBase64 = inline['data'] ?? '';
        } else if (part['type'] === 'text' && typeof part['text'] === 'string') {
          textParts.push(part['text'] as string);
        }
      }

      if (imageBase64) {
        return { imageBase64, mimeType, textContent: textParts.join('\n') || null };
      }
    }

    // Shape 2: Single string content with embedded data URI
    if (typeof content === 'string') {
      const dataUriMatch = content.match(/data:(image\/[^;]+);base64,([A-Za-z0-9+/=]+)/);
      if (dataUriMatch) {
        const remainingText = content.replace(dataUriMatch[0], '').trim();
        return {
          imageBase64: dataUriMatch[2],
          mimeType: dataUriMatch[1],
          textContent: remainingText || null,
        };
      }
    }

    // Shape 3: Images in message.images[] (OpenRouter 2025+ format for Gemini image models)
    if (Array.isArray(message.images) && message.images.length > 0) {
      for (const img of message.images) {
        const url = img?.image_url?.url ?? '';
        const dataUriMatch = url.match(/^data:(image\/[^;]+);base64,(.+)$/);
        if (dataUriMatch) {
          const textContent = typeof content === 'string' ? content : null;
          return {
            imageBase64: dataUriMatch[2],
            mimeType: dataUriMatch[1],
            textContent,
          };
        }
      }
    }

    throw new Error(
      'Image model response did not contain recognisable image data. ' +
        'The model may not support image generation or the response format has changed.'
    );
  }

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

    // Extract text content — handle string or multimodal array
    let content: string | null = null;
    const rawContent = message?.content ?? null;
    if (typeof rawContent === 'string') {
      content = rawContent;
    } else if (Array.isArray(rawContent)) {
      // Multimodal: concatenate text parts only
      const textParts = (rawContent as Array<Record<string, unknown>>)
        .filter((p) => p['type'] === 'text' && typeof p['text'] === 'string')
        .map((p) => p['text'] as string);
      content = textParts.length > 0 ? textParts.join('\n') : null;
    }

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

  // ─── Text Embeddings ────────────────────────────────────────────────────

  /**
   * Generate a text embedding via the OpenRouter embeddings endpoint.
   * Used by VectorMemoryService for MongoDB Atlas Vector Search.
   *
   * Routes through OpenRouter (openai/text-embedding-3-small).
   * We only use OPENROUTER_API_KEY for all model requests.
   *
   * @param text - The text to embed (truncated to 8,192 tokens by the model).
   * @returns A 1536-dimensional embedding vector (text-embedding-3-small).
   */
  async embed(text: string): Promise<readonly number[]> {
    // Always use OpenRouter directly for embeddings.
    // The Helicone OpenRouter proxy (openrouter.helicone.ai) only proxies
    // /api/v1/chat/completions — forwarding /api/v1/embeddings through it
    // causes a 401 "User not found" from OpenRouter.
    const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': this.siteUrl,
        'X-Title': this.siteName,
      },
      body: JSON.stringify({
        model: 'openai/text-embedding-3-small',
        encoding_format: 'float',
        // Character-based truncation: at ~4 chars/token this fits within the
        // model's 8,192-token context window for typical ASCII/Latin text.
        // Non-ASCII text uses more bytes per character but the model handles
        // graceful truncation internally for edge cases.
        input: text.slice(0, 8_000),
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`OpenRouter embeddings API error ${response.status}: ${body.slice(0, 200)}`);
    }

    const json = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };

    const embedding = json.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error('OpenRouter embeddings API returned empty or invalid embedding.');
    }

    return embedding;
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
  readonly choices?: readonly OpenRouterRawChoice[];
  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
    readonly total_tokens?: number;
  };
}

/** A single choice in the OpenRouter response (supports text and multimodal). */
interface OpenRouterRawChoice {
  readonly index: number;
  readonly message?: {
    readonly role: string;
    /** String for text responses, array for multimodal (image + text). */
    readonly content: string | readonly Record<string, unknown>[] | null;
    /** Image outputs returned by multimodal models (e.g. Gemini image generation). */
    readonly images?: readonly {
      readonly type: string;
      readonly image_url: { readonly url: string };
    }[];
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
}

// ─── OpenRouter Streaming Chunk Shape ───────────────────────────────────────

/** A single SSE chunk from an OpenRouter streaming response. */
interface OpenRouterStreamChunk {
  readonly id?: string;
  readonly model?: string;
  readonly choices?: readonly {
    readonly index: number;
    readonly delta?: {
      readonly role?: string;
      readonly content?: string;
    };
    readonly finish_reason?: string | null;
  }[];
  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
    readonly total_tokens?: number;
  };
}
