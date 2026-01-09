/**
 * @fileoverview Web Auth Guards
 *
 * Angular functional guards that wrap @nxt1/core guard functions.
 * These guards can be used in route configurations for the web app.
 *
 * Uses AuthFlowService for state rather than creating a separate
 * state manager since the web app already has this service.
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
 *     path: 'auth/login',
 *     loadComponent: () => import('./auth/login/login.component'),
 *     canActivate: [guestGuard]
 *   }
 * ];
 * ```
 */

import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import {
  requireAuth,
  requireGuest,
  requireRole,
  requirePremium,
  type AuthState,
  type UserRole,
} from '@nxt1/core';
import { AuthFlowService } from '../../features/auth/services/auth-flow.service';

/**
 * Convert AuthFlowService state to @nxt1/core AuthState format
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
          provider: 'email', // Default, could be enhanced
          emailVerified: true, // Assumed from Firebase
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        }
      : null,
    firebaseUser: null, // Not needed for guard checks
    isLoading: authService.isLoading(),
    isInitialized: !authService.isLoading(),
    error: authService.error(),
  };
}

/**
 * Guard that requires authentication
 * Redirects to login if not authenticated
 */
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthFlowService);
  const router = inject(Router);

  const state = getAuthState(authService);
  const result = requireAuth(state);

  if (result.allowed) {
    return true;
  }

  return router.createUrlTree([result.redirectTo ?? '/auth/login']);
};

/**
 * Guard that requires NO authentication (for login/signup pages)
 * Redirects to home if already authenticated
 */
export const guestGuard: CanActivateFn = () => {
  const authService = inject(AuthFlowService);
  const router = inject(Router);

  const state = getAuthState(authService);
  const result = requireGuest(state);

  if (result.allowed) {
    return true;
  }

  return router.createUrlTree([result.redirectTo ?? '/home']);
};

/**
 * Guard that requires premium subscription
 */
export const premiumGuard: CanActivateFn = () => {
  const authService = inject(AuthFlowService);
  const router = inject(Router);

  const state = getAuthState(authService);
  const result = requirePremium(state);

  if (result.allowed) {
    return true;
  }

  return router.createUrlTree([result.redirectTo ?? '/premium']);
};

/**
 * Guard factory for role-based access
 *
 * @example
 * ```typescript
 * const routes: Routes = [
 *   {
 *     path: 'coach-dashboard',
 *     loadComponent: () => import('./coach/dashboard.component'),
 *     canActivate: [roleGuard(['coach', 'scout'])]
 *   }
 * ];
 * ```
 */
export function roleGuard(roles: UserRole[]): CanActivateFn {
  return () => {
    const authService = inject(AuthFlowService);
    const router = inject(Router);

    const state = getAuthState(authService);
    const result = requireRole(state, roles);

    if (result.allowed) {
      return true;
    }

    return router.createUrlTree([result.redirectTo ?? '/home']);
  };
}
