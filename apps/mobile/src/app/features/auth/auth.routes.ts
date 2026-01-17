/**
 * @fileoverview Auth Routes - Mobile
 * @module @nxt1/mobile
 *
 * Authentication routes for the mobile application.
 * ⭐ MATCHES WEB'S AUTH_ROUTES STRUCTURE ⭐
 *
 * Route structure:
 * - /auth - Main unified auth page (login/signup via ?mode= param)
 * - /auth/forgot-password - Password reset flow
 * - /auth/onboarding - Profile setup flow
 */

import { Routes } from '@angular/router';

export const AUTH_ROUTES: Routes = [
  // Main unified auth page
  {
    path: '',
    loadComponent: () => import('./pages/auth/auth.page').then((m) => m.AuthPage),
    title: 'Sign In | NXT1 Sports',
  },

  // Password reset
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./pages/forgot-password/forgot-password.page').then((m) => m.ForgotPasswordPage),
    title: 'Reset Password | NXT1 Sports',
  },

  // Onboarding flow
  {
    path: 'onboarding',
    loadComponent: () => import('./pages/onboarding/onboarding.page').then((m) => m.OnboardingPage),
    title: 'Complete Profile | NXT1 Sports',
  },
];
