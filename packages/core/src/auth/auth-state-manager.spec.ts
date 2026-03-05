/**
 * @fileoverview Auth State Manager Unit Tests
 * @module @nxt1/core/auth
 *
 * Comprehensive tests for the platform-agnostic auth state manager.
 * These tests verify core auth functionality that works on both web and mobile.
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createAuthStateManager, type AuthStateManager } from './auth-state-manager';
import type { AuthEvent } from './auth.types';
import { createMockStorageAdapter, type MockStorageAdapter } from '../testing/auth-mocks';
import {
  USER_FIXTURES,
  TOKEN_FIXTURES,
  createMockAuthUser,
  createMockToken,
  resetFixtureCounters,
  TEST_BASE_TIMESTAMP,
} from '../testing/auth-fixtures';
import { STORAGE_KEYS } from '../storage/storage-adapter';

describe('createAuthStateManager', () => {
  let storage: MockStorageAdapter;
  let authManager: AuthStateManager;

  beforeEach(() => {
    // Reset fixture counters for unique IDs
    resetFixtureCounters();

    // Create fresh storage and manager for each test
    storage = createMockStorageAdapter();
    authManager = createAuthStateManager(storage);
  });

  afterEach(() => {
    storage._reset();
  });

  // ============================================
  // INITIALIZATION
  // ============================================

  describe('initialization', () => {
    it('should start with INITIAL_AUTH_STATE', () => {
      const state = authManager.getState();

      expect(state.user).toBeNull();
      expect(state.firebaseUser).toBeNull();
      expect(state.isLoading).toBe(true); // Initial state has loading true
      expect(state.isInitialized).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should restore user from storage on initialize', async () => {
      const mockUser = USER_FIXTURES.athlete;

      // Seed storage with user data
      storage._seed({
        [STORAGE_KEYS.USER_PROFILE]: JSON.stringify(mockUser),
      });

      await authManager.initialize();

      const state = authManager.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.isLoading).toBe(false);
      expect(state.isInitialized).toBe(true);
    });

    it('should handle missing user gracefully', async () => {
      // Storage is empty
      await authManager.initialize();

      const state = authManager.getState();
      expect(state.user).toBeNull();
      expect(state.isInitialized).toBe(true);
      expect(state.error).toBeNull();
    });

    it('should handle corrupted storage data', async () => {
      // Seed with invalid JSON
      storage._seed({
        [STORAGE_KEYS.USER_PROFILE]: 'not-valid-json',
      });

      await authManager.initialize();

      const state = authManager.getState();
      expect(state.user).toBeNull();
      expect(state.isInitialized).toBe(true);
      // Should set error for corrupted data
      expect(state.error).toBeTruthy();
    });
  });

  // ============================================
  // STATE ACCESS
  // ============================================

  describe('state access', () => {
    it('getState() should return a copy of current state', async () => {
      const user = USER_FIXTURES.athlete;
      await authManager.setUser(user);

      const state1 = authManager.getState();
      const state2 = authManager.getState();

      // Should be equal but not the same reference
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });

    it('getUser() should return current user', async () => {
      expect(authManager.getUser()).toBeNull();

      await authManager.setUser(USER_FIXTURES.athlete);

      expect(authManager.getUser()).toEqual(USER_FIXTURES.athlete);
    });

    it('isAuthenticated() should return true when user exists', async () => {
      expect(authManager.isAuthenticated()).toBe(false);

      await authManager.setUser(USER_FIXTURES.athlete);

      expect(authManager.isAuthenticated()).toBe(true);
    });

    it('isInitialized() should track initialization state', async () => {
      expect(authManager.isInitialized()).toBe(false);

      authManager.setInitialized(true);

      expect(authManager.isInitialized()).toBe(true);
    });
  });

  // ============================================
  // STATE MUTATION
  // ============================================

  describe('state mutation', () => {
    describe('setUser', () => {
      it('should update user state', async () => {
        const user = USER_FIXTURES.athlete;

        await authManager.setUser(user);

        expect(authManager.getUser()).toEqual(user);
      });

      it('should persist user to storage', async () => {
        const user = USER_FIXTURES.athlete;

        await authManager.setUser(user);

        expect(storage._setCalls).toContainEqual({
          key: STORAGE_KEYS.USER_PROFILE,
          value: JSON.stringify(user),
        });
        expect(storage._setCalls).toContainEqual({
          key: STORAGE_KEYS.USER_ID,
          value: user.uid,
        });
      });

      it('should emit SIGN_IN event when setting user', async () => {
        const events: AuthEvent[] = [];
        authManager.onEvent((e) => events.push(e));

        await authManager.setUser(USER_FIXTURES.athlete);

        expect(events).toContainEqual(
          expect.objectContaining({
            type: 'SIGN_IN',
            user: USER_FIXTURES.athlete,
          })
        );
      });

      it('should clear storage when setting user to null', async () => {
        // First sign in
        await authManager.setUser(USER_FIXTURES.athlete);

        // Then sign out
        await authManager.setUser(null);

        expect(storage._removeCalls).toContain(STORAGE_KEYS.USER_PROFILE);
        expect(storage._removeCalls).toContain(STORAGE_KEYS.USER_ID);
      });

      it('should emit SIGN_OUT event when setting user to null', async () => {
        const events: AuthEvent[] = [];
        await authManager.setUser(USER_FIXTURES.athlete);

        authManager.onEvent((e) => events.push(e));
        await authManager.setUser(null);

        expect(events).toContainEqual(expect.objectContaining({ type: 'SIGN_OUT' }));
      });
    });

    describe('setFirebaseUser', () => {
      it('should update Firebase user state', () => {
        const firebaseUser = {
          uid: 'fb-123',
          email: 'test@example.com',
          displayName: 'Test',
          photoURL: null,
          emailVerified: true,
        };

        authManager.setFirebaseUser(firebaseUser);

        expect(authManager.getFirebaseUser()).toEqual(firebaseUser);
      });
    });

    describe('setLoading', () => {
      it('should update loading state', () => {
        authManager.setLoading(true);
        expect(authManager.getState().isLoading).toBe(true);

        authManager.setLoading(false);
        expect(authManager.getState().isLoading).toBe(false);
      });
    });

    describe('setError', () => {
      it('should update error state', () => {
        authManager.setError('Test error');

        expect(authManager.getState().error).toBe('Test error');
      });

      it('should emit ERROR event when setting error', () => {
        const events: AuthEvent[] = [];
        authManager.onEvent((e) => events.push(e));

        authManager.setError('Auth failed');

        expect(events).toContainEqual(
          expect.objectContaining({
            type: 'ERROR',
            error: 'Auth failed',
          })
        );
      });

      it('should not emit event when clearing error', () => {
        const events: AuthEvent[] = [];
        authManager.setError('Initial error');
        authManager.onEvent((e) => events.push(e));

        authManager.setError(null);

        // Should not have ERROR event for null
        expect(events.filter((e) => e.type === 'ERROR')).toHaveLength(0);
      });
    });
  });

  // ============================================
  // TOKEN MANAGEMENT
  // ============================================

  describe('token management', () => {
    describe('getToken', () => {
      it('should return null when no token stored', async () => {
        const token = await authManager.getToken();

        expect(token).toBeNull();
      });

      it('should return stored token', async () => {
        const mockToken = TOKEN_FIXTURES.valid;
        storage._seed({
          [STORAGE_KEYS.AUTH_TOKEN]: JSON.stringify(mockToken),
        });

        const token = await authManager.getToken();

        expect(token).toEqual(mockToken);
      });

      it('should handle corrupted token data', async () => {
        storage._seed({
          [STORAGE_KEYS.AUTH_TOKEN]: 'invalid-json',
        });

        const token = await authManager.getToken();

        expect(token).toBeNull();
      });
    });

    describe('setToken', () => {
      it('should store token', async () => {
        const mockToken = createMockToken();

        await authManager.setToken(mockToken);

        expect(storage._setCalls).toContainEqual({
          key: STORAGE_KEYS.AUTH_TOKEN,
          value: JSON.stringify(mockToken),
        });
      });

      it('should emit TOKEN_REFRESH event', async () => {
        const events: AuthEvent[] = [];
        authManager.onEvent((e) => events.push(e));

        await authManager.setToken(createMockToken());

        expect(events).toContainEqual(expect.objectContaining({ type: 'TOKEN_REFRESH' }));
      });
    });

    describe('clearToken', () => {
      it('should remove token from storage', async () => {
        await authManager.setToken(createMockToken());

        await authManager.clearToken();

        expect(storage._removeCalls).toContain(STORAGE_KEYS.AUTH_TOKEN);
        expect(storage._removeCalls).toContain(STORAGE_KEYS.REFRESH_TOKEN);
      });
    });

    describe('isTokenValid', () => {
      it('should return false when no token', async () => {
        const isValid = await authManager.isTokenValid();

        expect(isValid).toBe(false);
      });

      it('should return true for valid token', async () => {
        // Use fixed time for deterministic tests
        vi.useFakeTimers();
        vi.setSystemTime(TEST_BASE_TIMESTAMP);

        const validToken = createMockToken({
          expiresAt: TEST_BASE_TIMESTAMP + 3600000, // 1 hour from now
        });
        storage._seed({
          [STORAGE_KEYS.AUTH_TOKEN]: JSON.stringify(validToken),
        });

        const isValid = await authManager.isTokenValid();

        expect(isValid).toBe(true);

        vi.useRealTimers();
      });

      it('should return false for expired token', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(TEST_BASE_TIMESTAMP);

        const expiredToken = createMockToken(
          { expiresAt: TEST_BASE_TIMESTAMP - 3600000 }, // 1 hour ago
          { expired: true }
        );
        storage._seed({
          [STORAGE_KEYS.AUTH_TOKEN]: JSON.stringify(expiredToken),
        });

        const isValid = await authManager.isTokenValid();

        expect(isValid).toBe(false);

        vi.useRealTimers();
      });

      it('should consider buffer time (5 minutes)', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(TEST_BASE_TIMESTAMP);

        // Token expires in 4 minutes (within 5 min buffer)
        const soonToken = createMockToken({
          expiresAt: TEST_BASE_TIMESTAMP + 4 * 60 * 1000,
        });
        storage._seed({
          [STORAGE_KEYS.AUTH_TOKEN]: JSON.stringify(soonToken),
        });

        const isValid = await authManager.isTokenValid();

        expect(isValid).toBe(false); // Should be invalid due to buffer

        vi.useRealTimers();
      });
    });
  });

  // ============================================
  // SUBSCRIPTIONS
  // ============================================

  describe('subscriptions', () => {
    describe('subscribe', () => {
      it('should immediately call listener with current state', () => {
        const listener = vi.fn();

        authManager.subscribe(listener);

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({
            user: null,
            isLoading: true,
          })
        );
      });

      it('should call listener on state changes', async () => {
        const listener = vi.fn();
        authManager.subscribe(listener);
        listener.mockClear(); // Clear initial call

        await authManager.setUser(USER_FIXTURES.athlete);

        expect(listener).toHaveBeenCalled();
        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({
            user: USER_FIXTURES.athlete,
          })
        );
      });

      it('should return unsubscribe function', async () => {
        const listener = vi.fn();
        const unsubscribe = authManager.subscribe(listener);
        listener.mockClear();

        unsubscribe();
        await authManager.setUser(USER_FIXTURES.athlete);

        expect(listener).not.toHaveBeenCalled();
      });

      it('should support multiple listeners', async () => {
        const listener1 = vi.fn();
        const listener2 = vi.fn();

        authManager.subscribe(listener1);
        authManager.subscribe(listener2);
        listener1.mockClear();
        listener2.mockClear();

        await authManager.setUser(USER_FIXTURES.athlete);

        expect(listener1).toHaveBeenCalled();
        expect(listener2).toHaveBeenCalled();
      });

      it('should handle listener errors gracefully on state updates', async () => {
        // First subscribe a normal listener
        const normalListener = vi.fn();
        authManager.subscribe(normalListener);
        normalListener.mockClear();

        // Subscribe error listener (will error on state updates, not initial call)
        let callCount = 0;
        const errorListener = vi.fn(() => {
          callCount++;
          if (callCount > 1) {
            // Only throw on subsequent calls (not initial subscription)
            throw new Error('Listener error');
          }
        });
        authManager.subscribe(errorListener);

        // Update state - this should not throw despite errorListener throwing
        await expect(authManager.setUser(USER_FIXTURES.athlete)).resolves.not.toThrow();

        // Normal listener should still receive updates
        expect(normalListener).toHaveBeenCalled();
      });
    });

    describe('onEvent', () => {
      it('should call listener on events', async () => {
        const listener = vi.fn();
        authManager.onEvent(listener);

        await authManager.setUser(USER_FIXTURES.athlete);

        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'SIGN_IN',
            user: USER_FIXTURES.athlete,
          })
        );
      });

      it('should return unsubscribe function', async () => {
        const listener = vi.fn();
        const unsubscribe = authManager.onEvent(listener);

        unsubscribe();
        await authManager.setUser(USER_FIXTURES.athlete);

        expect(listener).not.toHaveBeenCalled();
      });

      it('should include timestamp in events', async () => {
        const listener = vi.fn();
        authManager.onEvent(listener);

        await authManager.setUser(USER_FIXTURES.athlete);

        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({
            timestamp: expect.any(Number),
          })
        );
      });
    });
  });

  // ============================================
  // LIFECYCLE
  // ============================================

  describe('lifecycle', () => {
    describe('reset', () => {
      it('should clear all auth data from storage', async () => {
        // Setup: sign in user
        await authManager.setUser(USER_FIXTURES.athlete);
        await authManager.setToken(createMockToken());

        // Reset
        await authManager.reset();

        expect(storage._removeCalls).toContain(STORAGE_KEYS.AUTH_TOKEN);
        expect(storage._removeCalls).toContain(STORAGE_KEYS.REFRESH_TOKEN);
        expect(storage._removeCalls).toContain(STORAGE_KEYS.USER_PROFILE);
        expect(storage._removeCalls).toContain(STORAGE_KEYS.USER_ID);
        expect(storage._removeCalls).toContain(STORAGE_KEYS.SESSION_ID);
      });

      it('should reset state to initial values', async () => {
        await authManager.setUser(USER_FIXTURES.athlete);
        authManager.setError('Some error');

        await authManager.reset();

        const state = authManager.getState();
        expect(state.user).toBeNull();
        expect(state.error).toBeNull();
        expect(state.isLoading).toBe(false);
        expect(state.isInitialized).toBe(true);
      });

      it('should emit SIGN_OUT event', async () => {
        const events: AuthEvent[] = [];
        authManager.onEvent((e) => events.push(e));

        await authManager.reset();

        expect(events).toContainEqual(expect.objectContaining({ type: 'SIGN_OUT' }));
      });

      it('should notify state listeners', async () => {
        const listener = vi.fn();
        authManager.subscribe(listener);
        listener.mockClear();

        await authManager.reset();

        expect(listener).toHaveBeenCalled();
      });
    });
  });

  // ============================================
  // EDGE CASES
  // ============================================

  describe('edge cases', () => {
    it('should handle rapid state changes', async () => {
      const listener = vi.fn();
      authManager.subscribe(listener);
      listener.mockClear();

      // Rapid changes
      await Promise.all([
        authManager.setUser(USER_FIXTURES.athlete),
        authManager.setUser(USER_FIXTURES.coach),
        authManager.setUser(USER_FIXTURES.recruiter),
      ]);

      // Final state should be deterministic (last one wins)
      expect(listener).toHaveBeenCalled();
    });

    it('should work with different user roles', async () => {
      const roles = ['athlete', 'coach', 'director', 'recruiter', 'parent'] as const;

      for (const role of roles) {
        const user = createMockAuthUser({ role });
        await authManager.setUser(user);

        expect(authManager.getUser()?.role).toBe(role);
      }
    });

    it('should handle empty string values in user', async () => {
      const user = createMockAuthUser({
        displayName: '',
        profileImg: '',
      });

      await authManager.setUser(user);

      const savedUser = authManager.getUser();
      expect(savedUser?.displayName).toBe('');
      expect(savedUser?.profileImg).toBe('');
    });
  });
});
