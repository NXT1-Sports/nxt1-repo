import { describe, expect, it } from 'vitest';
import {
  buildOperationChatInputPlaceholder,
  buildCoordinatorActionPrompt,
  collectOperationChatMediaUrlsFromText,
  normalizeOperationChatMediaUrl,
  resolveCoordinatorActionId,
  resolveCoordinatorChipId,
  stripDistilledSectionTransitionLines,
} from './agent-x-operation-chat.utils';

describe('buildOperationChatInputPlaceholder', () => {
  it('defaults command and operation sheets to Agent X', () => {
    expect(buildOperationChatInputPlaceholder()).toBe('Describe what you want to execute');
    expect(buildOperationChatInputPlaceholder('')).toBe('Describe what you want to execute');
    expect(buildOperationChatInputPlaceholder('   ')).toBe('Describe what you want to execute');
  });

  it('uses explicit coordinator recipients only when provided', () => {
    expect(buildOperationChatInputPlaceholder('Recruiting Coordinator')).toBe(
      'Run this with the Recruiting Coordinator'
    );
  });
});

describe('operation chat media URL helpers', () => {
  it('normalizes punctuation and preview time fragments from media URLs', () => {
    expect(normalizeOperationChatMediaUrl('https://cdn.nxt1.test/final.mp4#t=0.001.')).toBe(
      'https://cdn.nxt1.test/final.mp4'
    );
  });

  it('collects media URLs from markdown prose for render dedupe', () => {
    const urls = collectOperationChatMediaUrlsFromText(
      'Animated video: [View Video](https://cdn.nxt1.test/final.mp4)'
    );

    expect([...urls]).toEqual(['https://cdn.nxt1.test/final.mp4']);
  });
});

describe('stripDistilledSectionTransitionLines', () => {
  it('removes accidental distilled-section transition lines from assistant summaries', () => {
    const content = [
      'Identity details loaded; preparing profile updates.',
      '',
      'Sport details loaded; preparing profile updates.',
      '',
      "**Sync complete.** Billy Baca's MaxPreps account has been synced.",
      '',
      '**What was written:**',
      '- Core identity and team details.',
    ].join('\n');

    expect(stripDistilledSectionTransitionLines(content)).toBe(
      [
        "**Sync complete.** Billy Baca's MaxPreps account has been synced.",
        '',
        '**What was written:**',
        '- Core identity and team details.',
      ].join('\n')
    );
  });

  it('preserves normal streamed text unchanged', () => {
    const content = '\n**Sync complete.**\n- Season stats were updated.\n';

    expect(stripDistilledSectionTransitionLines(content)).toBe(content);
  });
});

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
