/**
 * @fileoverview LLM Module — Barrel Export
 * @module @nxt1/backend/modules/agent/llm
 */

export { OpenRouterService, OpenRouterError } from './openrouter.service.js';
export type {
  LLMMessage,
  LLMToolSchema,
  LLMToolCall,
  LLMCompletionOptions,
  LLMCompletionResult,
  LLMTelemetryRecord,
  LLMTelemetryCallback,
} from './llm.types.js';
export { MODEL_CATALOGUE } from './llm.types.js';
