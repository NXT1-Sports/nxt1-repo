/**
 * @fileoverview Auth State Manager - Platform Agnostic
 * @module @nxt1/core/auth
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Pure TypeScript auth state management that works on any platform.
 * Uses event emitter pattern for reactive state updates.
 *
 * This is the foundation that platform-specific auth services build upon.
 * It handles:
 * - State storage and retrieval
 * - Event emission for state changes
 * - Token management (storage, validation, refresh)
 *
 * @example
 * ```typescript
 * import { createAuthStateManager } from '@nxt1/core/auth';
 * import { createBrowserStorageAdapter } from '@nxt1/core/storage';
 *
 * const storage = createBrowserStorageAdapter();
 * const authManager = createAuthStateManager(storage);
 *
 * // Subscribe to state changes
 * authManager.subscribe((state) => {
 *   console.log('Auth state changed:', state);
 * });
 *
 * // Update state
 * await authManager.setUser(user);
 * await authManager.setToken(token);
 * ```
 */

import type { StorageAdapter } from '../storage/storage-adapter';
import { STORAGE_KEYS } from '../storage/storage-adapter';
import type {
  AuthState,
  AuthUser,
  FirebaseUserInfo,
  StoredAuthToken,
  AuthEvent,
  AuthEventType,
} from './auth.types';
import { INITIAL_AUTH_STATE, isTokenExpired } from './auth.types';

/**
 * Auth state listener callback
 */
export type AuthStateListener = (state: AuthState) => void;

/**
 * Auth event listener callback
 */
export type AuthEventListener = (event: AuthEvent) => void;

/**
 * Auth state manager interface
 */
export interface AuthStateManager {
  // State access
  getState(): AuthState;
  getUser(): AuthUser | null;
  getFirebaseUser(): FirebaseUserInfo | null;
  isAuthenticated(): boolean;
  isInitialized(): boolean;
  isSignupInProgress(): boolean;

  // State mutation
  setUser(user: AuthUser | null): Promise<void>;
  setFirebaseUser(user: FirebaseUserInfo | null): void;
  setLoading(loading: boolean): void;
  setError(error: string | null): void;
  setInitialized(initialized: boolean): void;
  setSignupInProgress(inProgress: boolean): void;

  // Token management
  getToken(): Promise<StoredAuthToken | null>;
  setToken(token: StoredAuthToken): Promise<void>;
  clearToken(): Promise<void>;
  isTokenValid(): Promise<boolean>;

  // Subscriptions
  subscribe(listener: AuthStateListener): () => void;
  onEvent(listener: AuthEventListener): () => void;

  // Lifecycle
  initialize(): Promise<void>;
  reset(): Promise<void>;
}

/**
 * Create an auth state manager
 *
 * @param storage - Storage adapter for persisting auth data
 * @returns Auth state manager instance
 */
