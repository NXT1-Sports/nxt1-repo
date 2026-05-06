/**
 * @fileoverview Agent Engine Typed Errors
 * @module @nxt1/backend/modules/agent/exceptions
 *
 * Provides a stable, machine-readable error contract across router, planner,
 * LLM integration, and worker boundaries.
 */

export type AgentEngineErrorCode =
  | 'AGENT_NOT_REGISTERED'
  | 'AGENT_DEPENDENCY_MISSING'
  | 'AGENT_TOOL_NOT_ALLOWED'
  | 'AGENT_TOOL_ARGS_INVALID'
  | 'AGENT_SUB_AGENT_INVALID_OUTPUT'
  | 'AGENT_JOB_PAYLOAD_INVALID'
  | 'AGENT_JOB_KIND_UNSUPPORTED'
  | 'PLANNER_EMPTY_PLAN'
  | 'PLANNER_SCHEMA_INVALID'
  | 'PLANNER_DEPENDENCY_INVALID'
  | 'PLANNER_CIRCULAR_DEPENDENCY'
  | 'STRUCTURED_OUTPUT_EMPTY'
  | 'STRUCTURED_OUTPUT_INVALID_JSON'
  | 'TOOL_SCHEMA_NOT_ZOD'
  | 'TOOL_ENTITY_GROUP_MISSING'
  | 'TOOL_REGISTRY_DUPLICATE'
  | 'TOOL_INTEL_SYNC_FAILED'
  | 'INTEL_USER_NOT_FOUND'
  | 'INTEL_TEAM_NOT_FOUND'
  | 'INTEL_REPORT_NOT_FOUND'
  | 'INTEL_GENERATION_FAILED'
  | 'INTEL_SECTION_UPDATE_FAILED'
  | 'FIRECRAWL_CONFIG_MISSING_API_KEY'
  | 'FIRECRAWL_RESPONSE_EMPTY'
  | 'FIRECRAWL_REQUEST_FAILED'
  | 'FIRECRAWL_INVALID_RESPONSE'
  | 'APIFY_CONFIG_MISSING_API_TOKEN'
  | 'APIFY_RESPONSE_EMPTY'
  | 'APIFY_REQUEST_FAILED'
  | 'APIFY_INVALID_RESPONSE'
  | 'CLOUDFLARE_CONFIG_MISSING_API_TOKEN'
  | 'CLOUDFLARE_CONFIG_MISSING_ACCOUNT_ID'
  | 'CLOUDFLARE_CONFIG_MISSING_CUSTOMER_CODE'
  | 'CLOUDFLARE_RESPONSE_EMPTY'
  | 'CLOUDFLARE_REQUEST_FAILED'
  | 'CLOUDFLARE_INVALID_RESPONSE'
  | 'RUNWAY_CONFIG_MISSING_API_KEY'
  | 'RUNWAY_RESPONSE_EMPTY'
  | 'RUNWAY_REQUEST_FAILED'
  | 'RUNWAY_INVALID_RESPONSE'
  | 'FFMPEG_MCP_CONFIG_MISSING_URL'
  | 'FFMPEG_MCP_RESPONSE_EMPTY'
  | 'FFMPEG_MCP_REQUEST_FAILED'
  | 'FFMPEG_MCP_INVALID_RESPONSE'
  | 'FFMPEG_MCP_OPERATION_FAILED'
  | 'CHART_MCP_CONFIG_MISSING_URL'
  | 'CHART_MCP_RESPONSE_EMPTY'
  | 'CHART_MCP_REQUEST_FAILED'
  | 'CHART_MCP_INVALID_RESPONSE'
  | 'GOOGLE_WORKSPACE_CONFIG_INVALID'
  | 'GOOGLE_WORKSPACE_AUTH_REQUIRED'
  | 'GOOGLE_WORKSPACE_REQUEST_FAILED'
  | 'MICROSOFT_365_CONFIG_INVALID'
  | 'MICROSOFT_365_AUTH_REQUIRED'
  | 'MICROSOFT_365_REQUEST_FAILED'
  | 'FIREBASE_MCP_CONFIG_INVALID'
  | 'FIREBASE_MCP_RESPONSE_EMPTY'
  | 'FIREBASE_MCP_INVALID_RESPONSE'
  | 'FIREBASE_MCP_INVALID_SCOPE'
  | 'FIREBASE_MCP_INVALID_CURSOR'
  | 'FIREBASE_MCP_VIEW_UNSUPPORTED'
  | 'LIVE_VIEW_CONFIG_MISSING_API_KEY'
  | 'LIVE_VIEW_REQUEST_FAILED'
  | 'LIVE_VIEW_SESSION_NOT_FOUND'
  | 'LIVE_VIEW_SESSION_EXPIRED'
  | 'STORAGE_CONFIG_MISSING_BUCKET'
  | 'OPENROUTER_CONFIG_MISSING_API_KEY'
  | 'OPENROUTER_NO_MODELS_AVAILABLE'
  | 'OPENROUTER_EMPTY_RESPONSE'
  | 'OPENROUTER_INVALID_RESPONSE'
  | 'OPENROUTER_STREAM_BODY_MISSING'
  | 'OPENROUTER_REQUEST_TIMEOUT'
  | 'OPENROUTER_REQUEST_ABORTED'
  | 'OPENROUTER_REQUEST_FAILED'
  | 'AGENT_SERVICE_UNAVAILABLE'
  | 'AGENT_VALIDATION_FAILED'
  | 'AGENT_COMPLETION_PERSIST_FAILED'
  | 'AGENT_PIPELINE_FAILED'
  | 'TEAM_INTEL_DISABLED';

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

