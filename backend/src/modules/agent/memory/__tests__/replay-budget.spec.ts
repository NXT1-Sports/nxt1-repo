import { describe, expect, it } from 'vitest';
import { resolveThreadReplayMaxTokens, THREAD_REPLAY_BUDGETS } from '../replay-budget.js';

describe('resolveThreadReplayMaxTokens', () => {
  it('uses the default replay budget for ordinary chat turns', () => {
    expect(resolveThreadReplayMaxTokens({ intent: 'Build a recruiting plan' })).toBe(
      THREAD_REPLAY_BUDGETS.defaultMaxTokens
    );
  });

  it('uses the compact replay budget for explicit video attachments', () => {
    expect(
      resolveThreadReplayMaxTokens({
        intent: 'Make a highlight reel',
        videoAttachments: [{ url: 'https://cdn.example.com/source.mp4' }],
      })
    ).toBe(THREAD_REPLAY_BUDGETS.mediaMaxTokens);
  });

  it('uses the compact replay budget for video intent text', () => {
    expect(
      resolveThreadReplayMaxTokens({
        intent:
          'Analyze this game film [Attached video: source.mp4 - https://cdn.example.com/source.mp4]',
      })
    ).toBe(THREAD_REPLAY_BUDGETS.mediaMaxTokens);
  });
});
