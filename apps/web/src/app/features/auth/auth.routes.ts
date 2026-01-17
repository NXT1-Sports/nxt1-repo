import { Routes } from '@angular/router';

/**
 * Auth Feature Routes
 *
 * Handles all authentication flows:
 * - /auth - Main unified auth page (login/signup)
 * - /auth/forgot-password - Password reset flow
 * - /auth/onboarding - Profile setup flow (NEW STATE MACHINE)
 *
 * ⭐ MATCHES MOBILE'S AUTH_ROUTES STRUCTURE ⭐
 * ⭐ USES AUTH_ROUTES CONSTANTS FROM @nxt1/core ⭐
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

  // Onboarding flow - State machine-based profile setup
  {
    path: 'onboarding',
    loadComponent: () =>
      import('./pages/onboarding/onboarding.component').then((m) => m.OnboardingComponent),
    title: 'Complete Your Profile | NXT1 Sports',
  },
];
