/**
 * @fileoverview Auth Test Mocks
 * @module @nxt1/core/testing
 *
 * ⭐ SHARED TEST MOCKS FOR WEB AND MOBILE ⭐
 *
 * Provides mock implementations of auth infrastructure for unit testing.
 * These mocks allow testing auth logic without real Firebase or storage.
 *
 * Usage:
 * ```typescript
 * import { createMockStorageAdapter, createMockAuthStateManager } from '@nxt1/core/testing';
 *
 * const storage = createMockStorageAdapter();
 * const authManager = createMockAuthStateManager(storage);
 *
 * // In tests, verify calls
 * expect(storage.get).toHaveBeenCalledWith('auth-token');
 * ```
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import type { StorageAdapter } from '../storage/storage-adapter';
import type {
  AuthStateManager,
  AuthStateListener,
  AuthEventListener,
} from '../auth/auth-state-manager';
import type {
  AuthState,
  AuthUser,
  FirebaseUserInfo,
  StoredAuthToken,
  AuthEvent,
} from '../auth/auth.types';
import { INITIAL_AUTH_STATE } from '../auth/auth.types';
import { USER_FIXTURES } from './auth-fixtures';

// ============================================
// MOCK STORAGE ADAPTER
// ============================================

/**
 * In-memory storage data type
 */
export type MockStorageData = Map<string, string>;

/**
 * Mock storage adapter with full call tracking
 * Implements StorageAdapter interface for testing
 */
export interface MockStorageAdapter extends StorageAdapter {
  /** Internal data store */
  _data: MockStorageData;
  /** Get call history */
  _getCalls: string[];
  /** Set call history */
  _setCalls: Array<{ key: string; value: string }>;
  /** Remove call history */
  _removeCalls: string[];
  /** Clear all data and call history */
  _reset(): void;
  /** Seed data without tracking as a call */
  _seed(data: Record<string, string>): void;
}

/**
 * Create a mock storage adapter for testing
 *
 * Features:
 * - In-memory storage (no persistence)
 * - Call tracking for assertions
 * - Pre-seed data capability
 * - Reset between tests
 *
 * @param initialData - Optional initial data to seed
 * @returns MockStorageAdapter with tracking capabilities
 *
 * @example
 * ```typescript
 * const storage = createMockStorageAdapter({
 *   'user-profile': JSON.stringify(mockUser),
 * });
 *
 * await storage.get('user-profile');
 * expect(storage._getCalls).toContain('user-profile');
 * ```
 */
export function createMockStorageAdapter(
  initialData: Record<string, string> = {}
): MockStorageAdapter {
  const data: MockStorageData = new Map(Object.entries(initialData));
  const getCalls: string[] = [];
  const setCalls: Array<{ key: string; value: string }> = [];
  const removeCalls: string[] = [];

  return {
    _data: data,
    _getCalls: getCalls,
    _setCalls: setCalls,
    _removeCalls: removeCalls,

    _reset(): void {
      data.clear();
      getCalls.length = 0;
      setCalls.length = 0;
      removeCalls.length = 0;
    },

    _seed(seedData: Record<string, string>): void {
      Object.entries(seedData).forEach(([key, value]) => {
        data.set(key, value);
      });
    },

    async get(key: string): Promise<string | null> {
      getCalls.push(key);
      return data.get(key) ?? null;
    },

    async set(key: string, value: string): Promise<void> {
      setCalls.push({ key, value });
      data.set(key, value);
    },

    async remove(key: string): Promise<void> {
      removeCalls.push(key);
      data.delete(key);
    },

    async clear(): Promise<void> {
      data.clear();
    },

    async keys(): Promise<string[]> {
      return Array.from(data.keys());
    },

    async has(key: string): Promise<boolean> {
      getCalls.push(key);
      return data.has(key);
    },

    async getJSON<T>(key: string): Promise<T | null> {
      getCalls.push(key);
      const value = data.get(key);
      if (value === undefined || value === null) {
        return null;
      }
      try {
        return JSON.parse(value) as T;
      } catch {
        return null;
      }
    },

    async setJSON<T>(key: string, value: T): Promise<void> {
      const stringValue = JSON.stringify(value);
      setCalls.push({ key, value: stringValue });
      data.set(key, stringValue);
    },
  };
}

