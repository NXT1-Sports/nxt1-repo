/**
 * @fileoverview Web Auth Guards - 2026 Best Practices
 * @module @nxt1/web/features/auth
 *
 * Angular functional guards that wrap @nxt1/core guard functions.
 * Uses async guards that wait for auth initialization before making decisions.
 *
 * ⭐ PROFESSIONAL PATTERNS ⭐
 * - Waits for auth initialization (no race conditions)
 * - Uses shared constants from @nxt1/core (no hardcoded paths)
 * - Wraps portable guard functions from @nxt1/core
 * - Supports all auth scenarios: auth, guest, role, premium, onboarding
 *
 * @example
 * ```typescript
 * const routes: Routes = [
 *   {
 *     path: 'home',
 *     loadComponent: () => import('./home/home.component'),
 *     canActivate: [authGuard]
 *   },
 *   {
 *     path: 'auth',
 *     loadComponent: () => import('./auth/auth.component'),
 *     canActivate: [guestGuard]
 *   },
 *   {
 *     path: 'dashboard',
 *     loadComponent: () => import('./dashboard/dashboard.component'),
 *     canActivate: [onboardingCompleteGuard]  // Requires auth + onboarding
 *   }
 * ];
 * ```
 */

import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, type CanActivateFn } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, take } from 'rxjs';
import {
  requireAuth,
  requireGuest,
  requireRole,
  requireOnboarding,
  type AuthState,
  type UserRole,
} from '@nxt1/core';
import { AUTH_ROUTES, AUTH_REDIRECTS } from '@nxt1/core/constants';
import { AuthFlowService } from '../../../core/services/auth/auth-flow.service';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import type { ILogger } from '@nxt1/core/logging';

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Convert AuthFlowService signals to @nxt1/core AuthState format
 */
function getAuthState(authService: AuthFlowService): AuthState {
  const user = authService.user();
  return {
    user: user
      ? {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          profileImg: user.profileImg ?? undefined,
          role: user.role,
          hasCompletedOnboarding: user.hasCompletedOnboarding,
          provider: user.provider ?? 'email',
          emailVerified: user.emailVerified ?? true,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        }
      : null,
    firebaseUser: authService.firebaseUser(),
    isLoading: authService.isLoading(),
    isInitialized: authService.isInitialized(),
    error: authService.error(),
    signupInProgress: false,
  };
}

// ============================================
// ASYNC GUARDS (Wait for auth initialization)
// ============================================

/**
 * Guard that requires authentication
 * Waits for auth initialization, then redirects to login if not authenticated
 *
 * SSR STRATEGY (2026 Best Practice):
 * On server, ALLOW access - the server doesn't have auth cookie on first load.
 * Client hydration will properly check auth and redirect if needed.
 * This prevents the flash: /auth → /home pattern.
 *
 * IMPORTANT: toObservable must be called inside the guard function (injection context)
 * to properly track signal changes.
 *
 * @example canActivate: [authGuard]
 */
export const authGuard: CanActivateFn = () => {
  const platformId = inject(PLATFORM_ID);
  const authService = inject(AuthFlowService);
  const router = inject(Router);

  // SSR: Allow access, let client handle auth check after hydration
  // This prevents server redirect → client redirect flash
  if (!isPlatformBrowser(platformId)) {
    return true;
  }

  // If already initialized, check immediately
  if (authService.isInitialized()) {
    const state = getAuthState(authService);
    const result = requireAuth(state);

    if (result.allowed) return true;
    return router.createUrlTree([result.redirectTo ?? AUTH_ROUTES.ROOT]);
  }

  // Wait for initialization - toObservable must be called in injection context
  return toObservable(authService.isInitialized).pipe(
    filter((isInitialized) => isInitialized === true),
    take(1),
    map(() => {
      const state = getAuthState(authService);
      const result = requireAuth(state);

      if (result.allowed) return true;
      return router.createUrlTree([result.redirectTo ?? AUTH_ROUTES.ROOT]);
    })
  );
};

