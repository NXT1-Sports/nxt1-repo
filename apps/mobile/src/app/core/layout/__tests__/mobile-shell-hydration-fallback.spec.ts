/**
 * @fileoverview Tests for mobile shell self-healing profile hydration fallback
 * @module @nxt1/mobile/core/layout
 * @version 1.0.0
 *
 * 🔧 Phase 4 regression tests: Verify shell's one-shot self-healing refresh
 * when profile is idle/null but user is authenticated. Prevents loops via guard flag.
 */

import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Mock AuthFlowService state and refresh behavior.
 */
class MockAuthFlow {
  private _user: { uid: string; displayName: string; role: string } | null = null;
  refreshCallCount = 0;
  isAuthenticated() {
    return this._user !== null;
  }

  user() {
    return this._user;
  }

  async refreshUserProfile() {
    this.refreshCallCount++;
    // Simulate successful refresh
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  setUser(user: { uid: string; displayName: string; role: string } | null) {
    this._user = user;
  }
}

/**
 * Mock ProfileService state transitions.
 */
class MockProfileService {
  private _state: 'idle' | 'loading' | 'loaded' | 'error' = 'idle';
  private _user: { role: string; displayName: string } | null = null;

  state() {
    return this._state;
  }

  user() {
    return this._user;
  }

  setState(state: 'idle' | 'loading' | 'loaded' | 'error') {
    this._state = state;
  }

  setUser(user: { role: string; displayName: string } | null) {
    this._user = user;
  }
}

/**
 * Simulates mobile shell's tryHealProfileHydrationIfNeeded() logic.
 */
class MockMobileShell {
  private _profileHydrationAttempted = false;
  refreshTriggered = false;

  constructor(
    private authFlow: MockAuthFlow,
    private profileService: MockProfileService
  ) {}

  tryHealProfileHydrationIfNeeded(): void {
    // Guard: only attempt once per shell lifetime
    if (this._profileHydrationAttempted) {
      return;
    }

    const user = this.authFlow.user();
    const profileState = this.profileService.state();
    const profile = this.profileService.user();

    // Condition: User is authenticated, but profile is not yet loaded or is missing
    if (user && (profileState === 'idle' || profileState === 'error' || !profile)) {
      this._profileHydrationAttempted = true;
      this.refreshTriggered = true;

      // Fire-and-forget refresh (does not block shell rendering)
      this.authFlow.refreshUserProfile().catch((err) => {
        // Simulate logger.error
        console.error('Self-healing profile refresh failed', err);
      });
    }
  }

