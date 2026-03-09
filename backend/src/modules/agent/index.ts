/**
 * @fileoverview Agent Module — Entry Point
 * @module @nxt1/backend/modules/agent
 *
 * Central barrel export for the Agent X orchestration engine.
 * This module contains the router (brain), specialized sub-agents,
 * tool registry, skills (knowledge), memory adapters, and guardrails.
 */

export { AgentRouter } from './agent.router.js';
export { ToolRegistry } from './tools/tool-registry.js';
export * from './skills/index.js';
export * from './services/index.js';
export * from './triggers/index.js';
