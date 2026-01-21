/**
 * @fileoverview Auth Routes - Mobile
 * @module @nxt1/mobile
 *
 * Authentication routes for the mobile application.
 *
 * ⭐ 2026 BEST PRACTICES ⭐
 * - Uses async guards that wait for auth initialization
 * - Uses shared constants from @nxt1/core
 * - Matches web's AUTH_ROUTES structure exactly
 *
 * Route structure:
 * - /auth - Main unified auth page (login/signup) - requires guest
 * - /auth/forgot-password - Password reset flow - requires guest
 * - /auth/onboarding - Profile setup flow - requires auth but NOT completed onboarding
 */

import { Routes } from '@angular/router';
import { guestGuard, onboardingInProgressGuard } from './guards/auth.guards';

export const AUTH_ROUTES: Routes = [
  // Main unified auth page (only for guests)
  {
    path: '',
    loadComponent: () => import('./pages/auth/auth.page').then((m) => m.AuthPage),
    canActivate: [guestGuard],
    title: 'Sign In | NXT1 Sports',
  },

  // Password reset (only for guests)
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./pages/forgot-password/forgot-password.page').then((m) => m.ForgotPasswordPage),
    canActivate: [guestGuard],
    title: 'Reset Password | NXT1 Sports',
  },

  // Onboarding flow - requires auth but must NOT have completed onboarding
  {
    path: 'onboarding',
    loadComponent: () => import('./pages/onboarding/onboarding.page').then((m) => m.OnboardingPage),
    canActivate: [onboardingInProgressGuard],
    title: 'Complete Profile | NXT1 Sports',
  },
];
