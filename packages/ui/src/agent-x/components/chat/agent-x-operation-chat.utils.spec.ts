import { describe, expect, it } from 'vitest';
import {
  buildCoordinatorActionPrompt,
  resolveCoordinatorActionId,
  resolveCoordinatorChipId,
} from './agent-x-operation-chat.utils';

describe('resolveCoordinatorActionId', () => {
  it('recognizes backend coordinator ids used by the desktop dashboard', () => {
    expect(resolveCoordinatorActionId('admin_coordinator')).toBe('admin_coordinator');
    expect(resolveCoordinatorActionId('recruiting_coordinator')).toBe('recruiting_coordinator');
  });

  it('falls back to selectedAction coordinator ids for generated coordinator chips', () => {
    expect(
      resolveCoordinatorActionId({
        id: 'strategy-suggested-1',
        selectedAction: {
          coordinatorId: 'strategy_coordinator',
          actionId: 'strategy-suggested-1',
          surface: 'suggested',
        },
      })
    ).toBe('strategy_coordinator');
  });

  it('keeps existing coord-prefixed coordinator ids compatible', () => {
    expect(resolveCoordinatorActionId('coord-admin')).toBe('coord-admin');
    expect(resolveCoordinatorActionId('coord-coord-admin')).toBe('coord-admin');
  });

  it('ignores normal command quick actions', () => {
    expect(resolveCoordinatorActionId('cmd-draft-outreach')).toBeNull();
  });
});

describe('resolveCoordinatorChipId', () => {
  it('maps backend coordinator ids to coordinator chip styles', () => {
    expect(resolveCoordinatorChipId('admin_coordinator')).toBe('coord-admin');
    expect(resolveCoordinatorChipId('performance_coordinator')).toBe('coord-performance');
  });

  it('preserves existing coordinator chip ids', () => {
    expect(resolveCoordinatorChipId('coord-prospect-search')).toBe('coord-prospect-search');
  });
});

describe('buildCoordinatorActionPrompt', () => {
  it('expands command chips into a sentence-style prompt', () => {
    expect(
      buildCoordinatorActionPrompt({
        coordinatorLabel: 'Admin Coordinator',
        coordinatorDescription: 'Keep executive operations aligned and on time.',
        actionLabel: 'Executive Deadline Radar',
        actionDescription: 'Surface the deadlines and milestones that need attention',
        surface: 'command',
      })
    ).toBe(
      'Please handle Executive Deadline Radar with the Admin Coordinator. Surface the deadlines and milestones that need attention. Give me the clearest deliverable, priorities, and next steps to act on immediately.'
    );
  });

  it('expands scheduled chips into a recurring workflow request', () => {
    expect(
      buildCoordinatorActionPrompt({
        coordinatorLabel: 'Strategy Coordinator',
        coordinatorDescription: 'Build game plans and execution strategy.',
        actionLabel: 'Weekly Program Game Plan',
        actionDescription: undefined,
        surface: 'scheduled',
      })
    ).toBe(
      'Please handle Weekly Program Game Plan with the Strategy Coordinator and frame it as a recurring workflow for me. Build game plans and execution strategy. Give me the execution plan, timing, checkpoints, and follow-up actions I should run with.'
    );
  });
});
