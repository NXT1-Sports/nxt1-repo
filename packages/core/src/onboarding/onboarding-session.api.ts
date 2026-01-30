/**
 * Onboarding Session Persistence API - Pure TypeScript Functions
 *
 * ⭐ THIS FILE IS 100% PORTABLE TO MOBILE ⭐
 *
 * Contains pure functions for localStorage/sessionStorage persistence.
 * Allows users to resume onboarding if they leave and come back.
 *
 * Features:
 * - Saves current step index and form data
 * - Validates session freshness (expires after 24 hours)
 * - User-specific sessions (keyed by userId)
 * - Works with any StorageAdapter (browser, Capacitor, etc.)
 *
 * @module @nxt1/core/onboarding
 * @version 2.0.0
 */

import type { StorageAdapter } from '../storage/storage-adapter';
import { STORAGE_KEYS } from '../storage/storage-adapter';
import type {
  OnboardingUserType,
  OnboardingFormData,
  OnboardingStepId,
} from './onboarding-navigation.api';

// ============================================
// TYPES
// ============================================

/**
 * Persisted onboarding session data
 */
export interface OnboardingSession {
  /** User ID this session belongs to */
  userId: string;
  /** Current step index */
  stepIndex: number;
  /** Selected role (null if not yet selected) */
  selectedRole: OnboardingUserType | null;
  /** Completed step IDs */
  completedSteps: OnboardingStepId[];
  /** Form data collected so far */
  formData: Partial<OnboardingFormData>;
  /** Timestamp when session was created */
  createdAt: number;
  /** Timestamp of last update */
  updatedAt: number;
  /** Session version for migration support */
  version: number;
}

/**
 * Options for creating/restoring session
 */
export interface SessionOptions {
  /** Session expiry time in milliseconds (default: 24 hours) */
  expiryMs?: number;
  /** Current session version */
  version?: number;
}

// ============================================
// CONSTANTS
// ============================================

/** Default session expiry: 24 hours */
const DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1000;

/** Current session version (increment when schema changes) */
const CURRENT_SESSION_VERSION = 1;

/** Storage key for onboarding session */
const SESSION_KEY = STORAGE_KEYS.ONBOARDING_SESSION;

// ============================================
// PURE FUNCTIONS
// ============================================

/**
 * Build storage key for user-specific session
 * @param userId - User ID
 * @returns Storage key
 */
export function getSessionKey(userId: string): string {
  return `${SESSION_KEY}_${userId}`;
}

/**
 * Check if session is expired
 * @param session - Session to check
 * @param expiryMs - Expiry time in milliseconds
 * @returns True if session is expired
 */
export function isSessionExpired(
  session: OnboardingSession,
  expiryMs: number = DEFAULT_EXPIRY_MS
): boolean {
  const now = Date.now();
  return now - session.updatedAt > expiryMs;
}

/**
 * Check if session is valid (correct version, not expired, same user)
 * @param session - Session to validate
 * @param userId - Expected user ID
 * @param options - Validation options
 * @returns True if session is valid
 */
export function isSessionValid(
  session: OnboardingSession | null,
  userId: string,
  options: SessionOptions = {}
): boolean {
  if (!session) return false;

  const { expiryMs = DEFAULT_EXPIRY_MS, version = CURRENT_SESSION_VERSION } = options;

  // Check user ID matches
  if (session.userId !== userId) return false;

  // Check version matches (for migration support)
  if (session.version !== version) return false;

  // Check if expired
  if (isSessionExpired(session, expiryMs)) return false;

  return true;
}

/**
 * Create a new onboarding session
 * @param userId - User ID
 * @returns New session object
 */
export function createSession(userId: string): OnboardingSession {
  const now = Date.now();
  return {
    userId,
    stepIndex: 0,
    selectedRole: null,
    completedSteps: [],
    formData: {},
    createdAt: now,
    updatedAt: now,
    version: CURRENT_SESSION_VERSION,
  };
}

/**
 * Update session with new data
 * @param session - Existing session
 * @param updates - Partial updates
 * @returns Updated session
 */
