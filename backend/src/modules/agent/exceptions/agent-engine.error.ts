/**
 * @fileoverview Agent Engine Typed Errors
 * @module @nxt1/backend/modules/agent/exceptions
 *
 * Provides a stable, machine-readable error contract across router, planner,
 * LLM integration, and worker boundaries.
 */

export type AgentEngineErrorCode =
  | 'AGENT_NOT_REGISTERED'
  | 'PLANNER_EMPTY_PLAN'
  | 'PLANNER_SCHEMA_INVALID'
  | 'PLANNER_DEPENDENCY_INVALID'
  | 'PLANNER_CIRCULAR_DEPENDENCY'
  | 'OPENROUTER_CONFIG_MISSING_API_KEY'
  | 'OPENROUTER_NO_MODELS_AVAILABLE'
  | 'OPENROUTER_EMPTY_RESPONSE'
  | 'OPENROUTER_INVALID_RESPONSE'
  | 'OPENROUTER_STREAM_BODY_MISSING'
  | 'OPENROUTER_REQUEST_FAILED'
  | 'AGENT_PIPELINE_FAILED';

export interface AgentEngineErrorOptions {
  readonly cause?: unknown;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export class AgentEngineError extends Error {
  readonly code: AgentEngineErrorCode;
  readonly metadata?: Readonly<Record<string, unknown>>;

  constructor(code: AgentEngineErrorCode, message: string, options?: AgentEngineErrorOptions) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = 'AgentEngineError';
    this.code = code;
    this.metadata = options?.metadata;
  }
}

export function isAgentEngineError(error: unknown): error is AgentEngineError {
  return (
    error instanceof AgentEngineError ||
    (error instanceof Error &&
      'name' in error &&
      error.name === 'AgentEngineError' &&
      'code' in error)
  );
}

export function getAgentEngineErrorCode(error: unknown): AgentEngineErrorCode | undefined {
  if (!isAgentEngineError(error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? (code as AgentEngineErrorCode) : undefined;
}
