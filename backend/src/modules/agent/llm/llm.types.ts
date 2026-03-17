/**
 * @fileoverview LLM Abstraction Types
 * @module @nxt1/backend/modules/agent/llm
 *
 * Internal types for the LLM service layer. These live in the backend
 * (not in @nxt1/core) because they are implementation details of the
 * OpenRouter integration — no frontend or mobile app needs them.
 */

import type { ModelTier, AgentIdentifier } from '@nxt1/core';

// ─── Model Catalogue ────────────────────────────────────────────────────────

/**
 * Maps our abstract model tiers to concrete OpenRouter model slugs.
 * This is the ONLY place model IDs are defined — change here to swap models globally.
 */
export const MODEL_CATALOGUE: Record<ModelTier, string> = {
  fast: 'anthropic/claude-3.5-haiku',
  balanced: 'anthropic/claude-3.5-sonnet',
  reasoning: 'anthropic/claude-3.5-sonnet',
  creative: 'anthropic/claude-3.5-sonnet',
} as const;

/**
 * Dedicated image generation model — separate from text tiers because
 * image models require different request shapes (modalities, extended timeout).
 * Must match the model used in the legacy nxt1 project (functions/).
 */
export const IMAGE_MODEL = 'google/gemini-3-pro-image-preview' as const;

/** Timeout for image generation requests (models are slow). */
export const IMAGE_GENERATION_TIMEOUT_MS = 180_000;

// ─── Request / Response Shapes ──────────────────────────────────────────────

/** A single message in the OpenRouter chat format. */
export interface LLMMessage {
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content: string | null;
  /** Present when the assistant requests a tool call. */
  readonly tool_calls?: readonly LLMToolCall[];
  /** Present when role === 'tool' — ties the result back to the call. */
  readonly tool_call_id?: string;
}

/** An OpenRouter function-calling tool definition. */
export interface LLMToolSchema {
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: Record<string, unknown>;
  };
}

/** A tool call requested by the assistant. */
export interface LLMToolCall {
  readonly id: string;
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly arguments: string; // JSON string
  };
}

/** Options passed to a completion request. */
export interface LLMCompletionOptions {
  /** Which model tier to use (resolves to a concrete model via MODEL_CATALOGUE). */
  readonly tier: ModelTier;
  /** Override the resolved model with a specific slug. */
  readonly modelOverride?: string;
  /** Maximum tokens to generate. */
  readonly maxTokens?: number;
  /** Sampling temperature (0-2). */
  readonly temperature?: number;
  /** Tool schemas for function calling (optional). */
  readonly tools?: readonly LLMToolSchema[];
  /** Whether to force JSON output format. */
  readonly jsonMode?: boolean;
  /** Abort signal for cancellation. */
  readonly signal?: AbortSignal;
  /** Telemetry context — passed through to the onTelemetry callback. */
  readonly telemetryContext?: {
    readonly operationId: string;
    readonly userId: string;
    readonly agentId: AgentIdentifier;
  };
}

/** The parsed response from an LLM completion. */
export interface LLMCompletionResult {
  /** The assistant's text content (null if only tool calls). */
  readonly content: string | null;
  /** Tool calls the assistant wants to make (empty if pure text response). */
  readonly toolCalls: readonly LLMToolCall[];
  /** The OpenRouter model that actually served the request. */
  readonly model: string;
  /** Token usage for telemetry. */
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
  };
  /** Latency of the API call in ms. */
  readonly latencyMs: number;
  /** Estimated cost in USD (fractional cents). */
  readonly costUsd: number;
  /** The finish reason from OpenRouter. */
  readonly finishReason: string;
}

/** Telemetry record emitted after every LLM call. */
export interface LLMTelemetryRecord {
  readonly operationId: string;
  readonly userId: string;
  readonly agentId: AgentIdentifier;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
  readonly latencyMs: number;
  readonly hadToolCall: boolean;
  readonly timestamp: string;
}

/** Callback for telemetry logging. */
export type LLMTelemetryCallback = (record: LLMTelemetryRecord) => void;

// ─── Image Generation Types ─────────────────────────────────────────────────

/** Options for image generation via OpenRouter multimodal models. */
export interface ImageGenerationOptions {
  /** The text prompt describing the image to generate. */
  readonly prompt: string;
  /** Optional reference image URL to composite / use as input (image-to-image). */
  readonly referenceImageUrl?: string;
  /** Override the default image model. */
  readonly modelOverride?: string;
  /** Abort signal for cancellation. */
  readonly signal?: AbortSignal;
  /** Telemetry context — passed through to the onTelemetry callback. */
  readonly telemetryContext?: {
    readonly operationId: string;
    readonly userId: string;
    readonly agentId: AgentIdentifier;
  };
}

/** The result of an image generation request. */
export interface ImageGenerationResult {
  /** Base64-encoded image data (without data URI prefix). */
  readonly imageBase64: string;
  /** MIME type of the generated image. */
  readonly mimeType: string;
  /** Any accompanying text content from the model. */
  readonly textContent: string | null;
  /** The model that served the request. */
  readonly model: string;
  /** Token usage for telemetry. */
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
  };
  /** Latency of the API call in ms. */
  readonly latencyMs: number;
  /** Estimated cost in USD. */
  readonly costUsd: number;
}

// ─── Streaming Types ────────────────────────────────────────────────────────

/** Options for streaming completions (same as LLMCompletionOptions, excluding tool calling). */
export interface LLMStreamOptions {
  /** Which model tier to use. */
  readonly tier: ModelTier;
  /** Override with a specific model slug. */
  readonly modelOverride?: string;
  /** Maximum tokens to generate. */
  readonly maxTokens?: number;
  /** Sampling temperature (0-2). */
  readonly temperature?: number;
  /** Abort signal for cancellation. */
  readonly signal?: AbortSignal;
  /** Telemetry context — passed through to the onTelemetry callback. */
  readonly telemetryContext?: {
    readonly operationId: string;
    readonly userId: string;
    readonly agentId: AgentIdentifier;
  };
}

/** A single streaming event emitted as tokens arrive. */
export interface LLMStreamDelta {
  /** The text fragment (may be empty for non-content chunks). */
  readonly content: string;
  /** True when this is the final chunk (stream is done). */
  readonly done: boolean;
}

/** Final metadata returned after the stream completes. */
export interface LLMStreamResult {
  /** The full concatenated response text. */
  readonly content: string;
  /** The model that served the request. */
  readonly model: string;
  /** Token usage (only available after stream completes). */
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
  };
  /** Latency from first request to last token. */
  readonly latencyMs: number;
  /** Estimated cost in USD. */
  readonly costUsd: number;
  /** The finish reason from OpenRouter. */
  readonly finishReason: string;
}