/**
 * Guard that requires NO authentication (for login/signup pages)
 * Waits for auth initialization, then redirects to home if already authenticated
 *
 * SSR STRATEGY: Allow on server, let client handle redirect
 * DEV MODE: Add ?dev=1 to bypass guard for testing (e.g., /auth?dev=1)
 *
 * @example canActivate: [guestGuard]
 */
export const guestGuard: CanActivateFn = (route) => {
  const platformId = inject(PLATFORM_ID);
  const authService = inject(AuthFlowService);
  const router = inject(Router);
  const logger: ILogger = inject(NxtLoggingService).child('GuestGuard');

  // SSR: Allow access, let client handle auth check after hydration
  if (!isPlatformBrowser(platformId)) {
    return true;
  }

  // DEV BYPASS: Allow access with ?dev=1 query param for testing
  const devBypass = route.queryParams['dev'] === '1';
  if (devBypass) {
    logger.warn('DEV BYPASS ACTIVE - Remove ?dev=1 for production testing');
    return true;
  }

  // If already initialized, check immediately
  if (authService.isInitialized()) {
    const state = getAuthState(authService);
    const result = requireGuest(state, {
      homePath: AUTH_REDIRECTS.DEFAULT,
    });

    if (result.allowed) return true;
    return router.createUrlTree([result.redirectTo ?? AUTH_REDIRECTS.DEFAULT]);
  }

  // Wait for initialization - toObservable must be called in injection context
  return toObservable(authService.isInitialized).pipe(
    filter((isInitialized) => isInitialized === true),
    take(1),
    map(() => {
      const state = getAuthState(authService);
      const result = requireGuest(state, {
        homePath: AUTH_REDIRECTS.DEFAULT,
      });

      if (result.allowed) return true;
      return router.createUrlTree([result.redirectTo ?? AUTH_REDIRECTS.DEFAULT]);
    })
  );
};

/**
 * Guard that requires authentication AND completed onboarding
 * Use this for main app routes (home, profile, etc.)
 *
 * SSR STRATEGY: Allow on server, let client handle redirect
 *
 * @example canActivate: [onboardingCompleteGuard]
 */
export const onboardingCompleteGuard: CanActivateFn = () => {
  const platformId = inject(PLATFORM_ID);
  const authService = inject(AuthFlowService);
  const router = inject(Router);

  // SSR: Allow access, let client handle auth check after hydration
  if (!isPlatformBrowser(platformId)) {
    return true;
  }

  // If already initialized, check immediately
  if (authService.isInitialized()) {
    const state = getAuthState(authService);
    const result = requireOnboarding(state, {
      loginPath: AUTH_ROUTES.ROOT,
    });

    if (result.allowed) return true;
    return router.createUrlTree([result.redirectTo ?? AUTH_REDIRECTS.ONBOARDING]);
  }

  // Wait for initialization - toObservable must be called in injection context
  return toObservable(authService.isInitialized).pipe(
    filter((isInitialized) => isInitialized === true),
    take(1),
    map(() => {
      const state = getAuthState(authService);
      const result = requireOnboarding(state, {
        loginPath: AUTH_ROUTES.ROOT,
      });

      if (result.allowed) return true;
      return router.createUrlTree([result.redirectTo ?? AUTH_REDIRECTS.ONBOARDING]);
    })
  );
};

/**
 * Guard that requires user to have started but NOT completed onboarding
 * Use this to protect the onboarding route itself
 *
 * SSR STRATEGY: Allow on server, let client handle redirect
 *
 * @example canActivate: [onboardingInProgressGuard]
 */
