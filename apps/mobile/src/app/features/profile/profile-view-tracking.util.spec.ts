import { describe, expect, it } from 'vitest';

import { shouldTrackProfileView } from './profile-view-tracking.util';

describe('shouldTrackProfileView', () => {
  it('skips explicit own-profile views', () => {
    expect(
      shouldTrackProfileView({
        explicitIsOwnProfile: true,
        viewedUserId: 'user_1',
        authUserId: 'user_1',
        firebaseUserId: 'user_1',
        isAuthenticated: true,
      })
    ).toBe(false);
  });

  it('skips profile views when the fetched profile matches the authenticated user', () => {
    expect(
      shouldTrackProfileView({
        explicitIsOwnProfile: false,
        viewedUserId: 'user_1',
        authUserId: 'user_1',
        firebaseUserId: null,
        isAuthenticated: true,
      })
    ).toBe(false);
  });

  it('skips tracking during authenticated hydration gaps', () => {
    expect(
      shouldTrackProfileView({
        explicitIsOwnProfile: false,
        viewedUserId: 'user_2',
        authUserId: null,
        firebaseUserId: null,
        isAuthenticated: true,
      })
    ).toBe(false);
  });

  it('allows anonymous public-profile views', () => {
    expect(
      shouldTrackProfileView({
        explicitIsOwnProfile: false,
        viewedUserId: 'user_2',
        authUserId: null,
        firebaseUserId: null,
        isAuthenticated: false,
      })
    ).toBe(true);
  });

  it('allows authenticated views of another profile', () => {
    expect(
      shouldTrackProfileView({
        explicitIsOwnProfile: false,
        viewedUserId: 'user_2',
        authUserId: 'user_1',
        firebaseUserId: 'user_1',
        isAuthenticated: true,
      })
    ).toBe(true);
  });
});
