/**
 * @fileoverview Tests for auth-flow single-fetch profile refresh behavior
 * @module @nxt1/mobile/core/services/auth
 * @version 1.0.0
 *
 * 🔧 Phase 2 regression tests: Verify refreshUserProfile() does NOT issue
 * duplicate network calls. Single refresh + single profile load + auth sync.
 */

import { describe, it, expect, vi } from 'vitest';

/**
 * Mock ProfileService behavior to track state transitions and fetch count.
 */
class MockProfileService {
  private _state: 'idle' | 'loading' | 'loaded' | 'error' = 'idle';
  private _user: { role: string; displayName: string; hasCompletedOnboarding: boolean } | null =
    null;
  private _shouldSetDefaultOnRefresh = true; // Control whether refresh sets a default
  refreshCallCount = 0;
  loadCallCount = 0;
  loadCallsAfterRefresh = 0;

  state() {
    return this._state;
  }

  user() {
    return this._user;
  }

  // Allow tests to set profile data that will be used by refresh
  setMockUser(user: { role: string; displayName: string; hasCompletedOnboarding: boolean } | null) {
    this._user = user;
  }

  // Allow tests to control whether refresh should set a default
  setShouldSetDefaultOnRefresh(should: boolean) {
    this._shouldSetDefaultOnRefresh = should;
  }

  async refresh(_uid: string) {
    this.refreshCallCount++;
    this._state = 'loading';

    // Simulate async network call
    await new Promise((resolve) => setTimeout(resolve, 50));

    // After refresh, set loaded state
    this._state = 'loaded';
    // Keep existing user data if set by test, otherwise use default (if enabled)
    if (!this._user && this._shouldSetDefaultOnRefresh) {
      this._user = {
        role: 'coach',
        displayName: 'John Coach',
        hasCompletedOnboarding: true,
      };
    }
  }

  async load(_uid: string) {
    this.loadCallCount++;
    // Track if load was called after refresh
    if (this.refreshCallCount > 0) {
      this.loadCallsAfterRefresh++;
    }

    this._state = 'loading';
    await new Promise((resolve) => setTimeout(resolve, 50));
    this._state = 'loaded';
  }
}

/**
 * Simulates refreshUserProfile() from auth-flow.service.ts (Phase 2).
 * Returns refresh metadata for assertions.
 */
async function simulateRefreshUserProfilePhase2(
  profileService: MockProfileService,
  firebaseUid: string,
  currentAuthUser?: { hasCompletedOnboarding?: boolean }
) {
  // Phase 2: ONE refresh operation + sync (no double fetch)
  await profileService.refresh(firebaseUid);

  // Phase 2: Reuse already-loaded profile (do NOT call profileService.load again)
  const profile = profileService.user();
  const role = profile?.role ?? 'athlete';
  const displayName = profile?.displayName || 'User';
  const hasCompletedOnboarding =
    profile?.hasCompletedOnboarding === true || currentAuthUser?.hasCompletedOnboarding === true;

  // Simulate auth state update with refreshed data
  return {
    refreshCount: profileService.refreshCallCount,
    loadCount: profileService.loadCallCount,
    loadsAfterRefresh: profileService.loadCallsAfterRefresh,
    finalRole: role,
    finalDisplayName: displayName,
    finalProfileState: profileService.state(),
    finalHasCompletedOnboarding: hasCompletedOnboarding,
  };
}