export function createAuthStateManager(storage: StorageAdapter): AuthStateManager {
  // Internal state
  let state: AuthState = { ...INITIAL_AUTH_STATE };
  const stateListeners = new Set<AuthStateListener>();
  const eventListeners = new Set<AuthEventListener>();

  /**
   * Notify all state listeners of current state
   */
  function notifyStateListeners(): void {
    const currentState = { ...state };
    stateListeners.forEach((listener) => {
      try {
        listener(currentState);
      } catch (error) {
        console.error('[AuthStateManager] State listener error:', error);
      }
    });
  }

  /**
   * Emit an auth event to all event listeners
   */
  function emitEvent(type: AuthEventType, data?: Partial<AuthEvent>): void {
    const event: AuthEvent = {
      type,
      timestamp: Date.now(),
      ...data,
    };

    eventListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error('[AuthStateManager] Event listener error:', error);
      }
    });
  }

  /**
   * Update state and notify listeners
   */
  function updateState(updates: Partial<AuthState>): void {
    state = { ...state, ...updates };
    notifyStateListeners();
  }

  return {
    // ============================================
    // STATE ACCESS
    // ============================================

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

    // ============================================
    // STATE MUTATION
    // ============================================

    async setUser(user: AuthUser | null): Promise<void> {
      updateState({ user });

      // Persist user profile to storage
      if (user) {
        await storage.set(STORAGE_KEYS.USER_PROFILE, JSON.stringify(user));
        await storage.set(STORAGE_KEYS.USER_ID, user.uid);
        emitEvent('SIGN_IN', { user });
      } else {
        await storage.remove(STORAGE_KEYS.USER_PROFILE);
        await storage.remove(STORAGE_KEYS.USER_ID);
        emitEvent('SIGN_OUT');
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
        emitEvent('ERROR', { error });
      }
    },

    setInitialized(initialized: boolean): void {
      updateState({ isInitialized: initialized });
    },

    setSignupInProgress(inProgress: boolean): void {
      updateState({ signupInProgress: inProgress });
    },

    // ============================================
    // TOKEN MANAGEMENT
    // ============================================

    async getToken(): Promise<StoredAuthToken | null> {
      try {
        const tokenJson = await storage.get(STORAGE_KEYS.AUTH_TOKEN);
        if (!tokenJson) return null;

        const token: StoredAuthToken = JSON.parse(tokenJson);
        return token;
      } catch {
        return null;
      }
    },

    async setToken(token: StoredAuthToken): Promise<void> {
      await storage.set(STORAGE_KEYS.AUTH_TOKEN, JSON.stringify(token));
      emitEvent('TOKEN_REFRESH');
    },

    async clearToken(): Promise<void> {
      await storage.remove(STORAGE_KEYS.AUTH_TOKEN);
      await storage.remove(STORAGE_KEYS.REFRESH_TOKEN);
    },

    async isTokenValid(): Promise<boolean> {
      const token = await this.getToken();
      if (!token) return false;
      return !isTokenExpired(token);
    },

    // ============================================
    // SUBSCRIPTIONS
    // ============================================

    subscribe(listener: AuthStateListener): () => void {
      stateListeners.add(listener);
      // Immediately call with current state
      listener({ ...state });
      // Return unsubscribe function
      return () => stateListeners.delete(listener);
    },

    onEvent(listener: AuthEventListener): () => void {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },

    // ============================================
    // LIFECYCLE
    // ============================================

    async initialize(): Promise<void> {
      updateState({ isLoading: true });

      try {
        // Restore user profile from storage
        const userJson = await storage.get(STORAGE_KEYS.USER_PROFILE);
        if (userJson) {
          const user: AuthUser = JSON.parse(userJson);
          updateState({ user });
        }

        // Check if token is still valid
        const tokenValid = await this.isTokenValid();
        if (!tokenValid && state.user) {
          // Token expired - emit event but don't clear user yet
          // The auth service will handle refresh or sign-out
          emitEvent('SESSION_EXPIRED');
        }
      } catch (error) {
        console.error('[AuthStateManager] Initialize error:', error);
        updateState({ error: 'Failed to restore auth state' });
      } finally {
        updateState({ isLoading: false, isInitialized: true });
      }
    },

    async reset(): Promise<void> {
      // Clear all auth-related storage
      await storage.remove(STORAGE_KEYS.AUTH_TOKEN);
      await storage.remove(STORAGE_KEYS.REFRESH_TOKEN);
      await storage.remove(STORAGE_KEYS.USER_PROFILE);
      await storage.remove(STORAGE_KEYS.USER_ID);
      await storage.remove(STORAGE_KEYS.SESSION_ID);

      // Reset state - isLoading should be false after reset
      state = {
        ...INITIAL_AUTH_STATE,
        isLoading: false,
        isInitialized: true,
        signupInProgress: false,
      };
      notifyStateListeners();
      emitEvent('SIGN_OUT');
    },
  };
}
