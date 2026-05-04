/**
 * @fileoverview Plan-and-Execute Tool — Multi-Step DAG Orchestration
 * @module @nxt1/backend/modules/agent/tools/system
 *
 * Used exclusively by the Primary Agent when the requested work requires
 * multi-step orchestration across multiple coordinators with dependencies
 * (e.g., "build a recruiting playbook with personalized emails and a
 * media kit"). Throws a {@link PlanAndExecuteException} which the Primary's
 * tool-execution wrapper intercepts to invoke the existing PlannerAgent +
 * AgentRouterExecutionService pipeline.
 *
 * For single-coordinator work, use `delegate_to_coordinator` instead — it's
 * faster and skips the planning round-trip.
 */

import { z } from 'zod';
import type { AgentToolCategory } from '@nxt1/core';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import { PlanAndExecuteException } from '../../exceptions/plan-and-execute.exception.js';

const InputSchema = z.object({
  goal: z.string().trim().min(1).max(4_000),
});

export class PlanAndExecuteTool extends BaseTool {
  readonly name = 'plan_and_execute';

  readonly description =
    'Legacy alias for `create_plan`. Build a saved multi-step plan across specialist ' +
    'coordinators, then wait for explicit user approval before any execution begins. ' +
    'For a single coordinator’s work, prefer `delegate_to_coordinator`. For one-shot ' +
    'tasks, call the underlying tool directly.';

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

    throw new PlanAndExecuteException({ goal: parsed.data.goal });
  }
}
