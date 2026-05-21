import { describe, expect, it } from 'vitest';

import { shouldStartActivityRealtimeListener } from './activity-realtime-auth-gate';

describe('shouldStartActivityRealtimeListener', () => {
  it('returns false before auth initialization completes', () => {
    expect(
      shouldStartActivityRealtimeListener({
        isAuthInitialized: false,
        appUserId: 'user-123',
        firebaseUserId: 'user-123',
      })
    ).toBe(false);
  });

  it('returns false when the app user exists but Firebase JS auth is still missing', () => {
    expect(
      shouldStartActivityRealtimeListener({
        isAuthInitialized: true,
        appUserId: 'user-123',
        firebaseUserId: null,
      })
    ).toBe(false);
  });

  it('returns false when Firebase JS auth belongs to a different user', () => {
    expect(
      shouldStartActivityRealtimeListener({
        isAuthInitialized: true,
        appUserId: 'user-123',
        firebaseUserId: 'user-456',
      })
    ).toBe(false);
  });

  it('returns true when auth is initialized and both user ids match', () => {
    expect(
      shouldStartActivityRealtimeListener({
        isAuthInitialized: true,
        appUserId: 'user-123',
        firebaseUserId: 'user-123',
      })
    ).toBe(true);
  });
});
