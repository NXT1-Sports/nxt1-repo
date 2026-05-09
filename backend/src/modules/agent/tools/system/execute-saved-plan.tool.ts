import { z } from 'zod';
import type { AgentToolCategory } from '@nxt1/core';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';
import { ExecuteSavedPlanException } from '../../exceptions/execute-saved-plan.exception.js';

const InputSchema = z.object({
  planId: z.string().trim().min(1).max(256),
});

export class ExecuteSavedPlanTool extends BaseTool {
  readonly name = 'execute_saved_plan';

  readonly description =
    'Execute a previously saved and user-approved execution plan by plan ID. ' +
    'This is primarily used by the router after an approval gate resolves.';

  readonly parameters = InputSchema;
  readonly isMutation = true;
  readonly category: AgentToolCategory = 'system';
  readonly entityGroup = 'system_tools' as const;

  override readonly allowedAgents = ['router'] as const;

  async execute(
    input: Record<string, unknown>,
    _context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = InputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    throw new ExecuteSavedPlanException({ planId: parsed.data.planId });
  }
}
