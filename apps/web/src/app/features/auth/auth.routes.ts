import { Routes } from '@angular/router';
import {
  guestGuard,
  onboardingInProgressGuard,
  emailVerificationGuard,
} from './guards/auth.guards';

/**
 * Auth Feature Routes
 *
 * Handles all authentication flows:
 * - /auth - Main unified auth page (login/signup) - requires guest (not logged in)
 * - /auth/forgot-password - Password reset flow - requires guest
 * - /auth/verify-email - Email verification flow - requires auth with unverified email
 * - /auth/onboarding - Profile setup flow - requires auth with verified email
 *
 * ⭐ 2026 BEST PRACTICES ⭐
 * - Uses async guards that wait for auth initialization
 * - Uses shared constants from @nxt1/core
 * - Matches mobile's AUTH_ROUTES structure
 */
export const AUTH_ROUTES: Routes = [
  // Main unified auth page (only for guests)
  {
    path: '',
    loadComponent: () => import('./pages/auth/auth.component').then((m) => m.AuthComponent),
    canActivate: [guestGuard],
    title: 'Sign In | NXT1 Sports',
  },

  // Password reset (only for guests)
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./pages/forgot-password/forgot-password.component').then(
        (m) => m.ForgotPasswordComponent
      ),
    canActivate: [guestGuard],
    title: 'Reset Password | NXT1 Sports',
  },

  // Email verification flow - requires auth but email NOT verified
  {
    path: 'verify-email',
    loadComponent: () =>
      import('./pages/verify-email/verify-email.component').then((m) => m.VerifyEmailComponent),
    canActivate: [emailVerificationGuard],
    title: 'Verify Email | NXT1 Sports',
  },

  // Onboarding flow - requires auth but must NOT have completed onboarding
  {
    path: 'onboarding',
    loadComponent: () =>
      import('./pages/onboarding/onboarding.component').then((m) => m.OnboardingComponent),
    canActivate: [onboardingInProgressGuard],
    title: 'Complete Your Profile | NXT1 Sports',
  },
];
