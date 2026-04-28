/**
 * @fileoverview Delegate-to-Coordinator Tool — Primary → Specialist Bridge
 * @module @nxt1/backend/modules/agent/tools/system
 *
 * Used exclusively by the Primary Agent (`router`) to hand a sub-task to
 * one of the specialist coordinators (recruiting, brand, admin, data,
 * performance, strategy). Throws a {@link DelegateToCoordinatorException}
 * which the Primary's tool-execution wrapper intercepts to dispatch the
 * coordinator and feed its output back as the tool observation.
 *
 * Distinct from `delegate_task` — that tool is the universal "out of my
 * domain" escape hatch used by coordinators to re-plan via the Planner.
 * `delegate_to_coordinator` targets a specific specialist directly with
 * no re-planning round-trip.
 */

import { z } from 'zod';
import type { AgentToolCategory } from '@nxt1/core';
import { COORDINATOR_AGENT_IDS } from '@nxt1/core';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import { DelegateToCoordinatorException } from '../../exceptions/delegate-to-coordinator.exception.js';

const InputSchema = z.object({
  coordinator: z.enum(COORDINATOR_AGENT_IDS as readonly [string, ...string[]]),
  goal: z.string().trim().min(1).max(2_000),
});

export class DelegateToCoordinatorTool extends BaseTool {
  readonly name = 'delegate_to_coordinator';

  readonly description =
    'Hand a focused sub-task to a specialist coordinator. Use this when the ' +
    'work falls clearly into one specialist’s domain (recruiting outreach, ' +
    'brand/creative, data analytics, performance, strategy, or admin). For ' +
    'multi-step work that spans coordinators, use `plan_and_execute` instead.';

  readonly parameters = InputSchema;
  readonly isMutation = false;
  readonly category: AgentToolCategory = 'system';
  readonly entityGroup = 'system_tools' as const;

  /** Restricted to the Primary Agent (id=`router`). */
  override readonly allowedAgents = ['router'] as const;

  async execute(
    input: Record<string, unknown>,
    _context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = InputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    throw new DelegateToCoordinatorException({
      coordinatorId: parsed.data.coordinator as Exclude<
        import('@nxt1/core').AgentIdentifier,
        'router'
      >,
      goal: parsed.data.goal,
    });
  }
}
