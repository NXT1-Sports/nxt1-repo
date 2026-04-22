/**
 * @fileoverview Auth Test Fixtures
 * @module @nxt1/core/testing
 *
 * ⭐ SHARED TEST FIXTURES FOR WEB AND MOBILE ⭐
 *
 * Provides consistent mock data for authentication testing across all platforms.
 * These fixtures ensure tests have predictable, realistic data without hardcoding.
 *
 * Usage:
 * ```typescript
 * import { createMockAuthUser, AUTH_FIXTURES } from '@nxt1/core/testing';
 *
 * const athlete = createMockAuthUser({ role: 'athlete' });
 * const expiredToken = AUTH_FIXTURES.tokens.expired;
 * ```
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import type {
  AuthUser,
  AuthState,
  StoredAuthToken,
  UserRole,
  AuthProvider,
  FirebaseUserInfo,
  SignInCredentials,
  SignUpCredentials,
} from '../auth/auth.types';
import { INITIAL_AUTH_STATE } from '../auth/auth.types';

// ============================================
// TIME CONSTANTS (Deterministic for tests)
// ============================================

/** Base timestamp for all test fixtures (2026-01-01T00:00:00.000Z) */
export const TEST_BASE_TIMESTAMP = 1767225600000;

/** One hour in milliseconds */
export const ONE_HOUR = 60 * 60 * 1000;

/** One day in milliseconds */
export const ONE_DAY = 24 * ONE_HOUR;

/** Token TTL (1 hour) */
export const TOKEN_TTL = ONE_HOUR;

// ============================================
// USER ID GENERATORS
// ============================================

/** Counter for generating unique IDs in tests */
let userIdCounter = 0;

/**
 * Generate a unique user ID for tests
 * Resets between test suites via resetFixtureCounters()
 */
export function generateTestUserId(): string {
  return `test-user-${++userIdCounter}`;
}

/**
 * Reset all fixture counters (call in beforeEach/afterEach)
 */
export function resetFixtureCounters(): void {
  userIdCounter = 0;
}

// ============================================
// USER FIXTURES
// ============================================

/**
 * Default mock auth user values
 * These can be overridden via createMockAuthUser()
 */
export const DEFAULT_MOCK_USER: AuthUser = {
  uid: 'test-user-001',
  email: 'test@example.com',
  displayName: 'Test User',
  profileImg: 'https://example.com/photo.jpg',
  role: 'athlete',
  hasCompletedOnboarding: true,
  provider: 'email',
  emailVerified: true,
  createdAt: new Date(TEST_BASE_TIMESTAMP).toISOString(),
  updatedAt: new Date(TEST_BASE_TIMESTAMP).toISOString(),
};

/**
 * Create a mock AuthUser with custom overrides
 *
 * @param overrides - Partial user properties to override defaults
 * @returns Complete AuthUser object for testing
 *
 * @example
 * ```typescript
 * const athlete = createMockAuthUser({ role: 'athlete' });
 * const coach = createMockAuthUser({ role: 'coach', displayName: 'Coach Smith' });
 * ```
 */
export function createMockAuthUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    ...DEFAULT_MOCK_USER,
    uid: generateTestUserId(),
    ...overrides,
  };
}

/**
 * Pre-configured user fixtures for common test scenarios
 */
export const USER_FIXTURES = {
  /** Standard athlete user (default) */
  athlete: createMockAuthUser({
    uid: 'athlete-001',
    email: 'athlete@example.com',
    displayName: 'John Athlete',
    role: 'athlete',
  }),

  /** Coach user */
  coach: createMockAuthUser({
    uid: 'coach-001',
    email: 'coach@example.com',
    displayName: 'Coach Smith',
    role: 'coach',
  }),

  /** Director user (athletic director, program director) */
  director: createMockAuthUser({
    uid: 'director-001',
    email: 'director@example.com',
    displayName: 'Director Davis',
    role: 'director',
  }),

  /** @deprecated No longer applicable — premium subscriptions removed */
  premiumAthlete: createMockAuthUser({
    uid: 'premium-athlete-001',
    email: 'premium@example.com',
    displayName: 'Premium Athlete',
    role: 'athlete',
  }),

  /** User who hasn't completed onboarding */
  incompleteOnboarding: createMockAuthUser({
    uid: 'incomplete-001',
    email: 'incomplete@example.com',
    displayName: 'New User',
    hasCompletedOnboarding: false,
  }),

  /** User with unverified email */
  unverifiedEmail: createMockAuthUser({
    uid: 'unverified-001',
    email: 'unverified@example.com',
    emailVerified: false,
  }),

  /** Google OAuth user */
  googleUser: createMockAuthUser({
    uid: 'google-001',
    email: 'google@gmail.com',
    displayName: 'Google User',
    provider: 'google',
    profileImg: 'https://lh3.googleusercontent.com/photo.jpg',
  }),

  /** Apple OAuth user */
  appleUser: createMockAuthUser({
    uid: 'apple-001',
    email: 'apple@icloud.com',
    displayName: 'Apple User',
    provider: 'apple',
  }),
} as const;

