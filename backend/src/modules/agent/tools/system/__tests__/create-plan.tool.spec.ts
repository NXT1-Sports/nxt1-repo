import { describe, expect, it } from 'vitest';
import { CreatePlanTool } from '../create-plan.tool.js';
import {
  isPlanAndExecute,
  PlanAndExecuteException,
} from '../../../exceptions/plan-and-execute.exception.js';

describe('CreatePlanTool', () => {
  const tool = new CreatePlanTool();

  it('exposes expected metadata and allowed agent restriction', () => {
    expect(tool.name).toBe('create_plan');
    expect(tool.category).toBe('system');
    expect(tool.isMutation).toBe(false);
    expect(tool.allowedAgents).toEqual(['router']);
  });

  it('throws PlanAndExecuteException for valid input', async () => {
    const goal = 'Draft a saved execution plan for outreach, media, and recruiting follow-up';

    await expect(tool.execute({ goal })).rejects.toThrow(PlanAndExecuteException);

    try {
      await tool.execute({ goal });
    } catch (err) {
      expect(isPlanAndExecute(err)).toBe(true);
      const plan = err as PlanAndExecuteException;
      expect(plan.payload.goal).toBe(goal);
    }
  });

  it('returns validation errors for invalid input', async () => {
    const missingGoal = await tool.execute({});
    expect(missingGoal.success).toBe(false);
    expect(missingGoal.error).toContain('goal');
  });
});
