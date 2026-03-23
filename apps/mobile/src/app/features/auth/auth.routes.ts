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
 * - Dedicated completion page (not overlay) for reliability
 *
 * Route structure:
 * - /auth - Main unified auth page (login/signup) - requires guest
 * - /auth/forgot-password - Password reset flow - requires guest
 * - /auth/onboarding - Profile setup flow - requires auth but NOT completed onboarding
 * - /auth/onboarding/complete - Welcome/success page after onboarding
 */

import { Routes } from '@angular/router';
import { guestGuard, onboardingInProgressGuard, authGuard } from './guards/auth.guards';

export const AUTH_ROUTES: Routes = [
  // Main unified auth page (only for guests)
  {
    path: '',
    loadComponent: () => import('./pages/auth/auth.page').then((m) => m.AuthPage),
    // TEMP: Disable guard for debugging native black screen
    // canActivate: [guestGuard],
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

  // Onboarding congratulations — MUST come before the shell route
  // Uses thin wrapper page with shared OnboardingWelcomeComponent from @nxt1/ui
  {
    path: 'onboarding/congratulations',
    loadComponent: () =>
      import('./pages/onboarding-congratulations/onboarding-congratulations.page').then(
        (m) => m.OnboardingCongratulationsPage
      ),
    canActivate: [authGuard],
    title: 'Welcome to NXT1!',
  },

  // Onboarding flow — each step is a separate Ionic page for native slide transitions.
  // OnboardingShellComponent provides IonRouterOutlet + persistent footer.
  // The state machine in OnboardingService controls step ordering.
  {
    path: 'onboarding',
    loadComponent: () =>
      import('./pages/onboarding/onboarding-shell.component').then(
        (m) => m.OnboardingShellComponent
      ),
    canActivate: [onboardingInProgressGuard],
    children: [
      { path: '', redirectTo: 'role', pathMatch: 'full' },
      {
        path: 'role',
        loadComponent: () =>
          import('./pages/onboarding/steps/role.page').then((m) => m.OnboardingRoleStepPage),
        title: 'Choose Your Role | NXT1 Sports',
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./pages/onboarding/steps/profile.page').then((m) => m.OnboardingProfileStepPage),
        title: 'Your Profile | NXT1 Sports',
      },
      {
        path: 'sport',
        loadComponent: () =>
          import('./pages/onboarding/steps/sport.page').then((m) => m.OnboardingSportStepPage),
        title: 'Select Sport | NXT1 Sports',
      },
      {
        path: 'school',
        loadComponent: () =>
          import('./pages/onboarding/steps/school.page').then((m) => m.OnboardingSchoolStepPage),
        title: 'Your School | NXT1 Sports',
      },
      {
        path: 'link-sources',
        loadComponent: () =>
          import('./pages/onboarding/steps/link-sources.page').then(
            (m) => m.OnboardingLinkSourcesStepPage
          ),
        title: 'Connect Accounts | NXT1 Sports',
      },
      {
        path: 'team-link-sources',
        loadComponent: () =>
          import('./pages/onboarding/steps/link-sources.page').then(
            (m) => m.OnboardingLinkSourcesStepPage
          ),
        title: 'Connect Team Accounts | NXT1 Sports',
      },
      {
        path: 'create-team-profile',
        loadComponent: () =>
          import('./pages/onboarding/steps/create-team.page').then(
            (m) => m.OnboardingCreateTeamStepPage
          ),
        title: 'Create Team | NXT1 Sports',
      },
      {
        path: 'select-teams',
        loadComponent: () =>
          import('./pages/onboarding/steps/team-selection.page').then(
            (m) => m.OnboardingTeamSelectionStepPage
          ),
        title: 'Select Teams | NXT1 Sports',
      },
      {
        path: 'referral-source',
        loadComponent: () =>
          import('./pages/onboarding/steps/referral.page').then(
            (m) => m.OnboardingReferralStepPage
          ),
        title: 'How Did You Hear About Us? | NXT1 Sports',
      },
    ],
  },
];