export function updateSession(
  session: OnboardingSession,
  updates: Partial<Omit<OnboardingSession, 'userId' | 'createdAt' | 'version'>>
): OnboardingSession {
  return {
    ...session,
    ...updates,
    updatedAt: Date.now(),
  };
}

// ============================================
// STORAGE OPERATIONS (Async)
// ============================================

/**
 * Save session to storage
 * @param storage - Storage adapter
 * @param session - Session to save
 */
export async function saveSession(
  storage: StorageAdapter,
  session: OnboardingSession
): Promise<void> {
  const key = getSessionKey(session.userId);
  await storage.setJSON(key, session);
}

/**
 * Load session from storage
 * @param storage - Storage adapter
 * @param userId - User ID
 * @returns Session or null if not found
 */
export async function loadSession(
  storage: StorageAdapter,
  userId: string
): Promise<OnboardingSession | null> {
  const key = getSessionKey(userId);
  return storage.getJSON<OnboardingSession>(key);
}

/**
 * Delete session from storage
 * @param storage - Storage adapter
 * @param userId - User ID
 */
export async function deleteSession(storage: StorageAdapter, userId: string): Promise<void> {
  const key = getSessionKey(userId);
  await storage.remove(key);
}

/**
 * Load and validate session, return null if invalid
 * @param storage - Storage adapter
 * @param userId - User ID
 * @param options - Validation options
 * @returns Valid session or null
 */
export async function loadValidSession(
  storage: StorageAdapter,
  userId: string,
  options: SessionOptions = {}
): Promise<OnboardingSession | null> {
  const session = await loadSession(storage, userId);

  if (!isSessionValid(session, userId, options)) {
    // Clean up invalid session
    if (session) {
      await deleteSession(storage, userId);
    }
    return null;
  }

  return session;
}

/**
 * Save or create session
 * If no valid session exists, creates a new one
 * @param storage - Storage adapter
 * @param userId - User ID
 * @param updates - Updates to apply
 * @returns Updated or new session
 */
export async function saveOrCreateSession(
  storage: StorageAdapter,
  userId: string,
  updates: Partial<Omit<OnboardingSession, 'userId' | 'createdAt' | 'version'>>
): Promise<OnboardingSession> {
  let session = await loadValidSession(storage, userId);

  if (!session) {
    session = createSession(userId);
  }

  const updatedSession = updateSession(session, updates);
  await saveSession(storage, updatedSession);
  return updatedSession;
}

// ============================================
// API FACTORY
// ============================================

/**
 * Create Onboarding Session API bound to a storage adapter
 *
 * @example
 * ```typescript
 * import { createBrowserStorage } from '@nxt1/core/storage';
 *
 * const storage = createBrowserStorage();
 * const sessionApi = createOnboardingSessionApi(storage);
 *
 * // Restore session on load
 * const session = await sessionApi.loadValidSession('user123');
 * if (session) {
 *   // Resume from saved state
 *   setStepIndex(session.stepIndex);
 *   setFormData(session.formData);
 * }
 *
 * // Save progress on each step
 * await sessionApi.saveOrCreateSession('user123', {
 *   stepIndex: 2,
 *   formData: { profile: { firstName: 'John', lastName: 'Doe' } },
 * });
 * ```
 */
export function createOnboardingSessionApi(storage: StorageAdapter) {
  return {
    // Session management
    createSession,
    updateSession,
    isSessionValid,
    isSessionExpired,
    getSessionKey,

    // Storage operations (bound to adapter)
    saveSession: (session: OnboardingSession) => saveSession(storage, session),
    loadSession: (userId: string) => loadSession(storage, userId),
    deleteSession: (userId: string) => deleteSession(storage, userId),
    loadValidSession: (userId: string, options?: SessionOptions) =>
      loadValidSession(storage, userId, options),
    saveOrCreateSession: (
      userId: string,
      updates: Partial<Omit<OnboardingSession, 'userId' | 'createdAt' | 'version'>>
    ) => saveOrCreateSession(storage, userId, updates),
  };
}

export type OnboardingSessionApi = ReturnType<typeof createOnboardingSessionApi>;