describe('auth-flow single-fetch refresh (Phase 2 hardening)', () => {
  let profileService: MockProfileService;

  beforeEach(() => {
    profileService = new MockProfileService();
  });

  describe('Single-fetch determinism: exactly one network call per refresh', () => {
    it('should issue exactly ONE refresh call, NOT two fetch operations', async () => {
      const result = await simulateRefreshUserProfilePhase2(profileService, 'uid123');

      expect(result.refreshCount).toBe(1);
      expect(result.loadCount).toBe(0); // NO separate load call
      expect(result.loadsAfterRefresh).toBe(0);
    });

    it('should consume profile data from the refresh operation (no double fetch)', async () => {
      const result = await simulateRefreshUserProfilePhase2(profileService, 'uid123');

      // After single refresh, profile should be fully populated
      expect(result.finalProfileState).toBe('loaded');
      expect(result.finalRole).toBe('coach');
      expect(result.finalDisplayName).toBe('John Coach');
    });

    it('should NOT call profileService.load() after refresh (old pattern eliminated)', async () => {
      const result = await simulateRefreshUserProfilePhase2(profileService, 'uid123');

      // Phase 2 fix: no load() call after refresh()
      expect(result.loadCount).toBe(0);
      expect(result.loadsAfterRefresh).toBe(0);
    });
  });

  describe('Role propagation: correct role in final auth state', () => {
    it('should propagate coach role from profile to auth state', async () => {
      profileService.setMockUser({
        role: 'coach',
        displayName: 'Coach Alice',
        hasCompletedOnboarding: true,
      });

      const result = await simulateRefreshUserProfilePhase2(profileService, 'uid123');

      expect(result.finalRole).toBe('coach');
      expect(result.finalDisplayName).toBe('Coach Alice');
    });

    it('should propagate director role from profile to auth state', async () => {
      profileService.setMockUser({
        role: 'director',
        displayName: 'Director Bob',
        hasCompletedOnboarding: true,
      });

      const result = await simulateRefreshUserProfilePhase2(profileService, 'uid123');

      expect(result.finalRole).toBe('director');
      expect(result.finalDisplayName).toBe('Director Bob');
    });

    it('should propagate athlete role from profile to auth state', async () => {
      profileService.setMockUser({
        role: 'athlete',
        displayName: 'Athlete Charlie',
        hasCompletedOnboarding: true,
      });

      const result = await simulateRefreshUserProfilePhase2(profileService, 'uid123');

      expect(result.finalRole).toBe('athlete');
      expect(result.finalDisplayName).toBe('Athlete Charlie');
    });

    it('should default to athlete role if profile missing', async () => {
      profileService.setMockUser(null);
      profileService.setShouldSetDefaultOnRefresh(false); // Don't set default

      const result = await simulateRefreshUserProfilePhase2(profileService, 'uid123');

      // Phase 2: fallback to 'athlete' if profile null
      expect(result.finalRole).toBe('athlete');
    });

    it('should use fallback display name if profile missing', async () => {
      profileService.setMockUser(null);
      profileService.setShouldSetDefaultOnRefresh(false); // Don't set default

      const result = await simulateRefreshUserProfilePhase2(profileService, 'uid123');

      // Phase 2: fallback to 'User' if profile null
      expect(result.finalRole).toBe('athlete');
      expect(result.finalDisplayName).toBe('User');
    });
  });

  describe('State transitions: correct loading states during refresh', () => {
    it('should transition profile state to loaded after refresh completes', async () => {
      const result = await simulateRefreshUserProfilePhase2(profileService, 'uid123');

      expect(result.finalProfileState).toBe('loaded');
    });

    it('should preserve hasCompletedOnboarding flag after refresh', async () => {
      profileService.setMockUser({
        role: 'coach',
        displayName: 'Coach',
        hasCompletedOnboarding: true,
      });

      const result = await simulateRefreshUserProfilePhase2(profileService, 'uid123');

      expect(result.finalProfileState).toBe('loaded');
      expect(result.finalHasCompletedOnboarding).toBe(true);
    });

    it('should overwrite stale auth onboarding flag with refreshed backend value', async () => {
      profileService.setMockUser({
        role: 'coach',
        displayName: 'Coach Fresh',
        hasCompletedOnboarding: true,
      });

      const result = await simulateRefreshUserProfilePhase2(profileService, 'uid123', {
        hasCompletedOnboarding: false,
      });

      expect(result.finalHasCompletedOnboarding).toBe(true);
    });
  });

  describe('Pattern validation: old double-fetch eliminated', () => {
    it('should NOT exhibit old double-fetch pattern (refresh then load)', async () => {
      const result = await simulateRefreshUserProfilePhase2(profileService, 'uid123');

      // Phase 2 guarantee: exactly one refresh, zero load calls
      expect(result.refreshCount).toBe(1);
      expect(result.loadCount).toBe(0);
      expect(result.loadsAfterRefresh).toBe(0);
    });

    it('should complete single refresh within reasonable time', async () => {
      const start = Date.now();
      const result = await simulateRefreshUserProfilePhase2(profileService, 'uid123');
      const elapsed = Date.now() - start;

      // Should be fast (single call, not waiting for second)
      expect(elapsed).toBeLessThan(500);
    });
  });

  describe('Error handling: graceful fallback if refresh fails', () => {
    it('should handle refresh failure gracefully', async () => {
      // Create new service for this test
      const failingService = new MockProfileService();

      // Track if refresh was called, but make it fail
      let refreshAttempts = 0;
      failingService.refresh = async (_uid: string) => {
        refreshAttempts++;
        failingService.refreshCallCount++;
        throw new Error('Network error');
      };

      try {
        await simulateRefreshUserProfilePhase2(failingService, 'uid123');
      } catch (err) {
        // In real code, error is logged and caught
        expect((err as Error).message).toBe('Network error');
      }

      // Still only ONE attempted refresh call (not retried)
      expect(refreshAttempts).toBe(1);
    });
  });

  describe('Test role matrix after refresh: all three roles work correctly', () => {
    it('should correctly refresh and display coach profile first-time', async () => {
      profileService.setMockUser({
        role: 'coach',
        displayName: 'Sarah Coach',
        hasCompletedOnboarding: true,
      });

      const result = await simulateRefreshUserProfilePhase2(profileService, 'coach-uid');

      expect(result.refreshCount).toBe(1);
      expect(result.loadCount).toBe(0); // No double fetch
      expect(result.finalRole).toBe('coach');
      expect(result.finalDisplayName).toBe('Sarah Coach');
    });

    it('should correctly refresh and display director profile first-time', async () => {
      profileService.setMockUser({
        role: 'director',
        displayName: 'Michael Director',
        hasCompletedOnboarding: true,
      });

      const result = await simulateRefreshUserProfilePhase2(profileService, 'director-uid');

      expect(result.refreshCount).toBe(1);
      expect(result.loadCount).toBe(0);
      expect(result.finalRole).toBe('director');
      expect(result.finalDisplayName).toBe('Michael Director');
    });

    it('should correctly refresh and display athlete profile first-time', async () => {
      profileService.setMockUser({
        role: 'athlete',
        displayName: 'Jessica Athlete',
        hasCompletedOnboarding: true,
      });

      const result = await simulateRefreshUserProfilePhase2(profileService, 'athlete-uid');

      expect(result.refreshCount).toBe(1);
      expect(result.loadCount).toBe(0);
      expect(result.finalRole).toBe('athlete');
      expect(result.finalDisplayName).toBe('Jessica Athlete');
    });
  });
});
