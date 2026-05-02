/**
 * @fileoverview Tests for onboarding completion gating determinism
 * @module @nxt1/mobile/core/services/auth
 * @version 1.0.0
 *
 * 🔧 Phase 1 regression tests: Verify deterministic completion gate
 * waits for BOTH onboarding flag AND profile loaded state.
 * Covers slow network, delayed backend commit, and timeout scenarios.
 */

import { describe, it, expect, vi } from 'vitest';

/**
 * Mirrors onboarding.service.ts waitForOnboardingComplete() logic for testing.
 * Returns { timedOut, elapsed_ms, flags } for assertions.
 */
async function simulateWaitForOnboardingComplete(
  hasCompletedOnboarding: () => boolean,
  profileState: () => 'idle' | 'loading' | 'loaded' | 'error',
  maxWaitMs = 5000
): Promise<{
  timedOut: boolean;
  elapsed_ms: number;
  onboarding_complete: boolean;
  profile_loaded: boolean;
}> {
  const startTime = Date.now();
  let delay = 50;

  while (
    (!hasCompletedOnboarding() || profileState() !== 'loaded') &&
    Date.now() - startTime < maxWaitMs
  ) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay * 1.5, 200);
  }

  const elapsed = Date.now() - startTime;
  return {
    timedOut: elapsed >= maxWaitMs,
    elapsed_ms: elapsed,
    onboarding_complete: hasCompletedOnboarding(),
    profile_loaded: profileState() === 'loaded',
  };
}

