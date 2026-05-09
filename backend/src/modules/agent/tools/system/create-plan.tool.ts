import { z } from 'zod';
import type { AgentToolCategory } from '@nxt1/core';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';
import { PlanAndExecuteException } from '../../exceptions/plan-and-execute.exception.js';

const InputSchema = z.object({
  goal: z.string().trim().min(1).max(4_000),
});

export class CreatePlanTool extends BaseTool {
  readonly name = 'create_plan';

  readonly description =
    'Create a saved multi-step plan for the user to review before any execution begins. ' +
    'Use this when work spans multiple dependent steps or requires multiple coordinators.';

  readonly parameters = InputSchema;
  readonly isMutation = false;
  readonly category: AgentToolCategory = 'system';
  readonly entityGroup = 'system_tools' as const;

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
