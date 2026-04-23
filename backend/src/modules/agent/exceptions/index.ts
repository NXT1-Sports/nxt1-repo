/**
 * @fileoverview Agent Errors Module
 * @module @nxt1/backend/modules/agent/exceptions
 */

export {
  AgentYieldException,
  isAgentYield,
  type AgentYieldPayload,
} from './agent-yield.exception.js';
export {
  AgentDelegationException,
  isAgentDelegation,
  type AgentDelegationPayload,
} from './agent-delegation.exception.js';
export {
  AgentEngineError,
  getAgentEngineErrorCode,
  isAgentEngineError,
  mapAgentEngineErrorToOutcomeCode,
  toAgentEngineError,
  type AgentEngineErrorCode,
  type AgentEngineErrorOptions,
} from './agent-engine.error.js';
