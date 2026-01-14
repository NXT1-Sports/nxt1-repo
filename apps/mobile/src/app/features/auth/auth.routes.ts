/**
 * @fileoverview Auth Routes - Mobile
 * @module @nxt1/mobile
 *
 * Authentication routes for the mobile application.
 * ⭐ MATCHES WEB'S AUTH_ROUTES STRUCTURE ⭐
 *
 * Routes:
 * - /auth/login - Sign in page
 * - /auth/signup - Sign up page
 * - /auth/forgot-password - Password reset page
 * - /auth/onboarding - Profile setup flow
 */

import { Routes } from '@angular/router';

export const AUTH_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'login',
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage),
    title: 'Sign In | NXT1 Sports',
  },
  {
    path: 'signup',
    loadComponent: () => import('./pages/signup/signup.page').then((m) => m.SignupPage),
    title: 'Sign Up | NXT1 Sports',
  },
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./pages/forgot-password/forgot-password.page').then((m) => m.ForgotPasswordPage),
    title: 'Reset Password | NXT1 Sports',
  },
  {
    path: 'onboarding',
    loadComponent: () =>
      import('./pages/onboarding/onboarding.page').then((m) => m.OnboardingPage),
    title: 'Complete Profile | NXT1 Sports',
  },
  // Legacy route redirect (register -> signup)
  {
    path: 'register',
    redirectTo: 'signup',
    pathMatch: 'full',
  },
];
