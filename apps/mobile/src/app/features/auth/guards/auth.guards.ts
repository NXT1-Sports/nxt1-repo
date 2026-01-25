/**
 * @fileoverview Mobile Auth Guards - 2026 Best Practices
 * @module @nxt1/mobile/features/auth
 *
 * Angular functional guards that wrap @nxt1/core guard functions.
 * Uses async guards that wait for auth initialization before making decisions.
 *
 * ⭐ PROFESSIONAL PATTERNS ⭐
 * - Waits for auth initialization (no race conditions)
 * - Uses shared constants from @nxt1/core (no hardcoded paths)
 * - Wraps portable guard functions from @nxt1/core
 * - Matches web's guard structure exactly
 *
 * @example
 * ```typescript
 * const routes: Routes = [
 *   {
 *     path: 'home',
 *     loadComponent: () => import('./home/home.page'),
 *     canActivate: [authGuard]
 *   },
 *   {
 *     path: 'auth',
 *     loadComponent: () => import('./auth/auth.page'),
 *     canActivate: [guestGuard]
 *   }
 * ];
 * ```
 */

import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, take } from 'rxjs';
import { NxtLoggingService } from '@nxt1/ui';
import {
  requireAuth,
  requireGuest,
  requireRole,
  requirePremium,
  requireOnboarding,
  type AuthState,
  type UserRole,
} from '@nxt1/core';
import { AUTH_ROUTES, AUTH_REDIRECTS } from '@nxt1/core/constants';
import { AuthFlowService } from '../services/auth-flow.service';

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
          photoURL: user.photoURL,
          role: user.role,
          isPremium: user.isPremium,
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

/**
 * Wait for auth to be initialized before checking
 * Returns an Observable that emits once auth is ready
 */
function waitForAuthInitialization(authService: AuthFlowService) {
  return toObservable(authService.isInitialized).pipe(
    filter((isInitialized) => isInitialized === true),
    take(1),
    map(() => getAuthState(authService))
  );
}

// ============================================
// ASYNC GUARDS (Wait for auth initialization)
// ============================================

/**
 * Guard that requires authentication
 * Waits for auth initialization, then redirects to login if not authenticated
 */
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthFlowService);
  const router = inject(Router);

  if (authService.isInitialized()) {
    const state = getAuthState(authService);
    const result = requireAuth(state);
    if (result.allowed) return true;
    return router.createUrlTree([result.redirectTo ?? AUTH_ROUTES.ROOT]);
  }

  return waitForAuthInitialization(authService).pipe(
    map((state) => {
      const result = requireAuth(state);
      if (result.allowed) return true;
      return router.createUrlTree([result.redirectTo ?? AUTH_ROUTES.ROOT]);
    })
  );
};

/**
 * Guard that requires NO authentication (for login/signup pages)
 * Waits for auth initialization, then redirects to home if already authenticated
 */
export const guestGuard: CanActivateFn = () => {
  const authService = inject(AuthFlowService);
  const router = inject(Router);

  if (authService.isInitialized()) {
    const state = getAuthState(authService);
    const result = requireGuest(state, { homePath: AUTH_REDIRECTS.DEFAULT });
    if (result.allowed) return true;
    return router.createUrlTree([result.redirectTo ?? AUTH_REDIRECTS.DEFAULT]);
  }

  return waitForAuthInitialization(authService).pipe(
    map((state) => {
      const result = requireGuest(state, { homePath: AUTH_REDIRECTS.DEFAULT });
      if (result.allowed) return true;
      return router.createUrlTree([result.redirectTo ?? AUTH_REDIRECTS.DEFAULT]);
    })
  );
};

/**
 * Guard that requires authentication AND completed onboarding
 * Use this for main app routes (home, profile, etc.)
 */
export const onboardingCompleteGuard: CanActivateFn = () => {
  const authService = inject(AuthFlowService);
  const router = inject(Router);
  const logger = inject(NxtLoggingService).child('onboardingCompleteGuard');

  if (authService.isInitialized()) {
    const state = getAuthState(authService);
    logger.debug('Checking access', {
      isAuthenticated: !!state.user,
      hasCompletedOnboarding: state.user?.hasCompletedOnboarding,
    });
    const result = requireOnboarding(state, { loginPath: AUTH_ROUTES.ROOT });
    logger.debug('Access result', {
      allowed: result.allowed,
      redirectTo: result.redirectTo,
    });
    if (result.allowed) return true;
    return router.createUrlTree([result.redirectTo ?? AUTH_REDIRECTS.ONBOARDING]);
  }

  logger.debug('Waiting for auth initialization');
  return waitForAuthInitialization(authService).pipe(
    map((state) => {
      logger.debug('Auth initialized, checking access', {
        isAuthenticated: !!state.user,
        hasCompletedOnboarding: state.user?.hasCompletedOnboarding,
      });
      const result = requireOnboarding(state, { loginPath: AUTH_ROUTES.ROOT });
      logger.debug('Access result', {
        allowed: result.allowed,
        redirectTo: result.redirectTo,
      });
      if (result.allowed) return true;
      return router.createUrlTree([result.redirectTo ?? AUTH_REDIRECTS.ONBOARDING]);
    })
  );
};

/**
 * Guard that requires premium subscription
 */
export const premiumGuard: CanActivateFn = () => {
  const authService = inject(AuthFlowService);
  const router = inject(Router);

  if (authService.isInitialized()) {
    const state = getAuthState(authService);
    const result = requirePremium(state, { loginPath: AUTH_ROUTES.ROOT });
    if (result.allowed) return true;
    return router.createUrlTree([result.redirectTo ?? '/premium']);
  }

  return waitForAuthInitialization(authService).pipe(
    map((state) => {
      const result = requirePremium(state, { loginPath: AUTH_ROUTES.ROOT });
      if (result.allowed) return true;
      return router.createUrlTree([result.redirectTo ?? '/premium']);
    })
  );
};

/**
 * Guard that requires user to have started but NOT completed onboarding
 * Use this to protect the onboarding route itself
 */
export const onboardingInProgressGuard: CanActivateFn = () => {
  const authService = inject(AuthFlowService);
  const router = inject(Router);

  const checkOnboardingAccess = (state: AuthState) => {
    if (!state.user) {
      return router.createUrlTree([AUTH_ROUTES.ROOT]);
    }
    if (state.user.hasCompletedOnboarding) {
      return router.createUrlTree([AUTH_REDIRECTS.DEFAULT]);
    }
    return true;
  };

  if (authService.isInitialized()) {
    return checkOnboardingAccess(getAuthState(authService));
  }

  return waitForAuthInitialization(authService).pipe(map(checkOnboardingAccess));
};

/**
 * Guard factory for role-based access
 */
export function roleGuard(roles: UserRole[]): CanActivateFn {
  return () => {
    const authService = inject(AuthFlowService);
    const router = inject(Router);

    const checkRole = (state: AuthState) => {
      const result = requireRole(state, roles, {
        loginPath: AUTH_ROUTES.ROOT,
        homePath: AUTH_REDIRECTS.DEFAULT,
      });
      if (result.allowed) return true;
      return router.createUrlTree([result.redirectTo ?? AUTH_REDIRECTS.DEFAULT]);
    };

    if (authService.isInitialized()) {
      return checkRole(getAuthState(authService));
    }

    return waitForAuthInitialization(authService).pipe(map(checkRole));
  };
}
