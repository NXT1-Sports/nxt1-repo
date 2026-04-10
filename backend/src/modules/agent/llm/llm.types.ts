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
  // ── Text Tiers ──────────────────────────────────────────────────────────
  routing: 'anthropic/claude-3.5-sonnet',
  extraction: 'anthropic/claude-haiku-4-5',
  data_heavy: 'qwen/qwen3.6-plus',
  evaluator: 'minimax/minimax-m2.7',
  compliance: 'openai/gpt-4o',
  copywriting: 'anthropic/claude-3.5-sonnet',
  prompt_engineering: 'anthropic/claude-3.5-sonnet',
  chat: 'anthropic/claude-haiku-4-5',
  task_automation: 'anthropic/claude-3.5-sonnet',

  // ── Media Tiers ─────────────────────────────────────────────────────────
  image_generation: 'google/gemini-3-pro-image-preview',
  video_generation: 'google/gemini-3-pro-image-preview', // placeholder until video models available
  vision_analysis: 'openai/gpt-4o',
  video_analysis: 'google/gemini-2.5-flash',
  audio_analysis: 'openai/gpt-4o',
  voice_generation: 'openai/gpt-4o-mini', // placeholder until TTS models available
  music_generation: 'openai/gpt-4o-mini', // placeholder until music models available

  // ── Utility Tiers ──────────────────────────────────────────────────────
  embedding: 'openai/text-embedding-3-small',
  moderation: 'meta-llama/llama-guard-3-8b',
} as const;

/**
 * Ordered fallback chains per tier. When the primary model (index 0) fails
 * with a non-transient error (e.g. 400 context-too-large, model unavailable),
 * the service retries with the next model in the chain.
 *
 * Index 0 is always the MODEL_CATALOGUE primary. Subsequent entries are
 * progressively cheaper / smaller models that are more likely to succeed.
 */
export const MODEL_FALLBACK_CHAIN: Record<ModelTier, readonly string[]> = {
  // ── Text Tiers ──────────────────────────────────────────────────────────
  routing: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o', 'anthropic/claude-haiku-4-5'],
  extraction: ['anthropic/claude-haiku-4-5', 'openai/gpt-4o-mini', 'qwen/qwen3.6-plus'],
  data_heavy: ['qwen/qwen3.6-plus', 'anthropic/claude-haiku-4-5', 'openai/gpt-4o-mini'],
  evaluator: ['minimax/minimax-m2.7', 'anthropic/claude-3.5-sonnet', 'openai/gpt-4o'],
  compliance: ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet', 'anthropic/claude-haiku-4-5'],
  copywriting: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o', 'qwen/qwen3.6-plus'],
  prompt_engineering: [
    'anthropic/claude-3.5-sonnet',
    'openai/gpt-4o',
    'anthropic/claude-haiku-4-5',
  ],
  chat: ['anthropic/claude-haiku-4-5', 'openai/gpt-4o-mini', 'qwen/qwen3.6-plus'],
  task_automation: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o', 'anthropic/claude-haiku-4-5'],

  // ── Media Tiers ─────────────────────────────────────────────────────────
  image_generation: ['google/gemini-3-pro-image-preview'],
  video_generation: ['google/gemini-3-pro-image-preview'],
  vision_analysis: ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet'],
  video_analysis: ['google/gemini-2.5-flash', 'google/gemini-2.5-pro'],
  audio_analysis: ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet'],
  voice_generation: ['openai/gpt-4o-mini'],
  music_generation: ['openai/gpt-4o-mini'],

  // ── Utility Tiers ──────────────────────────────────────────────────────
  embedding: ['openai/text-embedding-3-small'],
  moderation: ['meta-llama/llama-guard-3-8b', 'openai/gpt-4o-mini'],
} as const;

/**
 * Maps billing-facing tier names to their corresponding MODEL_CATALOGUE key.
 * Used by the billing pipeline (cost-resolver, platform-config) to look up
 * the model slug for pre-auth cost estimation without repeating model strings.
 *
 * 'fast'      → cheapest / fastest text model  (chat tier)
 * 'balanced'  → default quality text model     (routing tier)
 * 'reasoning' → instruction-following tasks    (task_automation tier)
 * 'creative'  → high-temperature writing tasks (copywriting tier)
 */
export const BILLING_TIER_MAP: Record<string, keyof typeof MODEL_CATALOGUE> = {
  fast: 'chat',
  balanced: 'routing',
  reasoning: 'task_automation',
  creative: 'copywriting',
} as const;

