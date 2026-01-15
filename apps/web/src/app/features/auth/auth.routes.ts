import { Routes } from '@angular/router';

/**
 * Auth Feature Routes
 *
 * Handles all authentication flows:
 * - Unified auth page (login + signup combined)
 * - Password reset
 * - Onboarding
 *
 * Route structure:
 * - /auth - Main unified auth page (login/signup)
 * - /auth/forgot-password - Password reset flow
 * - /auth/onboarding - Profile setup flow
 *
 * Legacy redirects maintain backward compatibility:
 * - /auth/login → /auth
 * - /auth/signup → /auth?mode=signup
 * - /auth/register → /auth?mode=signup
 *
 * All routes load from ./pages/ folder (matches mobile structure)
 */
export const AUTH_ROUTES: Routes = [
  // Main unified auth page
  {
    path: '',
    loadComponent: () => import('./pages/auth/auth.component').then((m) => m.AuthComponent),
    title: 'Sign In | NXT1 Sports',
  },

  // Password reset
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./pages/forgot-password/forgot-password.component').then(
        (m) => m.ForgotPasswordComponent
      ),
    title: 'Reset Password | NXT1 Sports',
  },

  // Onboarding flow
  {
    path: 'onboarding',
    loadComponent: () =>
      import('./pages/onboarding/onboarding.component').then((m) => m.OnboardingComponent),
    title: 'Complete Profile | NXT1 Sports',
  },

  // ============================================
  // LEGACY REDIRECTS - Maintain backward compatibility
  // ============================================

  // Legacy login route → unified auth
  {
    path: 'login',
    redirectTo: '',
    pathMatch: 'full',
  },

  // Legacy signup route → unified auth with signup mode
  {
    path: 'signup',
    redirectTo: '?mode=signup',
    pathMatch: 'full',
  },

  // Legacy register route → unified auth with signup mode
  {
    path: 'register',
    redirectTo: '?mode=signup',
    pathMatch: 'full',
  },
];