// ============================================
// FIREBASE USER INFO FIXTURES
// ============================================

/**
 * Create mock FirebaseUserInfo from AuthUser
 *
 * @param user - AuthUser to convert
 * @returns FirebaseUserInfo object
 */
export function createMockFirebaseUser(user: AuthUser): FirebaseUserInfo {
  const creationTime =
    typeof user.createdAt === 'string' ? user.createdAt : user.createdAt.toISOString();
  const lastSignInTime =
    typeof user.updatedAt === 'string' ? user.updatedAt : user.updatedAt.toISOString();

  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.profileImg ?? null,
    emailVerified: user.emailVerified,
    metadata: {
      creationTime,
      lastSignInTime,
    },
  };
}

// ============================================
// AUTH STATE FIXTURES
// ============================================

/**
 * Create a mock AuthState with custom overrides
 *
 * @param overrides - Partial state properties to override
 * @returns Complete AuthState for testing
 */
export function createMockAuthState(overrides: Partial<AuthState> = {}): AuthState {
  return {
    ...INITIAL_AUTH_STATE,
    isLoading: false,
    isInitialized: true,
    ...overrides,
  };
}

/**
 * Pre-configured auth state fixtures for common scenarios
 */
export const STATE_FIXTURES = {
  /** Initial loading state */
  loading: createMockAuthState({
    isLoading: true,
    isInitialized: false,
    user: null,
  }),

  /** Authenticated state with athlete user */
  authenticated: createMockAuthState({
    user: USER_FIXTURES.athlete,
    firebaseUser: createMockFirebaseUser(USER_FIXTURES.athlete),
    isLoading: false,
    isInitialized: true,
  }),

  /** @deprecated No longer applicable — premium subscriptions removed */
  authenticatedPremium: createMockAuthState({
    user: USER_FIXTURES.premiumAthlete,
    firebaseUser: createMockFirebaseUser(USER_FIXTURES.premiumAthlete),
    isLoading: false,
    isInitialized: true,
  }),

  /** Authenticated coach */
  authenticatedCoach: createMockAuthState({
    user: USER_FIXTURES.coach,
    firebaseUser: createMockFirebaseUser(USER_FIXTURES.coach),
    isLoading: false,
    isInitialized: true,
  }),

  /** Unauthenticated state */
  unauthenticated: createMockAuthState({
    user: null,
    firebaseUser: null,
    isLoading: false,
    isInitialized: true,
  }),

  /** Error state */
  error: createMockAuthState({
    user: null,
    error: 'Authentication failed',
    isLoading: false,
    isInitialized: true,
  }),

  /** User needs to complete onboarding */
  needsOnboarding: createMockAuthState({
    user: USER_FIXTURES.incompleteOnboarding,
    firebaseUser: createMockFirebaseUser(USER_FIXTURES.incompleteOnboarding),
    isLoading: false,
    isInitialized: true,
  }),
} as const;

// ============================================
// TOKEN FIXTURES
// ============================================

/**
 * Create a mock StoredAuthToken
 *
 * @param overrides - Token properties to override
 * @param options - Creation options
 * @returns StoredAuthToken for testing
 */
export function createMockToken(
  overrides: Partial<StoredAuthToken> = {},
  options: { expired?: boolean; expiresIn?: number } = {}
): StoredAuthToken {
  const now = TEST_BASE_TIMESTAMP;
  const expiresIn = options.expiresIn ?? TOKEN_TTL;
  const expiresAt = options.expired ? now - ONE_HOUR : now + expiresIn;

  return {
    token: `mock-token-${Math.random().toString(36).substring(7)}`,
    expiresAt,
    refreshToken: `mock-refresh-${Math.random().toString(36).substring(7)}`,
    userId: 'test-user-001',
    ...overrides,
  };
}

/**
 * Pre-configured token fixtures
 */
export const TOKEN_FIXTURES = {
  /** Valid token (expires in 1 hour) */
  valid: createMockToken({
    token: 'valid-token-001',
    refreshToken: 'valid-refresh-001',
    userId: USER_FIXTURES.athlete.uid,
  }),

  /** Expired token */
  expired: createMockToken(
    {
      token: 'expired-token-001',
      refreshToken: 'expired-refresh-001',
      userId: USER_FIXTURES.athlete.uid,
    },
    { expired: true }
  ),

  /** Token expiring soon (within 5 minute buffer) */
  expiringSoon: createMockToken({
    token: 'expiring-token-001',
    refreshToken: 'expiring-refresh-001',
    userId: USER_FIXTURES.athlete.uid,
    expiresAt: TEST_BASE_TIMESTAMP + 4 * 60 * 1000, // 4 minutes
  }),

  /** Token without refresh token */
  noRefresh: createMockToken({
    token: 'no-refresh-token-001',
    refreshToken: undefined,
    userId: USER_FIXTURES.athlete.uid,
  }),
} as const;

