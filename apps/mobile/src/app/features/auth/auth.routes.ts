/**
 * @fileoverview Auth Routes - Mobile
 * @module @nxt1/mobile
 *
 * Authentication routes for the mobile application.
 * ⭐ MATCHES WEB'S AUTH_ROUTES STRUCTURE ⭐
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
