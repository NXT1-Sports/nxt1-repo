/**
 * @fileoverview Shared Test Data Constants
 * @module @nxt1/core/testing
 *
 * ⭐ SINGLE SOURCE OF TRUTH FOR ALL TEST DATA ⭐
 *
 * This module provides shared test data constants used across:
 * - Unit tests (Vitest)
 * - Integration tests (Angular TestBed)
 * - E2E tests (Playwright, Detox)
 * - Backend tests (Vitest)
 *
 * All test data is pure TypeScript with zero platform dependencies.
 *
 * @example
 * ```typescript
 * import {
 *   VALIDATION_DATA,
 *   AUTH_ERROR_PATTERNS,
 *   TEST_PROFILES,
 *   ROUTES,
 *   TIMEOUTS,
 * } from '@nxt1/core/testing';
 *
 * // Validation testing
 * for (const email of VALIDATION_DATA.INVALID_EMAILS) {
 *   expect(isValidEmail(email)).toBe(false);
 * }
 *
 * // E2E navigation
 * await page.goto(ROUTES.AUTH.LOGIN);
 * ```
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

import type { UserRole } from '../auth/auth.types';

// =============================================================================
// VALIDATION TEST DATA
// =============================================================================

/**
 * Invalid email formats for validation testing
 * Covers edge cases: empty, malformed, missing parts
 */
export const INVALID_EMAILS = [
  '',
  'invalid',
  'invalid@',
  '@example.com',
  'invalid@.com',
  'invalid@example',
  'invalid email@example.com',
  'invalid..email@example.com',
  'invalid@example..com',
  '.invalid@example.com',
  'invalid.@example.com',
] as const;

/**
 * Valid email formats for positive validation testing
 */
export const VALID_EMAILS = [
  'test@example.com',
  'test.user@example.com',
  'test+tag@example.com',
  'test_user@example.co.uk',
  'user123@subdomain.example.org',
  'first.last@company.io',
] as const;

/**
 * Weak passwords that should fail validation
 */
export const WEAK_PASSWORDS = [
  '',
  '12345',
  'password',
  'abc',
  '123456',
  'qwerty',
  'letmein',
] as const;

/**
 * Strong passwords that should pass validation
 */
export const STRONG_PASSWORDS = [
  'Password123!',
  'SecureP@ss1',
  'MyStr0ng!Pass',
  'C0mpl3x#Passw0rd',
  'Test!ng123$',
] as const;

/**
 * Consolidated validation test data
 */
export const VALIDATION_DATA = {
  INVALID_EMAILS,
  VALID_EMAILS,
  WEAK_PASSWORDS,
  STRONG_PASSWORDS,

  /** Minimum password length */
  MIN_PASSWORD_LENGTH: 8,

  /** Maximum password length */
  MAX_PASSWORD_LENGTH: 128,

  /** Minimum name length */
  MIN_NAME_LENGTH: 2,

  /** Maximum name length */
  MAX_NAME_LENGTH: 50,
} as const;

// =============================================================================
// AUTH ERROR PATTERNS (for E2E assertions)
// =============================================================================

/**
 * Regex patterns for matching auth error messages in UI
 * Used in E2E tests to verify error states
 */
