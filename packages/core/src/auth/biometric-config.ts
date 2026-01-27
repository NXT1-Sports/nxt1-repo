/**
 * @fileoverview Biometric Configuration for Auth State Manager
 * @module @nxt1/core/auth
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Defines biometric authentication configuration and enrollment state
 * that integrates with the AuthStateManager.
 *
 * This allows:
 * - Storing biometric enrollment status
 * - Configuring biometric behavior (auto-prompt, fallback)
 * - Tracking which users have enrolled
 *
 * The actual biometric authentication (Face ID, Touch ID, Fingerprint)
 * is implemented in platform-specific services, but the state is
 * managed here for consistency.
 *
 * @example
 * ```typescript
 * import { createAuthStateManager, type BiometricConfig } from '@nxt1/core/auth';
 *
 * const authManager = createAuthStateManager(storage, {
 *   biometric: {
 *     enabled: true,
 *     autoPromptAfterSignIn: true,
 *     allowedMethods: ['face', 'fingerprint'],
 *   },
 * });
 *
 * // Check if user has enrolled
 * const isEnrolled = await authManager.isBiometricEnrolled();
 *
 * // Save enrollment after successful biometric setup
 * await authManager.setBiometricEnrolled(true);
 * ```
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

// ============================================
// BIOMETRIC TYPES
// ============================================

/**
 * Biometric authentication method types
 */
export const BIOMETRIC_METHODS = {
  FACE: 'face',
  FINGERPRINT: 'fingerprint',
  IRIS: 'iris',
} as const;

export type BiometricMethod = (typeof BIOMETRIC_METHODS)[keyof typeof BIOMETRIC_METHODS];

/**
 * Biometric availability status
 */
export const BIOMETRIC_AVAILABILITY = {
  AVAILABLE: 'available',
  NOT_AVAILABLE: 'not_available',
  NOT_ENROLLED: 'not_enrolled',
  LOCKED_OUT: 'locked_out',
} as const;

export type BiometricAvailability =
  (typeof BIOMETRIC_AVAILABILITY)[keyof typeof BIOMETRIC_AVAILABILITY];

/**
 * Biometric configuration options
 */
export interface BiometricConfig {
  /**
   * Whether biometric auth is enabled for this app
   * Set to false to disable all biometric features
   */
  readonly enabled: boolean;

  /**
   * Automatically prompt for biometric enrollment after sign-in
   * If true, shows enrollment prompt after first successful email sign-in
   */
  readonly autoPromptAfterSignIn: boolean;

  /**
   * Automatically prompt for biometric enrollment after sign-up
   * If true, shows enrollment prompt after onboarding completion
   */
  readonly autoPromptAfterSignUp: boolean;

  /**
   * Allowed biometric methods (device must support at least one)
   */
  readonly allowedMethods: readonly BiometricMethod[];

  /**
   * Allow fallback to device credentials (PIN/pattern/password)
   * when biometric fails
   */
  readonly allowDeviceCredentialFallback: boolean;

  /**
   * Maximum authentication attempts before lockout
   * (Android only, iOS handles this automatically)
   */
  readonly maxAttempts: number;

  /**
   * Time in milliseconds to suppress enrollment prompts after user dismisses
   * Prevents nagging the user repeatedly
   */
  readonly promptCooldownMs: number;
}

/**
 * Biometric enrollment state stored per user
 */
export interface BiometricEnrollmentState {
  /** Whether user has enrolled biometric for this device */
  readonly enrolled: boolean;

  /** Timestamp of enrollment */
  readonly enrolledAt?: number;

  /** Biometric method that was enrolled */
  readonly method?: BiometricMethod;

  /** User dismissed the enrollment prompt */
  readonly dismissed: boolean;

  /** Timestamp of last dismissal (for cooldown) */
  readonly dismissedAt?: number;

  /** Number of times user has dismissed the prompt */
  readonly dismissCount: number;
}

/**
 * Biometric session state (runtime, not persisted)
 */
export interface BiometricSessionState {
  /** Current availability status */
  readonly availability: BiometricAvailability;

  /** Available biometric method on this device */
  readonly availableMethod: BiometricMethod | null;

  /** Whether device supports any biometric */
  readonly isSupported: boolean;

  /** Whether biometric was used for current session */
  readonly usedForCurrentSession: boolean;
}

