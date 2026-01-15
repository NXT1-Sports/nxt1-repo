/**
 * @fileoverview Mobile Auth Guards
 *
 * Angular functional guards that wrap @nxt1/core guard functions.
 * These guards can be used in route configurations.
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
import { requireAuth, requireGuest, requireRole, requirePremium, type UserRole } from '@nxt1/core';
import { MobileAuthService } from '../services/mobile-auth.service';

/**
 * Guard that requires authentication
 * Redirects to login if not authenticated
 */
export const authGuard: CanActivateFn = () => {
  const authService = inject(MobileAuthService);
  const router = inject(Router);

  const result = requireAuth(authService.state());

  if (result.allowed) {
    return true;
  }

  return router.createUrlTree([result.redirectTo ?? '/auth']);
};

/**
 * Guard that requires NO authentication (for login/signup pages)
 * Redirects to home if already authenticated
 */
export const guestGuard: CanActivateFn = () => {
  const authService = inject(MobileAuthService);
  const router = inject(Router);

  const result = requireGuest(authService.state());

  if (result.allowed) {
    return true;
  }

  return router.createUrlTree([result.redirectTo ?? '/home']);
};

/**
 * Guard that requires premium subscription
 */
export const premiumGuard: CanActivateFn = () => {
  const authService = inject(MobileAuthService);
  const router = inject(Router);

  const result = requirePremium(authService.state());

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
 *     loadComponent: () => import('./coach/dashboard.page'),
 *     canActivate: [roleGuard(['coach', 'scout'])]
 *   }
 * ];
 * ```
 */
export function roleGuard(roles: UserRole[]): CanActivateFn {
  return () => {
    const authService = inject(MobileAuthService);
    const router = inject(Router);

    const result = requireRole(authService.state(), roles);

    if (result.allowed) {
      return true;
    }

    return router.createUrlTree([result.redirectTo ?? '/home']);
  };
}
