/**
 * @fileoverview Delegate Task Tool — Universal Cross-Agent Handoff
 * @module @nxt1/backend/modules/agent/tools/system
 *
 * This tool is available to EVERY sub-agent (`allowedAgents: ['*']`).
 * When an agent determines the user's request is outside its domain,
 * it calls this tool to hand off the intent to the Chief of Staff
 * (PlannerAgent) for proper routing to the correct coordinator.
 *
 * The tool does NOT return a normal result. Instead it throws an
 * `AgentDelegationException` — a control-flow signal that immediately
 * aborts the current agent's ReAct loop. The AgentRouter catches this
 * exception and re-dispatches the intent through the full planning flow.
 *
 * @example
 * LLM decides it cannot handle "Email 5 D3 coaches":
 *   → calls delegate_task({ forwarding_intent: "Email 5 D3 coaches in Ohio" })
 *   → tool throws AgentDelegationException
 *   → AgentRouter catches, strips payload.agent, re-runs via PlannerAgent
 *   → PlannerAgent routes to recruiting_coordinator
 */

import type { AgentIdentifier, AgentToolCategory } from '@nxt1/core';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import { AgentDelegationException } from '../../exceptions/agent-delegation.exception.js';

export class DelegateTaskTool extends BaseTool {
  readonly name = 'delegate_task';

  readonly description =
    'Hand off a request to a different specialist agent when the current task ' +
    'is outside your domain. Use this when the user asks you to do something ' +
    'you are not equipped to handle (e.g., a media agent asked to send emails). ' +
    "Provide the user's exact request so the correct specialist can take over.";

  readonly parameters = {
    type: 'object',
    properties: {
      forwarding_intent: {
        type: 'string',
        description:
          "The user's original request that should be forwarded to the correct specialist. " +
          "Copy the user's words as closely as possible — do not summarize or interpret.",
      },
    },
    required: ['forwarding_intent'],
    additionalProperties: false,
  };

  readonly isMutation = false;
  readonly category: AgentToolCategory = 'system';

  /** Available to every sub-agent — this is the universal escape hatch. */
  override readonly allowedAgents: readonly (AgentIdentifier | '*')[] = ['*'];

  /**
   * This method intentionally throws instead of returning a ToolResult.
   * The AgentDelegationException is a control-flow signal that aborts the
   * current ReAct loop and tells the AgentRouter to re-plan via the
   * PlannerAgent.
   */
  async execute(
    input: Record<string, unknown>,
    _context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const forwardingIntent = this.str(input, 'forwarding_intent');
    if (!forwardingIntent) {
      return this.paramError('forwarding_intent');
    }

    // sourceAgent is set to a placeholder here. The BaseAgent.executeTool()
    // re-throws this exception and the AgentRouter identifies the source
    // agent from its own execution context (directAgent.id).
    throw new AgentDelegationException({
      forwardingIntent,
      sourceAgent: 'delegate_task_tool',
    });
  }
}
