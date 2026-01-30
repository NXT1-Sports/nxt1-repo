/**
 * @fileoverview Agent X Module Index
 * @module @nxt1/core/ai
 * @version 1.0.0
 *
 * Barrel export for Agent X AI module.
 */

// Types
export type {
  ChatRole,
  AgentXMessage,
  AgentXMessageMetadata,
  QuickTaskCategory,
  AgentXQuickTask,
  AgentXMode,
  AgentXModeConfig,
  AgentXChatRequest,
  AgentXChatResponse,
  AgentXUserContext,
  AgentXErrorCode,
  AgentXConfig,
  AgentXState,
} from './agent-x.types';

// Constants
export {
  AGENT_X_CONFIG,
  AGENT_X_MODES,
  AGENT_X_DEFAULT_MODE,
  ATHLETE_QUICK_TASKS,
  COACH_QUICK_TASKS,
  COLLEGE_QUICK_TASKS,
  ALL_QUICK_TASKS,
  AGENT_X_ENDPOINTS,
  AGENT_X_RATE_LIMITS,
  AGENT_X_CACHE_KEYS,
  AGENT_X_CACHE_TTL,
} from './agent-x.constants';

// API
export { createAgentXApi, type AgentXApi } from './agent-x.api';