// ============================================
// MOCK AUTH STATE MANAGER
// ============================================

/**
 * Mock auth state manager with exposed internals for testing
 */
export interface MockAuthStateManager extends AuthStateManager {
  /** Current internal state */
  _state: AuthState;
  /** Registered state listeners */
  _stateListeners: Set<AuthStateListener>;
  /** Registered event listeners */
  _eventListeners: Set<AuthEventListener>;
  /** Emitted events history */
  _emittedEvents: AuthEvent[];
  /** Reset all state and history */
  _reset(): void;
  /** Force set state (bypasses normal flow) */
  _setState(state: AuthState): void;
  /** Simulate event emission */
  _emitEvent(event: AuthEvent): void;
}

/**
 * Create a mock auth state manager for testing
 *
 * Features:
 * - In-memory state management
 * - Event tracking for assertions
 * - Listener management
 * - State override capability
 *
 * @param storage - Storage adapter (use createMockStorageAdapter)
 * @param initialState - Optional initial state
 * @returns MockAuthStateManager with testing capabilities
 *
 * @example
 * ```typescript
 * const storage = createMockStorageAdapter();
 * const authManager = createMockAuthStateManager(storage, {
 *   user: mockUser,
 *   isInitialized: true,
 * });
 *
 * authManager.subscribe((state) => {
 *   expect(state.user).toEqual(mockUser);
 * });
 * ```
 */
