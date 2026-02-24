/**
 * @fileoverview Auth Guards Unit Tests
 * @module @nxt1/core/auth
 *
 * Comprehensive tests for platform-agnostic auth guard functions.
 * These tests verify route protection logic that works on both web and mobile.
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  requireAuth,
  requireGuest,
  requireRole,
  requirePremium,
  requireOnboarding,
  hasAnyRole,
  isFullyAuthenticated,
  isAuthLoading,
  type AuthGuardOptions,
} from './auth-guards';
import type { UserRole } from './auth.types';
import {
  STATE_FIXTURES,
  USER_FIXTURES,
  createMockAuthState,
  createMockAuthUser,
  resetFixtureCounters,
} from '../testing/auth-fixtures';

describe('Auth Guards', () => {
  beforeEach(() => {
    resetFixtureCounters();
  });

  // ============================================
  // requireAuth
  // ============================================

  describe('requireAuth', () => {
    it('should allow authenticated users', () => {
      const state = STATE_FIXTURES.authenticated;

      const result = requireAuth(state);

      expect(result.allowed).toBe(true);
      expect(result.redirectTo).toBeUndefined();
    });

    it('should deny unauthenticated users', () => {
      const state = STATE_FIXTURES.unauthenticated;

      const result = requireAuth(state);

      expect(result.allowed).toBe(false);
      expect(result.redirectTo).toBe('/auth');
      expect(result.reason).toBe('Not authenticated');
    });

    it('should deny during loading state', () => {
      const state = STATE_FIXTURES.loading;

      const result = requireAuth(state);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Auth state loading');
    });

    it('should use custom login path', () => {
      const state = STATE_FIXTURES.unauthenticated;
      const options: AuthGuardOptions = { loginPath: '/custom-login' };

      const result = requireAuth(state, options);

      expect(result.allowed).toBe(false);
      expect(result.redirectTo).toBe('/custom-login');
    });

    describe('role requirements', () => {
      it('should allow user with required role', () => {
        const state = createMockAuthState({
          user: USER_FIXTURES.coach,
          isInitialized: true,
        });
        const options: AuthGuardOptions = { requiredRoles: ['coach'] };

        const result = requireAuth(state, options);

        expect(result.allowed).toBe(true);
      });

      it('should allow user with any of required roles', () => {
        const state = createMockAuthState({
          user: USER_FIXTURES.scout,
          isInitialized: true,
        });
        const options: AuthGuardOptions = { requiredRoles: ['coach', 'scout', 'media'] };

        const result = requireAuth(state, options);

        expect(result.allowed).toBe(true);
      });

      it('should deny user without required role', () => {
        const state = createMockAuthState({
          user: USER_FIXTURES.athlete,
          isInitialized: true,
        });
        const options: AuthGuardOptions = { requiredRoles: ['coach', 'scout'] };

        const result = requireAuth(state, options);

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('Role athlete not in required roles');
      });

      it('should use custom redirect for role denial', () => {
        const state = createMockAuthState({
          user: USER_FIXTURES.athlete,
          isInitialized: true,
        });
        const options: AuthGuardOptions = {
          requiredRoles: ['coach'],
          homePath: '/dashboard',
        };

        const result = requireAuth(state, options);

        expect(result.redirectTo).toBe('/dashboard');
      });
    });

    describe('onboarding requirement', () => {
      it('should allow user who completed onboarding', () => {
        const state = STATE_FIXTURES.authenticated; // hasCompletedOnboarding = true
        const options: AuthGuardOptions = { requireOnboarding: true };

        const result = requireAuth(state, options);

        expect(result.allowed).toBe(true);
      });

      it('should deny user who needs onboarding', () => {
        const state = STATE_FIXTURES.needsOnboarding;
        const options: AuthGuardOptions = { requireOnboarding: true };

        const result = requireAuth(state, options);

        expect(result.allowed).toBe(false);
        expect(result.redirectTo).toBe('/auth/onboarding');
        expect(result.reason).toBe('Onboarding not completed');
      });
    });

    describe('premium requirement', () => {
      it('should allow premium user', () => {
        const state = STATE_FIXTURES.authenticatedPremium;
        const options: AuthGuardOptions = { requirePremium: true };

        const result = requireAuth(state, options);

        expect(result.allowed).toBe(true);
      });

      it('should deny non-premium user', () => {
        const state = STATE_FIXTURES.authenticated; // isPremium = false
        const options: AuthGuardOptions = { requirePremium: true };

        const result = requireAuth(state, options);

        expect(result.allowed).toBe(false);
        expect(result.redirectTo).toBe('/premium');
        expect(result.reason).toBe('Premium subscription required');
      });
    });

    describe('combined requirements', () => {
      it('should check all requirements', () => {
        const premiumCoach = createMockAuthUser({
          role: 'coach',
          isPremium: true,
          hasCompletedOnboarding: true,
        });
        const state = createMockAuthState({
          user: premiumCoach,
          isInitialized: true,
        });
        const options: AuthGuardOptions = {
          requiredRoles: ['coach', 'scout'],
          requirePremium: true,
          requireOnboarding: true,
        };

        const result = requireAuth(state, options);

        expect(result.allowed).toBe(true);
      });

      it('should fail on first unmet requirement', () => {
        // Coach without premium
        const state = createMockAuthState({
          user: USER_FIXTURES.coach,
          isInitialized: true,
        });
        const options: AuthGuardOptions = {
          requiredRoles: ['coach'],
          requirePremium: true,
        };

        const result = requireAuth(state, options);

        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('Premium subscription required');
      });
    });
  });

  // ============================================
  // requireGuest
  // ============================================

  describe('requireGuest', () => {
    it('should allow unauthenticated users', () => {
      const state = STATE_FIXTURES.unauthenticated;

      const result = requireGuest(state);

      expect(result.allowed).toBe(true);
    });

    it('should allow during loading state', () => {
      const state = STATE_FIXTURES.loading;

      const result = requireGuest(state);

      // Allow access during loading to show the page
      expect(result.allowed).toBe(true);
    });

    it('should deny authenticated users', () => {
      const state = STATE_FIXTURES.authenticated;

      const result = requireGuest(state);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Already authenticated');
    });

    it('should redirect to home for authenticated user with onboarding', () => {
      const state = STATE_FIXTURES.authenticated; // hasCompletedOnboarding = true

      const result = requireGuest(state);

      expect(result.redirectTo).toBe('/home');
    });

    it('should redirect to onboarding for user without onboarding', () => {
      const state = STATE_FIXTURES.needsOnboarding;

      const result = requireGuest(state);

      expect(result.redirectTo).toBe('/auth/onboarding');
    });

    it('should use custom home path', () => {
      const state = STATE_FIXTURES.authenticated;
      const options: AuthGuardOptions = { homePath: '/dashboard' };

      const result = requireGuest(state, options);

      expect(result.redirectTo).toBe('/dashboard');
    });
  });

  // ============================================
  // requireRole
  // ============================================

  describe('requireRole', () => {
    it('should allow user with matching role', () => {
      const state = STATE_FIXTURES.authenticatedCoach;

      const result = requireRole(state, ['coach']);

      expect(result.allowed).toBe(true);
    });

    it('should allow user with any matching role', () => {
      const state = STATE_FIXTURES.authenticated; // athlete

      const result = requireRole(state, ['athlete', 'parent']);

      expect(result.allowed).toBe(true);
    });

    it('should deny user without matching role', () => {
      const state = STATE_FIXTURES.authenticated; // athlete

      const result = requireRole(state, ['coach', 'scout']);

      expect(result.allowed).toBe(false);
    });

    it('should deny unauthenticated user', () => {
      const state = STATE_FIXTURES.unauthenticated;

      const result = requireRole(state, ['athlete']);

      expect(result.allowed).toBe(false);
      expect(result.redirectTo).toBe('/auth');
    });

    it('should check all user roles', () => {
      const allRoles: UserRole[] = ['athlete', 'coach', 'parent', 'scout', 'media', 'fan'];

      for (const role of allRoles) {
        const state = createMockAuthState({
          user: createMockAuthUser({ role }),
          isInitialized: true,
        });

        const result = requireRole(state, [role]);
        expect(result.allowed).toBe(true);
      }
    });
  });

  // ============================================
  // requirePremium
  // ============================================

  describe('requirePremium', () => {
    it('should allow premium user', () => {
      const state = STATE_FIXTURES.authenticatedPremium;

      const result = requirePremium(state);

      expect(result.allowed).toBe(true);
    });

    it('should deny non-premium user', () => {
      const state = STATE_FIXTURES.authenticated;

      const result = requirePremium(state);

      expect(result.allowed).toBe(false);
      expect(result.redirectTo).toBe('/premium');
    });

    it('should deny unauthenticated user', () => {
      const state = STATE_FIXTURES.unauthenticated;

      const result = requirePremium(state);

      expect(result.allowed).toBe(false);
      expect(result.redirectTo).toBe('/auth');
    });
  });

  // ============================================
  // requireOnboarding
  // ============================================

  describe('requireOnboarding', () => {
    it('should allow user with completed onboarding', () => {
      const state = STATE_FIXTURES.authenticated;

      const result = requireOnboarding(state);

      expect(result.allowed).toBe(true);
    });

    it('should deny user without onboarding', () => {
      const state = STATE_FIXTURES.needsOnboarding;

      const result = requireOnboarding(state);

      expect(result.allowed).toBe(false);
      expect(result.redirectTo).toBe('/auth/onboarding');
    });

    it('should deny unauthenticated user', () => {
      const state = STATE_FIXTURES.unauthenticated;

      const result = requireOnboarding(state);

      expect(result.allowed).toBe(false);
      expect(result.redirectTo).toBe('/auth');
    });
  });

  // ============================================
  // HELPER FUNCTIONS
  // ============================================

  describe('hasAnyRole', () => {
    it('should return true if user has role', () => {
      const user = USER_FIXTURES.athlete;

      expect(hasAnyRole(user, ['athlete'])).toBe(true);
      expect(hasAnyRole(user, ['athlete', 'coach'])).toBe(true);
    });

    it('should return false if user lacks role', () => {
      const user = USER_FIXTURES.athlete;

      expect(hasAnyRole(user, ['coach'])).toBe(false);
      expect(hasAnyRole(user, ['coach', 'scout'])).toBe(false);
    });

    it('should return false for null user', () => {
      expect(hasAnyRole(null, ['athlete'])).toBe(false);
    });

    it('should return false for empty roles array', () => {
      expect(hasAnyRole(USER_FIXTURES.athlete, [])).toBe(false);
    });
  });

  describe('isFullyAuthenticated', () => {
    it('should return true when initialized and user exists', () => {
      const state = STATE_FIXTURES.authenticated;

      expect(isFullyAuthenticated(state)).toBe(true);
    });

    it('should return false when not initialized', () => {
      const state = createMockAuthState({
        user: USER_FIXTURES.athlete,
        isInitialized: false,
      });

      expect(isFullyAuthenticated(state)).toBe(false);
    });

    it('should return false when no user', () => {
      const state = STATE_FIXTURES.unauthenticated;

      expect(isFullyAuthenticated(state)).toBe(false);
    });

    it('should return false during loading', () => {
      const state = STATE_FIXTURES.loading;

      expect(isFullyAuthenticated(state)).toBe(false);
    });
  });

  describe('isAuthLoading', () => {
    it('should return true when loading', () => {
      const state = STATE_FIXTURES.loading;

      expect(isAuthLoading(state)).toBe(true);
    });

    it('should return true when not initialized', () => {
      const state = createMockAuthState({
        isLoading: false,
        isInitialized: false,
      });

      expect(isAuthLoading(state)).toBe(true);
    });

    it('should return false when initialized and not loading', () => {
      const state = STATE_FIXTURES.authenticated;

      expect(isAuthLoading(state)).toBe(false);
    });
  });

  // ============================================
  // EDGE CASES
  // ============================================

  describe('edge cases', () => {
    it('should handle error state', () => {
      const state = STATE_FIXTURES.error;

      // Error state should still be treated as unauthenticated
      const authResult = requireAuth(state);
      expect(authResult.allowed).toBe(false);

      // Guest guard should allow access
      const guestResult = requireGuest(state);
      expect(guestResult.allowed).toBe(true);
    });

    it('should handle initialized state with loading true', () => {
      // Edge case: initialized = true but loading = true (re-checking auth)
      const state = createMockAuthState({
        user: USER_FIXTURES.athlete,
        isInitialized: true,
        isLoading: true,
      });

      // Should still allow access since initialized
      const result = requireAuth(state);
      expect(result.allowed).toBe(true);
    });

    it('should handle all user roles for premium check', () => {
      const roles: UserRole[] = ['athlete', 'coach', 'parent', 'scout', 'media', 'fan'];

      for (const role of roles) {
        const premiumUser = createMockAuthUser({ role, isPremium: true });
        const state = createMockAuthState({
          user: premiumUser,
          isInitialized: true,
        });

        const result = requirePremium(state);
        expect(result.allowed).toBe(true);
      }
    });

    it('should handle missing user properties gracefully', () => {
      // User with minimal properties
      const minimalUser = createMockAuthUser({
        uid: 'minimal',
        email: 'minimal@test.com',
        displayName: '',
        profileImg: undefined,
      });
      const state = createMockAuthState({
        user: minimalUser,
        isInitialized: true,
      });

      const result = requireAuth(state);
      expect(result.allowed).toBe(true);
    });
  });
});