export const AUTH_ERROR_PATTERNS = {
  /** Invalid email format error */
  INVALID_EMAIL: /invalid email|email.*invalid|please enter.*valid.*email/i,

  /** Email required error */
  EMAIL_REQUIRED: /email.*required|enter.*email|email.*empty/i,

  /** Password required error */
  PASSWORD_REQUIRED: /password.*required|enter.*password|password.*empty/i,

  /** Password too short error */
  PASSWORD_TOO_SHORT: /password.*short|minimum.*characters|at least.*characters/i,

  /** Password too weak error */
  PASSWORD_TOO_WEAK: /password.*weak|stronger.*password|must contain/i,

  /** Invalid credentials error */
  INVALID_CREDENTIALS: /invalid.*credentials|wrong.*password|user.*not.*found|incorrect.*password/i,

  /** Email already in use error */
  EMAIL_IN_USE: /email.*already.*use|account.*exists|email.*registered/i,

  /** Network error */
  NETWORK_ERROR: /network.*error|connection.*failed|unable.*connect|offline/i,

  /** Too many attempts error */
  TOO_MANY_ATTEMPTS: /too many.*attempts|try.*later|temporarily.*blocked|rate.*limit/i,

  /** Account disabled error */
  ACCOUNT_DISABLED: /account.*disabled|account.*suspended|contact.*support/i,

  /** Email not verified error */
  EMAIL_NOT_VERIFIED: /email.*not.*verified|verify.*email|confirmation.*email/i,

  /** Session expired error */
  SESSION_EXPIRED: /session.*expired|sign.*in.*again|re-authenticate/i,

  /** Generic error fallback */
  GENERIC_ERROR: /error|something.*wrong|try.*again/i,
} as const;

/**
 * @deprecated Use AUTH_ERROR_PATTERNS instead
 * Kept for backwards compatibility with existing E2E tests
 */
export const AUTH_ERRORS = AUTH_ERROR_PATTERNS;

// =============================================================================
// TEST USER PROFILES
// =============================================================================

/**
 * Test profile data for different user roles
 * Used in E2E tests for onboarding flows
 */
export interface TestProfile {
  role: UserRole;
  displayName: string;
  sport?: string;
  position?: string;
  gradYear?: number;
  team?: string;
  childName?: string;
  organization?: string;
  outlet?: string;
}

/**
 * Pre-configured test profiles for each user role
 */
export const TEST_PROFILES: Record<UserRole, TestProfile> = {
  athlete: {
    role: 'athlete',
    displayName: 'Test Athlete',
    sport: 'Basketball',
    position: 'Point Guard',
    gradYear: 2026,
  },
  coach: {
    role: 'coach',
    displayName: 'Coach Test',
    sport: 'Basketball',
    team: 'Test High School',
  },
  parent: {
    role: 'parent',
    displayName: 'Parent Test',
    childName: 'Test Athlete Jr',
  },
  recruiter: {
    role: 'recruiter',
    displayName: 'Recruiter Test',
    organization: 'Test University',
    sport: 'Football',
  },
  director: {
    role: 'director',
    displayName: 'Director Test',
    organization: 'Test High School',
  },
} as const;

// =============================================================================
// TIMEOUTS
// =============================================================================

/**
 * Standard timeout values for tests
 * Consistent across unit, integration, and E2E tests
 */
export const TIMEOUTS = {
  /** Short timeout for quick operations (5s) */
  SHORT: 5_000,

  /** Default timeout for most operations (15s) */
  DEFAULT: 15_000,

  /** Long timeout for slow operations (30s) */
  LONG: 30_000,

  /** Extended timeout for very slow operations (60s) */
  EXTENDED: 60_000,

  /** Navigation timeout (30s) */
  NAVIGATION: 30_000,

  /** Animation timeout (1s) */
  ANIMATION: 1_000,

  /** API request timeout (10s) */
  API_REQUEST: 10_000,

  /** File upload timeout (60s) */
  FILE_UPLOAD: 60_000,

  /** Auth operation timeout (20s) */
  AUTH_OPERATION: 20_000,

  /** Token refresh buffer (5 minutes before expiry) */
  TOKEN_REFRESH_BUFFER: 5 * 60 * 1000,
} as const;

/**
 * @deprecated Use TIMEOUTS with uppercase keys instead
 * Kept for backwards compatibility
 */
export const TIMEOUT_VALUES = {
  short: TIMEOUTS.SHORT,
  default: TIMEOUTS.DEFAULT,
  long: TIMEOUTS.LONG,
  extended: TIMEOUTS.EXTENDED,
  navigation: TIMEOUTS.NAVIGATION,
  animation: TIMEOUTS.ANIMATION,
} as const;

// =============================================================================
// ROUTES
// =============================================================================