// ============================================
// DEFAULT CONFIG
// ============================================

/** 7 days in milliseconds */
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Default biometric configuration
 * Can be overridden when creating AuthStateManager
 */
export const DEFAULT_BIOMETRIC_CONFIG: BiometricConfig = Object.freeze({
  enabled: true,
  autoPromptAfterSignIn: true,
  autoPromptAfterSignUp: true,
  allowedMethods: Object.freeze([BIOMETRIC_METHODS.FACE, BIOMETRIC_METHODS.FINGERPRINT]),
  allowDeviceCredentialFallback: true,
  maxAttempts: 5,
  promptCooldownMs: SEVEN_DAYS_MS,
});

/**
 * Initial biometric enrollment state
 */
export const INITIAL_BIOMETRIC_ENROLLMENT: BiometricEnrollmentState = Object.freeze({
  enrolled: false,
  dismissed: false,
  dismissCount: 0,
});

/**
 * Initial biometric session state
 */
export const INITIAL_BIOMETRIC_SESSION: BiometricSessionState = Object.freeze({
  availability: BIOMETRIC_AVAILABILITY.NOT_AVAILABLE,
  availableMethod: null,
  isSupported: false,
  usedForCurrentSession: false,
});

// ============================================
// STORAGE KEYS
// ============================================

/**
 * Storage key prefix for biometric data
 */
export const BIOMETRIC_STORAGE_PREFIX = 'nxt1:biometric:';

/**
 * Get storage key for user's biometric enrollment
 */
export function getBiometricEnrollmentKey(userId: string): string {
  return `${BIOMETRIC_STORAGE_PREFIX}enrollment:${userId}`;
}

/**
 * Get storage key for global biometric settings
 */
export function getBiometricSettingsKey(): string {
  return `${BIOMETRIC_STORAGE_PREFIX}settings`;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if biometric enrollment prompt should be shown
 *
 * @param enrollment - Current enrollment state
 * @param config - Biometric config
 * @param isSignIn - Whether this is after sign-in (vs sign-up)
 * @returns true if prompt should be shown
 */
export function shouldShowBiometricPrompt(
  enrollment: BiometricEnrollmentState,
  config: BiometricConfig,
  isSignIn: boolean
): boolean {
  // Biometric disabled globally
  if (!config.enabled) return false;

  // Already enrolled
  if (enrollment.enrolled) return false;

  // Check auto-prompt setting
  if (isSignIn && !config.autoPromptAfterSignIn) return false;
  if (!isSignIn && !config.autoPromptAfterSignUp) return false;

  // Check cooldown after dismissal
  if (enrollment.dismissed && enrollment.dismissedAt) {
    const elapsed = Date.now() - enrollment.dismissedAt;
    if (elapsed < config.promptCooldownMs) return false;
  }

  // Show prompt
  return true;
}

/**
 * Check if user has exceeded maximum dismiss count
 *
 * @param enrollment - Current enrollment state
 * @param maxDismissals - Maximum allowed dismissals (default: 3)
 * @returns true if user has dismissed too many times
 */
export function hasExceededDismissals(
  enrollment: BiometricEnrollmentState,
  maxDismissals = 3
): boolean {
  return enrollment.dismissCount >= maxDismissals;
}

/**
 * Get user-friendly biometric name
 *
 * @param method - Biometric method
 * @param platform - Platform ('ios' | 'android')
 * @returns User-friendly name
 */
export function getBiometricDisplayName(
  method: BiometricMethod | null,
  platform: 'ios' | 'android' | 'web' = 'ios'
): string {
  if (!method) return 'Biometric';

  switch (method) {
    case 'face':
      return platform === 'ios' ? 'Face ID' : 'Face Unlock';
    case 'fingerprint':
      return platform === 'ios' ? 'Touch ID' : 'Fingerprint';
    case 'iris':
      return 'Iris Scan';
    default:
      return 'Biometric';
  }
}

/**
 * Merge partial biometric config with defaults
 */
export function mergeBiometricConfig(partial?: Partial<BiometricConfig>): BiometricConfig {
  if (!partial) return { ...DEFAULT_BIOMETRIC_CONFIG };

  return {
    ...DEFAULT_BIOMETRIC_CONFIG,
    ...partial,
    allowedMethods: partial.allowedMethods ?? DEFAULT_BIOMETRIC_CONFIG.allowedMethods,
  };
}
