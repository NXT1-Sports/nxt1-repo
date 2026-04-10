/**
 * @fileoverview Auth Guards - Platform Agnostic
 * @module @nxt1/core/auth
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Pure TypeScript guard functions that can be wrapped by
 * framework-specific guards (Angular, React Router, etc.)
 *
 * These functions return boolean or redirect info - they don't
 * perform navigation themselves since that's framework-specific.
 *
 * @example Angular Usage
 * ```typescript
 * import { requireAuth } from '@nxt1/core/auth';
 *
 * export const authGuard: CanActivateFn = () => {
 *   const authManager = inject(AuthStateManager);
 *   const result = requireAuth(authManager.getState());
 *
 *   if (result.allowed) return true;
 *   return inject(Router).createUrlTree([result.redirectTo!]);
 * };
 * ```
 *
 * @example React Router Usage
 * ```typescript
 * import { requireAuth } from '@nxt1/core/auth';
 *
 * function ProtectedRoute({ children }) {
 *   const { authState } = useAuth();
 *   const result = requireAuth(authState);
 *
 *   if (!result.allowed) {
 *     return <Navigate to={result.redirectTo} />;
 *   }
 *   return children;
 * }
 * ```
 */

import type { AuthState, AuthUser, UserRole } from './auth.types';

// ============================================
// GUARD RESULT TYPES
// ============================================

/**
 * Result of a guard check
 */
export interface GuardResult {
  /** Whether access is allowed */
  allowed: boolean;
  /** Redirect path if not allowed */
  redirectTo?: string;
  /** Reason for denial (for logging/debugging) */
  reason?: string;
}

/**
 * Options for auth guards
 */
export interface AuthGuardOptions {
  /** Path to redirect to if not authenticated */
  loginPath?: string;
  /** Path to redirect to if already authenticated */
  homePath?: string;
  /** Required roles for access */
  requiredRoles?: UserRole[];
  /** Whether user must have completed onboarding */
  requireOnboarding?: boolean;
}

const DEFAULT_OPTIONS: AuthGuardOptions = {
  loginPath: '/auth',
  homePath: '/home',
  requiredRoles: undefined,
  requireOnboarding: false,
};

// ============================================
// GUARD FUNCTIONS
// ============================================

/**
 * Guard that requires authentication
 *
 * @param state - Current auth state
 * @param options - Guard options
 * @returns Guard result
 */
export function requireAuth(state: AuthState, options: AuthGuardOptions = {}): GuardResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Still loading - typically you'd wait, but return not allowed for safety
  if (state.isLoading && !state.isInitialized) {
    return {
      allowed: false,
      reason: 'Auth state loading',
    };
  }

  // Not authenticated
  if (!state.user) {
    return {
      allowed: false,
      redirectTo: opts.loginPath,
      reason: 'Not authenticated',
    };
  }

  // Check role requirements
  if (opts.requiredRoles && opts.requiredRoles.length > 0) {
    if (!opts.requiredRoles.includes(state.user.role)) {
      return {
        allowed: false,
        redirectTo: opts.homePath,
        reason: `Role ${state.user.role} not in required roles`,
      };
    }
  }

  // Check onboarding requirement
  if (opts.requireOnboarding && !state.user.hasCompletedOnboarding) {
    return {
      allowed: false,
      redirectTo: '/auth/onboarding',
      reason: 'Onboarding not completed',
    };
  }

  return { allowed: true };
}

/**
 * Guard that requires NO authentication (for login/signup pages)
 *
 * @param state - Current auth state
 * @param options - Guard options
 * @returns Guard result
 */
export function requireGuest(state: AuthState, options: AuthGuardOptions = {}): GuardResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Still loading - allow access to show the page
  if (state.isLoading && !state.isInitialized) {
    return { allowed: true };
  }

  // Already authenticated - redirect away
  if (state.user) {
    const redirectTo = state.user.hasCompletedOnboarding ? opts.homePath : '/auth/onboarding';

    return {
      allowed: false,
      redirectTo,
      reason: 'Already authenticated',
    };
  }

  return { allowed: true };
}

/**
 * Guard that requires specific user role(s)
 *
 * @param state - Current auth state
 * @param roles - Required roles (user must have at least one)
 * @param options - Guard options
 * @returns Guard result
 */
export function requireRole(
  state: AuthState,
  roles: UserRole[],
  options: AuthGuardOptions = {}
): GuardResult {
  return requireAuth(state, { ...options, requiredRoles: roles });
}

/**
 * Guard that requires completed onboarding
 *
 * @param state - Current auth state
 * @param options - Guard options
 * @returns Guard result
 */
export function requireOnboarding(state: AuthState, options: AuthGuardOptions = {}): GuardResult {
  return requireAuth(state, { ...options, requireOnboarding: true });
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if user has any of the specified roles
 *
 * @param user - User to check
 * @param roles - Roles to check against
 * @returns True if user has at least one role
 */
export function hasAnyRole(user: AuthUser | null, roles: UserRole[]): boolean {
  if (!user) return false;
  return roles.includes(user.role);
}

/**
 * Check if user is authenticated and initialized
 *
 * @param state - Auth state
 * @returns True if authenticated and initialized
 */
export function isFullyAuthenticated(state: AuthState): boolean {
  return state.isInitialized && state.user !== null;
}

/**
 * Check if auth is still loading
 *
 * @param state - Auth state
 * @returns True if loading
 */
export function isAuthLoading(state: AuthState): boolean {
  return state.isLoading || !state.isInitialized;
}
