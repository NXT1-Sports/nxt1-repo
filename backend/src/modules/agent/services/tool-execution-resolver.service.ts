import type { AgentIdentifier, AgentToolDefinition } from '@nxt1/core';
import {
  getToolCapabilityPolicy,
  isToolAllowedByPatterns,
  type ToolCapabilityPolicy,
} from '../agents/tool-policy.js';

const DEFAULT_DIRECT_READ_CATEGORIES = new Set(['database', 'analytics', 'compliance', 'data']);

export type ToolExecutionDecisionKind =
  | 'direct'
  | 'direct_with_approval'
  | 'background_required'
  | 'specialist_preferred'
  | 'blocked';

export interface ToolExecutionDecision {
  readonly kind: ToolExecutionDecisionKind;
  readonly reason: string;
  readonly capability?: ToolCapabilityPolicy;
  readonly specialist?: Exclude<AgentIdentifier, 'router'>;
}

export interface ResolveToolExecutionDecisionInput {
  readonly activeAgentId: AgentIdentifier;
  readonly toolName: string;
  readonly tool?: Pick<
    AgentToolDefinition,
    'name' | 'category' | 'isMutation' | 'entityGroup' | 'allowedAgents'
  >;
  readonly policyAllowedToolNames: readonly string[];
  readonly executionMode?: 'execute' | 'plan';
}

export function resolveToolExecutionDecision(
  input: ResolveToolExecutionDecisionInput
): ToolExecutionDecision {
  const capability = getToolCapabilityPolicy(input.toolName);

  if (input.executionMode === 'plan' && input.tool?.isMutation) {
    return {
      kind: 'blocked',
      reason: 'Plan mode is review-only and cannot execute mutation tools.',
      ...(capability ? { capability } : {}),
    };
  }

  const policyAllowsTool = isToolAllowedByPatterns(input.toolName, input.policyAllowedToolNames);
  if (policyAllowsTool) {
    return {
      kind: capability?.requiresApproval ? 'direct_with_approval' : 'direct',
      reason: 'Tool is allowed by the active agent policy.',
      ...(capability ? { capability } : {}),
    };
  }

  if (!capability && input.tool && isDefaultDirectReadTool(input.tool)) {
    return {
      kind: 'direct',
      reason: 'Non-mutating read-like tools are directly executable by default after entity access filtering.',
    };
  }

  if (!capability) {
    return {
      kind: 'blocked',
      reason: 'Tool is not in the active agent policy and has no capability override.',
    };
  }

  if (capability.requiresBackgroundExecution) {
    return {
      kind: 'background_required',
      reason: capability.notes,
      capability,
      ...(capability.preferredSpecialists[0]
        ? { specialist: capability.preferredSpecialists[0] }
        : {}),
    };
  }

  if (capability.requiresSpecialistContext) {
    return {
      kind: 'specialist_preferred',
      reason: capability.notes,
      capability,
      ...(capability.preferredSpecialists[0]
        ? { specialist: capability.preferredSpecialists[0] }
        : {}),
    };
  }

  if (capability.directCallableByDefault) {
    return {
      kind: capability.requiresApproval ? 'direct_with_approval' : 'direct',
      reason: capability.notes,
      capability,
    };
  }

  return {
    kind: 'blocked',
    reason: capability.notes,
    capability,
  };
}

export function canExposeToolSchemaForActiveAgent(
  input: ResolveToolExecutionDecisionInput
): boolean {
  const decision = resolveToolExecutionDecision(input);
  return decision.kind === 'direct' || decision.kind === 'direct_with_approval';
}

function isDefaultDirectReadTool(
  tool: Pick<AgentToolDefinition, 'category' | 'isMutation'>
): boolean {
  return !tool.isMutation && typeof tool.category === 'string' && DEFAULT_DIRECT_READ_CATEGORIES.has(tool.category);
}