/**
 * Dedicated image generation model — separate from text tiers because
 * image models require different request shapes (modalities, extended timeout).
 * Must match the model used in the legacy nxt1 project (functions/).
 */
export const IMAGE_MODEL = 'google/gemini-3-pro-image-preview' as const;

/** Timeout for image generation requests (models are slow). */
export const IMAGE_GENERATION_TIMEOUT_MS = 180_000;

/** Timeout for video analysis requests (large file processing + long context). */
export const VIDEO_ANALYSIS_TIMEOUT_MS = 300_000;

// ─── Request / Response Shapes ──────────────────────────────────────────────

/**
 * A text content part in a multimodal message.
 */
export interface LLMTextContentPart {
  readonly type: 'text';
  readonly text: string;
}

/**
 * An image URL content part in a multimodal message.
 * Used to pass images (JPEG, PNG, WebP, GIF) to vision-capable models.
 */
export interface LLMImageUrlContentPart {
  readonly type: 'image_url';
  readonly image_url: {
    readonly url: string;
    readonly detail?: 'auto' | 'low' | 'high';
  };
}

/**
 * A video URL content part in a multimodal message.
 * Used to pass video files (MP4, MPEG, MOV, WebM) or YouTube URLs
 * to video-capable models (e.g. Gemini) via OpenRouter's native video_url support.
 */
export interface LLMVideoUrlContentPart {
  readonly type: 'video_url';
  readonly video_url: {
    readonly url: string;
  };
}

/**
 * Union of all content part types for multimodal messages.
 */
export type LLMContentPart = LLMTextContentPart | LLMImageUrlContentPart | LLMVideoUrlContentPart;

/** A single message in the OpenRouter chat format. */
export interface LLMMessage {
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  /**
   * Message content. Can be:
   * - `string` for text-only messages
   * - `LLMContentPart[]` for multimodal messages (text + images)
   * - `null` when the assistant uses tool calls with no text
   */
  readonly content: string | readonly LLMContentPart[] | null;
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
    /** Feature name for Helicone cost tracking (e.g. 'scout-report', 'highlights'). */
    readonly feature?: string;
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
  /**
   * Optional array of additional image URLs to include in the multimodal payload.
   * Each URL is added as a separate `image_url` content part before the text prompt.
   * Use this when the model needs to see multiple images (e.g. subject photo + brand logo).
   */
  readonly additionalImageUrls?: readonly string[];
  /** Override the default image model. */
  readonly modelOverride?: string;
  /** Abort signal for cancellation. */
  readonly signal?: AbortSignal;
  /** Telemetry context — passed through to the onTelemetry callback. */
  readonly telemetryContext?: {
    readonly operationId: string;
    readonly userId: string;
    readonly agentId: AgentIdentifier;
    /** Feature name for Helicone cost tracking (e.g. 'scout-report', 'highlights'). */
    readonly feature?: string;
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

/** Options for streaming completions with optional tool calling. */
export interface LLMStreamOptions {
  /** Which model tier to use. */
  readonly tier: ModelTier;
  /** Override with a specific model slug. */
  readonly modelOverride?: string;
  /** Maximum tokens to generate. */
  readonly maxTokens?: number;
  /** Sampling temperature (0-2). */
  readonly temperature?: number;
  /** Tool schemas for function calling (optional — enables agentic streaming). */
  readonly tools?: readonly LLMToolSchema[];
  /** Abort signal for cancellation. */
  readonly signal?: AbortSignal;
  /** Telemetry context — passed through to the onTelemetry callback. */
  readonly telemetryContext?: {
    readonly operationId: string;
    readonly userId: string;
    readonly agentId: AgentIdentifier;
    /** Feature name for Helicone cost tracking (e.g. 'scout-report', 'highlights'). */
    readonly feature?: string;
  };
}

/** A single streaming event emitted as tokens arrive. */
export interface LLMStreamDelta {
  /** The text fragment (may be empty for non-content chunks). */
  readonly content: string;
  /** True when this is the final chunk (stream is done). */
  readonly done: boolean;
  /** Name of the tool being called (present only in tool_call chunks). */
  readonly toolName?: string;
  /** Accumulated arguments JSON fragment for the tool call. */
  readonly toolArgs?: string;
  /** Unique index of the tool call within the response (OpenRouter uses this). */
  readonly toolCallIndex?: number;
}

/** Final metadata returned after the stream completes. */
export interface LLMStreamResult {
  /** The full concatenated response text. */
  readonly content: string;
  /** The model that served the request. */
  readonly model: string;
  /** Tool calls the assistant wants to make (empty if pure text response). */
  readonly toolCalls: readonly LLMToolCall[];
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
