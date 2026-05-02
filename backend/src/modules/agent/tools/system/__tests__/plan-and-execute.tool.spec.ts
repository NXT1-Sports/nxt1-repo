import { describe, it, expect } from 'vitest';
import { PlanAndExecuteTool } from '../plan-and-execute.tool.js';
import {
  PlanAndExecuteException,
  isPlanAndExecute,
} from '../../../exceptions/plan-and-execute.exception.js';

describe('PlanAndExecuteTool', () => {
  const tool = new PlanAndExecuteTool();

  it('exposes expected metadata and allowed agent restriction', () => {
    expect(tool.name).toBe('plan_and_execute');
    expect(tool.category).toBe('system');
    expect(tool.isMutation).toBe(false);
    expect(tool.allowedAgents).toEqual(['router']);
  });

  it('throws PlanAndExecuteException for valid input', async () => {
    const goal = 'Build and execute a multi-coordinator recruiting campaign for spring showcases';

    await expect(tool.execute({ goal })).rejects.toThrow(PlanAndExecuteException);

    try {
      await tool.execute({ goal });
    } catch (err) {
      expect(isPlanAndExecute(err)).toBe(true);
      const plan = err as PlanAndExecuteException;
      expect(plan.payload.goal).toBe(goal);
    }
  });

  it('returns param validation errors for invalid input', async () => {
    const missingGoal = await tool.execute({});
    expect(missingGoal.success).toBe(false);
    expect(missingGoal.error).toContain('goal');

    const emptyGoal = await tool.execute({ goal: '' });
    expect(emptyGoal.success).toBe(false);
    expect(emptyGoal.error).toContain('goal');
  });
});