/**
 * Application routes for E2E navigation
 * Centralized route definitions ensure consistency across tests
 */
export const ROUTES = {
  /** Authentication routes */
  AUTH: {
    /** Login page */
    LOGIN: '/auth',
    /** Signup page */
    SIGNUP: '/auth?mode=signup',
    /** Forgot password page */
    FORGOT_PASSWORD: '/auth/forgot-password',
    /** Onboarding flow */
    ONBOARDING: '/auth/onboarding',
    /** Email verification */
    VERIFY_EMAIL: '/auth/verify-email',
    /** Password reset */
    RESET_PASSWORD: '/auth/reset-password',
  },

  /** Main app routes (post-auth) */
  APP: {
    /** Home/feed page */
    HOME: '/home',
    /** User profile */
    PROFILE: '/profile',
    /** Profile edit */
    PROFILE_EDIT: '/profile/edit',
    /** Settings */
    SETTINGS: '/settings',
    /** Notifications */
    NOTIFICATIONS: '/notifications',
  },

  /** Explore/discovery routes */
  EXPLORE: {
    /** Main explore page */
    INDEX: '/explore',
    /** Athletes list */
    ATHLETES: '/explore/athletes',
    /** Teams list */
    TEAMS: '/explore/teams',
    /** Colleges list */
    COLLEGES: '/explore/colleges',
    /** Rankings */
    RANKINGS: '/rankings',
  },

  /** Team routes */
  TEAM: {
    /** Team list */
    LIST: '/teams',
    /** Team creation */
    CREATE: '/teams/create',
    /** Team detail (requires :teamId) */
    DETAIL: '/team',
  },

  /** Static/legal routes */
  STATIC: {
    /** Terms of service */
    TERMS: '/legal/terms',
    /** Privacy policy */
    PRIVACY: '/legal/privacy',
    /** About page */
    ABOUT: '/about',
    /** Contact page */
    CONTACT: '/contact',
  },
} as const;

// =============================================================================
// TEST ENVIRONMENT
// =============================================================================

/**
 * Test environment configuration
 */
export const TEST_ENV = {
  /** Test user email domain */
  EMAIL_DOMAIN: 'test.nxt1.com',

  /** Test user email prefix */
  EMAIL_PREFIX: 'e2e-test',

  /** Default test password */
  DEFAULT_PASSWORD: 'TestPassword123!',

  /** Firebase emulator host */
  FIREBASE_EMULATOR_HOST: 'localhost:9099',

  /** API base URL for testing */
  API_BASE_URL: 'http://localhost:3000/v1',

  /** Web app base URL for E2E */
  WEB_BASE_URL: 'http://localhost:4500',
} as const;

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Generate a unique test email
 * @param prefix - Optional prefix for the email
 * @returns Unique test email address
 */
export function generateTestEmail(prefix = 'test'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}@${TEST_ENV.EMAIL_DOMAIN}`;
}

/**
 * Generate test credentials
 * @param overrides - Optional overrides
 * @returns Test credentials object
 */
export function generateTestCredentials(overrides?: { email?: string; password?: string }): {
  email: string;
  password: string;
} {
  return {
    email: overrides?.email ?? generateTestEmail(),
    password: overrides?.password ?? TEST_ENV.DEFAULT_PASSWORD,
  };
}

/**
 * Generate a test profile for a given role
 * @param role - User role
 * @param overrides - Optional overrides
 * @returns Test profile object
 */
export function generateTestProfile(role: UserRole, overrides?: Partial<TestProfile>): TestProfile {
  return {
    ...TEST_PROFILES[role],
    ...overrides,
  };
}

// =============================================================================
// COMBINED EXPORTS
// =============================================================================

/**
 * All test data combined for easy import
 */
export const TEST_DATA = {
  VALIDATION: VALIDATION_DATA,
  ERROR_PATTERNS: AUTH_ERROR_PATTERNS,
  PROFILES: TEST_PROFILES,
  TIMEOUTS,
  ROUTES,
  ENV: TEST_ENV,
} as const;