export function toAgentEngineError(
  error: unknown,
  fallbackCode: AgentEngineErrorCode,
  fallbackMessage?: string
): AgentEngineError {
  if (isAgentEngineError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new AgentEngineError(fallbackCode, fallbackMessage ?? error.message, {
      cause: error,
    });
  }

  return new AgentEngineError(
    fallbackCode,
    fallbackMessage ?? (typeof error === 'string' ? error : 'Unknown agent engine error')
  );
}

export function mapAgentEngineErrorToOutcomeCode(
  code: AgentEngineErrorCode
): 'routing_failed' | 'context_build_failed' | 'planning_failed' | 'task_failed' | 'cancelled' {
  switch (code) {
    case 'PLANNER_EMPTY_PLAN':
    case 'PLANNER_SCHEMA_INVALID':
    case 'PLANNER_DEPENDENCY_INVALID':
    case 'PLANNER_CIRCULAR_DEPENDENCY':
      return 'planning_failed';
    case 'OPENROUTER_CONFIG_MISSING_API_KEY':
    case 'FIRECRAWL_CONFIG_MISSING_API_KEY':
    case 'APIFY_CONFIG_MISSING_API_TOKEN':
    case 'CLOUDFLARE_CONFIG_MISSING_API_TOKEN':
    case 'CLOUDFLARE_CONFIG_MISSING_ACCOUNT_ID':
    case 'CLOUDFLARE_CONFIG_MISSING_CUSTOMER_CODE':
    case 'RUNWAY_CONFIG_MISSING_API_KEY':
    case 'FFMPEG_MCP_CONFIG_MISSING_URL':
    case 'CHART_MCP_CONFIG_MISSING_URL':
    case 'GOOGLE_WORKSPACE_CONFIG_INVALID':
    case 'MICROSOFT_365_CONFIG_INVALID':
    case 'FIREBASE_MCP_CONFIG_INVALID':
    case 'LIVE_VIEW_CONFIG_MISSING_API_KEY':
    case 'STORAGE_CONFIG_MISSING_BUCKET':
    case 'AGENT_DEPENDENCY_MISSING':
    case 'AGENT_SERVICE_UNAVAILABLE':
      return 'context_build_failed';
    case 'AGENT_NOT_REGISTERED':
      return 'routing_failed';
    default:
      return 'task_failed';
  }
}
