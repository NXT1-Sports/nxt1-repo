import { describe, expect, it } from 'vitest';
import { ExecuteSavedPlanTool } from '../execute-saved-plan.tool.js';
import {
  ExecuteSavedPlanException,
  isExecuteSavedPlan,
} from '../../../exceptions/execute-saved-plan.exception.js';

describe('ExecuteSavedPlanTool', () => {
  const tool = new ExecuteSavedPlanTool();

  it('exposes expected metadata and allowed agent restriction', () => {
    expect(tool.name).toBe('execute_saved_plan');
    expect(tool.category).toBe('system');
    expect(tool.isMutation).toBe(true);
    expect(tool.allowedAgents).toEqual(['router']);
  });

  it('throws ExecuteSavedPlanException for valid input', async () => {
    const planId = 'plan_operation-123';

    await expect(tool.execute({ planId })).rejects.toThrow(ExecuteSavedPlanException);

    try {
      await tool.execute({ planId });
    } catch (err) {
      expect(isExecuteSavedPlan(err)).toBe(true);
      const execution = err as ExecuteSavedPlanException;
      expect(execution.payload.planId).toBe(planId);
    }
  });

  it('returns validation errors for invalid input', async () => {
    const missingPlanId = await tool.execute({});
    expect(missingPlanId.success).toBe(false);
    expect(missingPlanId.error).toContain('planId');
  });
});
