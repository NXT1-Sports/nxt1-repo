/**
 * @fileoverview Agent Module — Entry Point
 * @module @nxt1/backend/modules/agent
 *
 * Central barrel export for the Agent X orchestration engine.
 * This module contains the router (brain), LLM service, specialized sub-agents,
 * tool registry, skills (knowledge), memory adapters, and guardrails.
 */

export { AgentRouter } from './agent.router.js';
export { OpenRouterService, OpenRouterError } from './llm/openrouter.service.js';
export type { LLMMessage, LLMCompletionOptions, LLMCompletionResult } from './llm/llm.types.js';
export { MODEL_CATALOGUE } from './llm/llm.types.js';
export { ToolRegistry } from './tools/tool-registry.js';
export { ContextBuilder } from './memory/context-builder.js';
export * from './skills/index.js';
export * from './services/index.js';
export * from './triggers/index.js';
export * from './queue/index.js';