export function createMockAuthStateManager(
  storage: StorageAdapter,
  initialState: Partial<AuthState> = {}
): MockAuthStateManager {
  let state: AuthState = { ...INITIAL_AUTH_STATE, ...initialState };
  const stateListeners = new Set<AuthStateListener>();
  const eventListeners = new Set<AuthEventListener>();
  const emittedEvents: AuthEvent[] = [];

  function notifyStateListeners(): void {
    const currentState = { ...state };
    stateListeners.forEach((listener) => {
      try {
        listener(currentState);
      } catch (_error) {
        // Swallow errors in tests to prevent cascade failures
      }
    });
  }

  function emitEvent(event: AuthEvent): void {
    emittedEvents.push(event);
    eventListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (_error) {
        // Swallow errors in tests
      }
    });
  }

  function updateState(updates: Partial<AuthState>): void {
    state = { ...state, ...updates };
    notifyStateListeners();
  }

  return {
    // Test-specific properties
    _state: state,
    _stateListeners: stateListeners,
    _eventListeners: eventListeners,
    _emittedEvents: emittedEvents,

    _reset(): void {
      state = { ...INITIAL_AUTH_STATE };
      stateListeners.clear();
      eventListeners.clear();
      emittedEvents.length = 0;
    },

    _setState(newState: AuthState): void {
      state = { ...newState };
      notifyStateListeners();
    },

    _emitEvent(event: AuthEvent): void {
      emitEvent(event);
    },

    // AuthStateManager interface implementation
    getState(): AuthState {
      return { ...state };
    },

    getUser(): AuthUser | null {
      return state.user;
    },

    getFirebaseUser(): FirebaseUserInfo | null {
      return state.firebaseUser;
    },

    isAuthenticated(): boolean {
      return state.user !== null;
    },

    isInitialized(): boolean {
      return state.isInitialized;
    },

    isSignupInProgress(): boolean {
      return state.signupInProgress;
    },

    async setUser(user: AuthUser | null): Promise<void> {
      updateState({ user });
      if (user) {
        await storage.set('nxt1-user-profile', JSON.stringify(user));
        await storage.set('nxt1-user-id', user.uid);
        emitEvent({ type: 'SIGN_IN', user, timestamp: Date.now() });
      } else {
        await storage.remove('nxt1-user-profile');
        await storage.remove('nxt1-user-id');
        emitEvent({ type: 'SIGN_OUT', timestamp: Date.now() });
      }
    },

    setFirebaseUser(user: FirebaseUserInfo | null): void {
      updateState({ firebaseUser: user });
    },

    setLoading(loading: boolean): void {
      updateState({ isLoading: loading });
    },

    setError(error: string | null): void {
      updateState({ error });
      if (error) {
        emitEvent({ type: 'ERROR', error, timestamp: Date.now() });
      }
    },

    setInitialized(initialized: boolean): void {
      updateState({ isInitialized: initialized });
    },

    setSignupInProgress(inProgress: boolean): void {
      updateState({ signupInProgress: inProgress });
    },

    async getToken(): Promise<StoredAuthToken | null> {
      const tokenJson = await storage.get('nxt1-auth-token');
      if (!tokenJson) return null;
      try {
        return JSON.parse(tokenJson);
      } catch {
        return null;
      }
    },

    async setToken(token: StoredAuthToken): Promise<void> {
      await storage.set('nxt1-auth-token', JSON.stringify(token));
      emitEvent({ type: 'TOKEN_REFRESH', timestamp: Date.now() });
    },

    async clearToken(): Promise<void> {
      await storage.remove('nxt1-auth-token');
      await storage.remove('nxt1-refresh-token');
    },

    async isTokenValid(): Promise<boolean> {
      const token = await this.getToken();
      if (!token) return false;
      return Date.now() < token.expiresAt - 5 * 60 * 1000; // 5 min buffer
    },

    subscribe(listener: AuthStateListener): () => void {
      stateListeners.add(listener);
      listener({ ...state });
      return () => stateListeners.delete(listener);
    },

    onEvent(listener: AuthEventListener): () => void {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },

    async initialize(): Promise<void> {
      updateState({ isLoading: true });
      try {
        const userJson = await storage.get('nxt1-user-profile');
        if (userJson) {
          const user: AuthUser = JSON.parse(userJson);
          updateState({ user });
        }
      } catch (_error) {
        updateState({ error: 'Failed to restore auth state' });
      } finally {
        updateState({ isLoading: false, isInitialized: true });
      }
    },

    async reset(): Promise<void> {
      await storage.remove('nxt1-auth-token');
      await storage.remove('nxt1-refresh-token');
      await storage.remove('nxt1-user-profile');
      await storage.remove('nxt1-user-id');
      await storage.remove('nxt1-session-id');

      state = { ...INITIAL_AUTH_STATE, isLoading: false, isInitialized: true };
      notifyStateListeners();
      emitEvent({ type: 'SIGN_OUT', timestamp: Date.now() });
    },
  };
}

// ============================================
// TEST HELPER FUNCTIONS
// ============================================

/**
 * Wait for a specified number of milliseconds
 * Useful for testing async operations
 *
 * @param ms - Milliseconds to wait
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a promise that can be resolved/rejected externally
 * Useful for controlling async flow in tests
 *
 * @example
 * ```typescript
 * const { promise, resolve, reject } = createDeferredPromise<User>();
 *
 * // Somewhere in test setup
 * mockApi.getUser.mockReturnValue(promise);
 *
 * // Later in test
 * resolve(mockUser); // or reject(new Error('fail'))
 * ```
 */
export function createDeferredPromise<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * Wait for all pending promises to resolve
 * Useful after triggering async operations
 */
export function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Create a spy function that records calls
 * Simple alternative to jest.fn() / vi.fn() when those aren't available
 *
 * @param implementation - Optional implementation function
 */
export function createSpy<T extends (...args: unknown[]) => unknown>(
  implementation?: T
): T & {
  calls: Parameters<T>[];
  callCount: number;
  lastCall: Parameters<T> | undefined;
  reset: () => void;
} {
  const calls: Parameters<T>[] = [];

  const spy = ((...args: Parameters<T>) => {
    calls.push(args);
    return implementation?.(...args);
  }) as T & {
    calls: Parameters<T>[];
    callCount: number;
    lastCall: Parameters<T> | undefined;
    reset: () => void;
  };

  Object.defineProperties(spy, {
    calls: {
      get: () => calls,
    },
    callCount: {
      get: () => calls.length,
    },
    lastCall: {
      get: () => calls[calls.length - 1],
    },
    reset: {
      value: () => {
        calls.length = 0;
      },
    },
  });

  return spy;
}

