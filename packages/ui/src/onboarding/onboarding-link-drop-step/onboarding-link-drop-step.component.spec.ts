import { describe, expect, it } from 'vitest';
import { __connectedStateTestUtils } from './onboarding-link-drop-step.component';

describe('resolveConnectedState', () => {
  it('falls back to the single saved sport-scoped connection when the active sport does not match', () => {
    const result = __connectedStateTestUtils.resolveConnectedState('hudl', 'sport', 'football', {
      'hudl::basketball': {
        connected: true,
        scopeType: 'sport',
        scopeId: 'basketball',
        url: 'https://fan.hudl.com/team/basketball',
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        connected: true,
        scopeType: 'sport',
        scopeId: 'basketball',
        url: 'https://fan.hudl.com/team/basketball',
      })
    );
  });

  it('does not guess when multiple saved sport-scoped connections exist for the same platform', () => {
    const result = __connectedStateTestUtils.resolveConnectedState('hudl', 'sport', 'football', {
      'hudl::basketball': {
        connected: true,
        scopeType: 'sport',
        scopeId: 'basketball',
      },
      'hudl::baseball': {
        connected: true,
        scopeType: 'sport',
        scopeId: 'baseball',
      },
    });

    expect(result).toBeUndefined();
  });
});