// ============================================
// CREDENTIAL FIXTURES
// ============================================

/**
 * Create mock sign-in credentials
 */
export function createMockSignInCredentials(
  overrides: Partial<SignInCredentials> = {}
): SignInCredentials {
  return {
    email: 'test@example.com',
    password: 'Password123!',
    ...overrides,
  };
}

/**
 * Create mock sign-up credentials
 */
export function createMockSignUpCredentials(
  overrides: Partial<SignUpCredentials> = {}
): SignUpCredentials {
  return {
    email: 'newuser@example.com',
    password: 'Password123!',
    firstName: 'New',
    lastName: 'User',
    userType: 'athlete',
    ...overrides,
  };
}

/**
 * Pre-configured credential fixtures
 */
export const CREDENTIAL_FIXTURES = {
  /** Valid sign-in credentials */
  validSignIn: createMockSignInCredentials(),

  /** Invalid email */
  invalidEmail: createMockSignInCredentials({
    email: 'invalid-email',
  }),

  /** Weak password */
  weakPassword: createMockSignInCredentials({
    password: '123',
  }),

  /** Valid sign-up credentials */
  validSignUp: createMockSignUpCredentials(),

  /** Sign-up with team code */
  signUpWithTeam: createMockSignUpCredentials({
    teamCode: 'TEAM-CODE-001',
  }),

  /** Sign-up as coach */
  coachSignUp: createMockSignUpCredentials({
    userType: 'coach',
    email: 'coach@school.edu',
    firstName: 'Coach',
    lastName: 'Smith',
  }),
} as const;

// ============================================
// ERROR FIXTURES
// ============================================

/**
 * Mock Firebase error object
 */
export interface MockFirebaseError {
  code: string;
  message: string;
  name: string;
}

/**
 * Create a mock Firebase auth error
 *
 * @param code - Firebase error code
 * @param message - Optional custom message
 */
export function createMockFirebaseError(code: string, message?: string): MockFirebaseError {
  return {
    code,
    message: message ?? `Firebase: Error (${code})`,
    name: 'FirebaseError',
  };
}

/**
 * Pre-configured error fixtures for common auth errors
 */
export const ERROR_FIXTURES = {
  /** Invalid credentials */
  invalidCredential: createMockFirebaseError('auth/invalid-credential'),

  /** User not found */
  userNotFound: createMockFirebaseError('auth/user-not-found'),

  /** Email already in use */
  emailInUse: createMockFirebaseError('auth/email-already-in-use'),

  /** Weak password */
  weakPassword: createMockFirebaseError('auth/weak-password'),

  /** Too many requests */
  tooManyRequests: createMockFirebaseError('auth/too-many-requests'),

  /** Network error */
  networkError: createMockFirebaseError('auth/network-request-failed'),

  /** Popup closed */
  popupClosed: createMockFirebaseError('auth/popup-closed-by-user'),

  /** Requires recent login */
  requiresRecentLogin: createMockFirebaseError('auth/requires-recent-login'),

  /** Invalid email format */
  invalidEmail: createMockFirebaseError('auth/invalid-email'),

  /** Account disabled */
  userDisabled: createMockFirebaseError('auth/user-disabled'),

  /** Expired action code (password reset) */
  expiredActionCode: createMockFirebaseError('auth/expired-action-code'),

  /** Generic error (no code) */
  generic: { message: 'Something went wrong' },
} as const;

// ============================================
// COMBINED FIXTURES EXPORT
// ============================================

/**
 * All auth fixtures combined for easy import
 *
 * @example
 * ```typescript
 * import { AUTH_FIXTURES } from '@nxt1/core/testing';
 *
 * const user = AUTH_FIXTURES.users.athlete;
 * const state = AUTH_FIXTURES.states.authenticated;
 * const token = AUTH_FIXTURES.tokens.valid;
 * ```
 */
export const AUTH_FIXTURES = {
  users: USER_FIXTURES,
  states: STATE_FIXTURES,
  tokens: TOKEN_FIXTURES,
  credentials: CREDENTIAL_FIXTURES,
  errors: ERROR_FIXTURES,
  constants: {
    TEST_BASE_TIMESTAMP,
    ONE_HOUR,
    ONE_DAY,
    TOKEN_TTL,
  },
} as const;

// ============================================
// TYPE EXPORTS
// ============================================

export type { AuthUser, AuthState, StoredAuthToken, UserRole, AuthProvider };