// ============================================
// ASSERTION HELPERS
// ============================================

/**
 * Assert that auth state matches expected values
 * Provides clearer error messages than deep equality
 *
 * @param actual - Actual auth state
 * @param expected - Expected partial state
 * @throws Error if states don't match
 */
export function assertAuthState(actual: AuthState, expected: Partial<AuthState>): void {
  const errors: string[] = [];

  if (expected.user !== undefined) {
    if (expected.user === null && actual.user !== null) {
      errors.push(`Expected user to be null, got ${actual.user?.uid}`);
    } else if (expected.user !== null && actual.user === null) {
      errors.push(`Expected user to exist, got null`);
    } else if (expected.user && actual.user && expected.user.uid !== actual.user.uid) {
      errors.push(`Expected user.uid ${expected.user.uid}, got ${actual.user.uid}`);
    }
  }

  if (expected.isLoading !== undefined && actual.isLoading !== expected.isLoading) {
    errors.push(`Expected isLoading ${expected.isLoading}, got ${actual.isLoading}`);
  }

  if (expected.isInitialized !== undefined && actual.isInitialized !== expected.isInitialized) {
    errors.push(`Expected isInitialized ${expected.isInitialized}, got ${actual.isInitialized}`);
  }

  if (expected.error !== undefined && actual.error !== expected.error) {
    errors.push(`Expected error "${expected.error}", got "${actual.error}"`);
  }

  if (errors.length > 0) {
    throw new Error(`Auth state assertion failed:\n${errors.join('\n')}`);
  }
}

/**
 * Assert that an event was emitted
 *
 * @param events - Array of emitted events
 * @param expectedType - Expected event type
 * @throws Error if event wasn't found
 */
export function assertEventEmitted(events: AuthEvent[], expectedType: AuthEvent['type']): void {
  const found = events.some((e) => e.type === expectedType);
  if (!found) {
    const types = events.map((e) => e.type).join(', ');
    throw new Error(`Expected event "${expectedType}" to be emitted. Emitted events: [${types}]`);
  }
}

// ============================================
// FACTORY FUNCTIONS FOR COMMON TEST SETUPS
// ============================================

/**
 * Create a complete test setup with storage and auth manager
 * Convenience function for common test scenarios
 *
 * @param options - Setup options
 * @returns Object with storage and authManager
 *
 * @example
 * ```typescript
 * const { storage, authManager } = createTestAuthSetup({
 *   authenticated: true,
 *   user: USER_FIXTURES.coach,
 * });
 * ```
 */
export function createTestAuthSetup(
  options: {
    authenticated?: boolean;
    user?: AuthUser;
    withToken?: boolean;
    tokenExpired?: boolean;
  } = {}
): {
  storage: MockStorageAdapter;
  authManager: MockAuthStateManager;
} {
  const storage = createMockStorageAdapter();
  const user = options.user ?? (options.authenticated ? USER_FIXTURES.athlete : null);

  const authManager = createMockAuthStateManager(storage, {
    user,
    isLoading: false,
    isInitialized: true,
    firebaseUser: user
      ? {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL ?? null,
          emailVerified: user.emailVerified,
        }
      : null,
  });

  // Seed token if requested
  if (options.withToken && user) {
    const expiresAt = options.tokenExpired
      ? Date.now() - 3600000 // 1 hour ago
      : Date.now() + 3600000; // 1 hour from now

    storage._seed({
      'nxt1-auth-token': JSON.stringify({
        token: 'test-token',
        expiresAt,
        refreshToken: 'test-refresh',
        userId: user.uid,
      }),
    });
  }

  return { storage, authManager };
}
