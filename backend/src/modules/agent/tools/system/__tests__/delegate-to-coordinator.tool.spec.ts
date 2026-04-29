import { describe, it, expect } from 'vitest';
import { DelegateToCoordinatorTool } from '../delegate-to-coordinator.tool.js';
import {
  DelegateToCoordinatorException,
  isDelegateToCoordinator,
} from '../../../exceptions/delegate-to-coordinator.exception.js';

describe('DelegateToCoordinatorTool', () => {
  const tool = new DelegateToCoordinatorTool();

  it('exposes expected metadata and allowed agent restriction', () => {
    expect(tool.name).toBe('delegate_to_coordinator');
    expect(tool.category).toBe('system');
    expect(tool.isMutation).toBe(false);
    expect(tool.allowedAgents).toEqual(['router']);
  });

  it('throws DelegateToCoordinatorException for valid input', async () => {
    await expect(
      tool.execute({
        coordinator: 'recruiting_coordinator',
        goal: 'Send 20 recruiting emails to Texas D2 coaches',
      })
    ).rejects.toThrow(DelegateToCoordinatorException);

    try {
      await tool.execute({
        coordinator: 'recruiting_coordinator',
        goal: 'Send 20 recruiting emails to Texas D2 coaches',
      });
    } catch (err) {
      expect(isDelegateToCoordinator(err)).toBe(true);
      const delegation = err as DelegateToCoordinatorException;
      expect(delegation.payload.coordinatorId).toBe('recruiting_coordinator');
      expect(delegation.payload.goal).toBe('Send 20 recruiting emails to Texas D2 coaches');
    }
  });

  it('returns param validation errors for invalid input', async () => {
    const resultMissingGoal = await tool.execute({ coordinator: 'recruiting_coordinator' });
    expect(resultMissingGoal.success).toBe(false);
    expect(resultMissingGoal.error).toContain('goal');

    const resultInvalidCoordinator = await tool.execute({
      coordinator: 'not_a_real_coordinator',
      goal: 'Do something',
    });
    expect(resultInvalidCoordinator.success).toBe(false);
    expect(resultInvalidCoordinator.error).toContain('coordinator');
  });
});