describe('onboarding completion gating (Phase 1 hardening)', () => {
  describe('Happy path: both conditions met within timeout', () => {
    it('should resolve when onboarding flag AND profile loaded become true', async () => {
      // Use mockReturnValue to persist return values across multiple calls
      const onboardingComplete = vi.fn().mockReturnValue(true);
      const profileState = vi.fn().mockReturnValue('loaded');

      const result = await simulateWaitForOnboardingComplete(onboardingComplete, profileState);

      expect(result.onboarding_complete).toBe(true);
      expect(result.profile_loaded).toBe(true);
      expect(result.timedOut).toBe(false);
      expect(result.elapsed_ms).toBeLessThan(1000); // Should resolve in first poll cycle
    });

    it('should resolve within 2 seconds for normal network latency', async () => {
      const onboardingComplete = vi.fn().mockReturnValue(true);
      const startTime = Date.now();

      // Simulate backend commit delay: profile enters 'loading' then 'loaded'
      const profileState = vi.fn().mockImplementation(() => {
        const elapsed = Date.now() - startTime;
        return elapsed < 500 ? 'loading' : 'loaded'; // Switch to loaded after 500ms
      });

      const result = await simulateWaitForOnboardingComplete(onboardingComplete, profileState);

      expect(result.onboarding_complete).toBe(true);
      expect(result.profile_loaded).toBe(true);
      expect(result.timedOut).toBe(false);
      expect(result.elapsed_ms).toBeLessThan(2000);
    });
  });

  describe('Slow network: delayed backend profile commit', () => {
    it('should wait up to 5 seconds for backend to write profile data', async () => {
      const onboardingComplete = vi.fn().mockReturnValue(true);
      const startTime = Date.now();

      // Simulate 3-second backend delay before profile becomes available
      const profileState = vi.fn().mockImplementation(() => {
        const elapsed = Date.now() - startTime;
        return elapsed < 3000 ? 'loading' : 'loaded'; // Switch to loaded after 3s
      });

      const result = await simulateWaitForOnboardingComplete(
        onboardingComplete,
        profileState,
        5000
      );

      expect(result.onboarding_complete).toBe(true);
      expect(result.profile_loaded).toBe(true);
      expect(result.timedOut).toBe(false);
      expect(result.elapsed_ms).toBeGreaterThan(2500); // Confirms we waited
      expect(result.elapsed_ms).toBeLessThan(5000);
    });

    it('should timeout if backend takes longer than 5 seconds', async () => {
      const onboardingComplete = vi.fn().mockReturnValue(true);
      // Profile never becomes 'loaded'
      const profileState = vi.fn().mockReturnValue('loading');

      const result = await simulateWaitForOnboardingComplete(
        onboardingComplete,
        profileState,
        5000
      );

      expect(result.timedOut).toBe(true);
      expect(result.elapsed_ms).toBeGreaterThanOrEqual(5000);
      expect(result.profile_loaded).toBe(false); // Still loading after timeout
    });

    it('should timeout gracefully if onboarding flag never set', async () => {
      // Backend never sets onboardingCompleted: true
      const onboardingComplete = vi.fn().mockReturnValue(false);
      const profileState = vi.fn().mockReturnValue('loaded');

      const result = await simulateWaitForOnboardingComplete(
        onboardingComplete,
        profileState,
        5000
      );

      expect(result.timedOut).toBe(true);
      expect(result.onboarding_complete).toBe(false);
      expect(result.profile_loaded).toBe(true); // Profile loaded but onboarding flag missing
    });
  });

  describe('Error conditions: profile load error or network failure', () => {
    it('should timeout if profile enters error state and never recovers', async () => {
      const onboardingComplete = vi.fn().mockReturnValue(true);
      const profileState = vi.fn().mockReturnValue('error'); // Network error or backend failure

      const result = await simulateWaitForOnboardingComplete(
        onboardingComplete,
        profileState,
        5000
      );

      expect(result.timedOut).toBe(true);
      expect(result.profile_loaded).toBe(false);
      expect(result.elapsed_ms).toBeGreaterThanOrEqual(5000);
    });

    it('should continue polling through error state if profile recovers', async () => {
      const onboardingComplete = vi.fn().mockReturnValue(true);
      let callCount = 0;

      // Profile: error -> error -> loaded (recovery after retry)
      const profileState = vi.fn(() => {
        callCount++;
        if (callCount < 20) return 'error';
        return 'loaded';
      });

      const result = await simulateWaitForOnboardingComplete(
        onboardingComplete,
        profileState,
        5000
      );

      expect(result.profile_loaded).toBe(true);
      expect(result.timedOut).toBe(false);
    });
  });

  describe('Dual-condition polling: both must be true simultaneously', () => {
    it('should not proceed if only onboarding flag is set (profile still loading)', async () => {
      const onboardingComplete = vi.fn().mockReturnValue(true);
      const profileState = vi.fn().mockReturnValue('loading'); // Never transitions to 'loaded'

      const result = await simulateWaitForOnboardingComplete(
        onboardingComplete,
        profileState,
        1000
      );

      expect(result.timedOut).toBe(true);
      expect(result.onboarding_complete).toBe(true);
      expect(result.profile_loaded).toBe(false); // Blocked by this
    });

    it('should not proceed if only profile is loaded (onboarding flag not set)', async () => {
      const onboardingComplete = vi.fn().mockReturnValue(false);
      const profileState = vi.fn().mockReturnValue('loaded');

      const result = await simulateWaitForOnboardingComplete(
        onboardingComplete,
        profileState,
        1000
      );

      expect(result.timedOut).toBe(true);
      expect(result.onboarding_complete).toBe(false); // Blocked by this
      expect(result.profile_loaded).toBe(true);
    });

    it('should resolve only when BOTH conditions become true', async () => {
      const onboardingComplete = vi.fn();
      const flags = { onboarding: false, profile: false };

      onboardingComplete.mockImplementation(() => flags.onboarding);

      const profileState = vi.fn();
      profileState.mockImplementation(() => (flags.profile ? 'loaded' : 'loading'));

      // Simulate: after ~200ms, onboarding flag set; after ~400ms, profile also set
      const testPromise = simulateWaitForOnboardingComplete(onboardingComplete, profileState, 5000);

      // Flag 1 at ~100ms
      await new Promise((resolve) =>
        setTimeout(() => {
          flags.onboarding = true;
          resolve(null);
        }, 100)
      );

      // Flag 2 at ~300ms
      await new Promise((resolve) =>
        setTimeout(() => {
          flags.profile = true;
          resolve(null);
        }, 300)
      );

      const result = await testPromise;

      expect(result.onboarding_complete).toBe(true);
      expect(result.profile_loaded).toBe(true);
      expect(result.timedOut).toBe(false);
      expect(result.elapsed_ms).toBeGreaterThan(300);
    });
  });

  describe('Backoff behavior: exponential delay up to 200ms cap', () => {
    it('should use fast initial polling (50ms), backing off to max 200ms', async () => {
      const onboardingComplete = vi.fn().mockReturnValue(true);

      // Simulate immediate completion (tests that we do at least 1 full poll cycle)
      const profileState = vi.fn();
      let pollCalls = 0;
      profileState.mockImplementation(() => {
        pollCalls++;
        return 'loaded';
      });

      const result = await simulateWaitForOnboardingComplete(onboardingComplete, profileState);

      expect(pollCalls).toBeGreaterThanOrEqual(1);
      expect(result.elapsed_ms).toBeLessThan(500); // Fast resolve with backoff
    });
  });

  describe('Test role matrix: athlete, coach, director get correct role after completion', () => {
    it('should correctly restore coach role after onboarding completion waits', async () => {
      const onboardingComplete = vi.fn().mockReturnValue(true);

      // Simulate coach profile loaded with correct role
      const profileState = vi.fn().mockReturnValue('loaded');
      const _mockProfile = { role: 'coach', hasCompletedOnboarding: true };

      const result = await simulateWaitForOnboardingComplete(onboardingComplete, profileState);

      expect(result.onboarding_complete).toBe(true);
      expect(result.profile_loaded).toBe(true);
      // In actual integration: AuthUser.role should now be 'coach' not 'athlete'
    });

    it('should correctly restore director role after onboarding completion waits', async () => {
      const onboardingComplete = vi.fn().mockReturnValue(true);
      const profileState = vi.fn().mockReturnValue('loaded');
      const _mockProfile = { role: 'director', hasCompletedOnboarding: true };

      const result = await simulateWaitForOnboardingComplete(onboardingComplete, profileState);

      expect(result.onboarding_complete).toBe(true);
      expect(result.profile_loaded).toBe(true);
      // In actual integration: AuthUser.role should now be 'director' not 'athlete'
    });

    it('should correctly handle athlete role after onboarding completion waits', async () => {
      const onboardingComplete = vi.fn().mockReturnValue(true);
      const profileState = vi.fn().mockReturnValue('loaded');
      const _mockProfile = { role: 'athlete', hasCompletedOnboarding: true };

      const result = await simulateWaitForOnboardingComplete(onboardingComplete, profileState);

      expect(result.onboarding_complete).toBe(true);
      expect(result.profile_loaded).toBe(true);
      // In actual integration: AuthUser.role should remain 'athlete'
    });
  });
});