export const onboardingInProgressGuard: CanActivateFn = () => {
  const platformId = inject(PLATFORM_ID);
  const authService = inject(AuthFlowService);
  const router = inject(Router);

  // SSR: Allow access, let client handle auth check after hydration
  if (!isPlatformBrowser(platformId)) {
    return true;
  }

  const checkOnboardingAccess = (state: AuthState) => {
    // Not authenticated - redirect to login
    if (!state.user) {
      return router.createUrlTree([AUTH_ROUTES.ROOT]);
    }

    // Email not verified - redirect to verify-email page (for email signups)
    // Skip for OAuth users (they're pre-verified)
    if (state.user.provider === 'email' && state.user.emailVerified === false) {
      return router.createUrlTree([AUTH_ROUTES.VERIFY_EMAIL]);
    }

    // Already completed onboarding - redirect to home
    if (state.user.hasCompletedOnboarding) {
      return router.createUrlTree([AUTH_REDIRECTS.DEFAULT]);
    }

    // User is authenticated and hasn't completed onboarding - allow access
    return true;
  };

  // If already initialized, check immediately
  if (authService.isInitialized()) {
    return checkOnboardingAccess(getAuthState(authService));
  }

  // Wait for initialization - toObservable must be called in injection context
  return toObservable(authService.isInitialized).pipe(
    filter((isInitialized) => isInitialized === true),
    take(1),
    map(() => checkOnboardingAccess(getAuthState(authService)))
  );
};

/**
 * Guard for email verification page
 * Requires: authenticated user with UNVERIFIED email
 * Redirects: to onboarding if already verified, to login if not authenticated
 *
 * SSR STRATEGY: Allow on server, let client handle redirect
 *
 * @example canActivate: [emailVerificationGuard]
 */
export const emailVerificationGuard: CanActivateFn = () => {
  const platformId = inject(PLATFORM_ID);
  const authService = inject(AuthFlowService);
  const router = inject(Router);

  // SSR: Allow access, let client handle auth check after hydration
  if (!isPlatformBrowser(platformId)) {
    return true;
  }

  const checkEmailVerification = (state: AuthState) => {
    // Not authenticated - redirect to login
    if (!state.user) {
      return router.createUrlTree([AUTH_ROUTES.ROOT]);
    }

    // OAuth users are pre-verified - skip to onboarding
    if (state.user.provider !== 'email') {
      return router.createUrlTree([AUTH_ROUTES.ONBOARDING]);
    }

    // Email already verified - redirect to onboarding
    if (state.user.emailVerified !== false) {
      return router.createUrlTree([AUTH_ROUTES.ONBOARDING]);
    }

    // Email not verified - allow access to verification page
    return true;
  };

  // If already initialized, check immediately
  if (authService.isInitialized()) {
    return checkEmailVerification(getAuthState(authService));
  }

  // Wait for initialization - toObservable must be called in injection context
  return toObservable(authService.isInitialized).pipe(
    filter((isInitialized) => isInitialized === true),
    take(1),
    map(() => checkEmailVerification(getAuthState(authService)))
  );
};

// ============================================
// GUARD FACTORY (for role-based access)
// ============================================

/**
 * Guard factory for role-based access
 *
 * @param roles - Array of allowed roles
 * @returns CanActivateFn guard
 *
 * @example
 * ```typescript
 * const routes: Routes = [
 *   {
 *     path: 'coach-dashboard',
 *     loadComponent: () => import('./coach/dashboard.component'),
 *     canActivate: [roleGuard(['coach', 'recruiter'])]
 *   }
 * ];
 * ```
 */
export function roleGuard(roles: UserRole[]): CanActivateFn {
  return () => {
    const platformId = inject(PLATFORM_ID);
    const authService = inject(AuthFlowService);
    const router = inject(Router);

    // SSR: Allow access, let client handle auth check after hydration
    if (!isPlatformBrowser(platformId)) {
      return true;
    }

    const checkRole = (state: AuthState) => {
      const result = requireRole(state, roles, {
        loginPath: AUTH_ROUTES.ROOT,
        homePath: AUTH_REDIRECTS.DEFAULT,
      });

      if (result.allowed) return true;
      return router.createUrlTree([result.redirectTo ?? AUTH_REDIRECTS.DEFAULT]);
    };

    // If already initialized, check immediately
    if (authService.isInitialized()) {
      return checkRole(getAuthState(authService));
    }

    // Wait for initialization - toObservable must be called in injection context
    return toObservable(authService.isInitialized).pipe(
      filter((isInitialized) => isInitialized === true),
      take(1),
      map(() => checkRole(getAuthState(authService)))
    );
  };
}