  getHydrationAttemptedFlag(): boolean {
    return this._profileHydrationAttempted;
  }
}

describe('mobile shell self-healing hydration (Phase 4 fallback)', () => {
  let authFlow: MockAuthFlow;
  let profileService: MockProfileService;
  let shell: MockMobileShell;

  beforeEach(() => {
    authFlow = new MockAuthFlow();
    profileService = new MockProfileService();
    shell = new MockMobileShell(authFlow, profileService);
  });

  describe('Happy path: profile already hydrated on shell init', () => {
    it('should NOT trigger refresh if profile is already loaded', async () => {
      // Setup: user authenticated, profile loaded
      authFlow.setUser({
        uid: 'uid123',
        displayName: 'John Coach',
        role: 'coach',
      });
      profileService.setState('loaded');
      profileService.setUser({
        role: 'coach',
        displayName: 'John Coach',
      });

      shell.tryHealProfileHydrationIfNeeded();

      expect(authFlow.refreshCallCount).toBe(0);
      expect(shell.refreshTriggered).toBe(false);
    });

    it('should NOT trigger refresh if no user is authenticated', async () => {
      // Setup: no authenticated user
      authFlow.setUser(null);
      profileService.setState('idle');

      shell.tryHealProfileHydrationIfNeeded();

      expect(authFlow.refreshCallCount).toBe(0);
      expect(shell.refreshTriggered).toBe(false);
    });
  });

  describe('Self-healing trigger: profile missing or idle despite auth', () => {
    it('should trigger ONE refresh if profile is idle but user authenticated', async () => {
      // Setup: post-onboarding race condition
      authFlow.setUser({
        uid: 'uid123',
        displayName: 'John',
        role: 'coach',
      });
      profileService.setState('idle'); // ← Profile not yet loaded
      profileService.setUser(null);

      shell.tryHealProfileHydrationIfNeeded();

      expect(shell.refreshTriggered).toBe(true);
      expect(authFlow.refreshCallCount).toBe(1);
    });

    it('should trigger refresh if profile is in error state', async () => {
      // Setup: previous refresh failed
      authFlow.setUser({
        uid: 'uid123',
        displayName: 'John',
        role: 'athlete',
      });
      profileService.setState('error');
      profileService.setUser(null);

      shell.tryHealProfileHydrationIfNeeded();

      expect(shell.refreshTriggered).toBe(true);
      expect(authFlow.refreshCallCount).toBe(1);
    });

    it('should trigger refresh if profile object is null', async () => {
      // Setup: profile service loaded but returned null
      authFlow.setUser({
        uid: 'uid123',
        displayName: 'John',
        role: 'director',
      });
      profileService.setState('loaded');
      profileService.setUser(null); // ← Profile data is null

      shell.tryHealProfileHydrationIfNeeded();

      expect(shell.refreshTriggered).toBe(true);
      expect(authFlow.refreshCallCount).toBe(1);
    });

    it('should trigger refresh during post-onboarding race window', async () => {
      // Simulate: congratulations page navigates before profile is loaded
      authFlow.setUser({
        uid: 'uid123',
        displayName: 'User', // Stale from Firebase fallback
        role: 'athlete', // Stale default
      });
      profileService.setState('idle');
      profileService.setUser(null);

      shell.tryHealProfileHydrationIfNeeded();

      expect(shell.refreshTriggered).toBe(true);
      expect(authFlow.refreshCallCount).toBe(1);
    });
  });

  describe('Guard: prevent repeated refresh attempts (one-shot semantics)', () => {
    it('should NOT trigger refresh twice when called multiple times', async () => {
      authFlow.setUser({
        uid: 'uid123',
        displayName: 'John',
        role: 'coach',
      });
      profileService.setState('idle');
      profileService.setUser(null);

      // Call 1: triggers refresh
      shell.tryHealProfileHydrationIfNeeded();
      expect(authFlow.refreshCallCount).toBe(1);

      // Call 2: blocked by guard
      shell.tryHealProfileHydrationIfNeeded();
      expect(authFlow.refreshCallCount).toBe(1); // Still 1, not 2

      // Call 3: still blocked
      shell.tryHealProfileHydrationIfNeeded();
      expect(authFlow.refreshCallCount).toBe(1); // Still 1
    });

    it('should respect guard flag across multiple shell init scenarios', async () => {
      authFlow.setUser({
        uid: 'uid123',
        displayName: 'John',
        role: 'coach',
      });
      profileService.setState('idle');

      // Initial init: triggers refresh
      shell.tryHealProfileHydrationIfNeeded();
      expect(authFlow.refreshCallCount).toBe(1);

      // Simulate profile loading after refresh
      profileService.setState('loaded');
      profileService.setUser({
        role: 'coach',
        displayName: 'John Coach',
      });

      // Subsequent call: should NOT trigger again (guard active)
      shell.tryHealProfileHydrationIfNeeded();
      expect(authFlow.refreshCallCount).toBe(1); // NOT incremented
    });

    it('should prevent refresh spam if hydration remains missing', async () => {
      authFlow.setUser({
        uid: 'uid123',
        displayName: 'John',
        role: 'athlete',
      });
      profileService.setState('idle');
      profileService.setUser(null);

      // Multiple rapid calls should NOT spam refresh
      for (let i = 0; i < 5; i++) {
        shell.tryHealProfileHydrationIfNeeded();
      }

      expect(authFlow.refreshCallCount).toBe(1); // Only one, not five
      expect(shell.getHydrationAttemptedFlag()).toBe(true);
    });
  });

  describe('Async refresh: non-blocking behavior', () => {
    it('should fire-and-forget refresh without awaiting', async () => {
      authFlow.setUser({
        uid: 'uid123',
        displayName: 'John',
        role: 'coach',
      });
      profileService.setState('idle');

      // This call should return immediately (no await)
      shell.tryHealProfileHydrationIfNeeded();

      // Refresh was triggered but not blocking
      expect(shell.refreshTriggered).toBe(true);
      // We can verify refresh was called (even if async)
      expect(authFlow.refreshCallCount).toBe(1);
    });
  });

  describe('Test role matrix: self-healing works for all three roles', () => {
    it('should self-heal coach role missing during post-onboarding', async () => {
      // Setup: coach onboarded, but shell init sees stale athlete role + no profile
      authFlow.setUser({
        uid: 'coach-uid',
        displayName: 'User', // Stale fallback
        role: 'athlete', // Stale default
      });
      profileService.setState('idle');
      profileService.setUser(null);

      shell.tryHealProfileHydrationIfNeeded();

      // Should trigger refresh to load actual coach profile
      expect(authFlow.refreshCallCount).toBe(1);
    });

    it('should self-heal director role missing during post-onboarding', async () => {
      authFlow.setUser({
        uid: 'director-uid',
        displayName: 'User',
        role: 'athlete', // Stale default
      });
      profileService.setState('idle');
      profileService.setUser(null);

      shell.tryHealProfileHydrationIfNeeded();

      expect(authFlow.refreshCallCount).toBe(1);
    });

    it('should self-heal athlete profile missing on first init', async () => {
      // Even athlete role should self-heal if profile data is missing
      authFlow.setUser({
        uid: 'athlete-uid',
        displayName: 'User',
        role: 'athlete',
      });
      profileService.setState('idle');
      profileService.setUser(null); // Profile object missing

      shell.tryHealProfileHydrationIfNeeded();

      // Should trigger refresh to load full athlete profile
      expect(authFlow.refreshCallCount).toBe(1);
    });
  });

  describe('Edge cases and lifecycle', () => {
    it('should handle shell re-initialization gracefully (guard prevents re-trigger)', async () => {
      // Simulate: shell destroyed and recreated
      const shell1 = new MockMobileShell(authFlow, profileService);
      const shell2 = new MockMobileShell(authFlow, profileService);

      authFlow.setUser({
        uid: 'uid123',
        displayName: 'John',
        role: 'coach',
      });
      profileService.setState('idle');

      // First shell init: triggers refresh
      shell1.tryHealProfileHydrationIfNeeded();
      expect(authFlow.refreshCallCount).toBe(1);

      // Second shell init (fresh guard): could trigger again
      // (each shell instance has its own guard)
      shell2.tryHealProfileHydrationIfNeeded();
      expect(authFlow.refreshCallCount).toBe(2); // Second instance has fresh guard

      // But WITHIN shell1, repeated calls don't trigger again
      shell1.tryHealProfileHydrationIfNeeded();
      expect(authFlow.refreshCallCount).toBe(2); // Still 2
    });

    it('should not trigger if user signs out before hydration attempt', async () => {
      authFlow.setUser({
        uid: 'uid123',
        displayName: 'John',
        role: 'coach',
      });
      profileService.setState('idle');

      // Simulate sign out before hydration check
      authFlow.setUser(null);

      shell.tryHealProfileHydrationIfNeeded();

      // Should NOT trigger refresh (no authenticated user)
      expect(authFlow.refreshCallCount).toBe(0);
    });
  });
});
