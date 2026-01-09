import { Routes } from '@angular/router';

/**
 * Auth Feature Routes
 *
 * Handles all authentication flows:
 * - Login
 * - Sign up
 * - Password reset
 * - Onboarding
 */
export const AUTH_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'login',
  },
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent),
    title: 'Sign In | NXT1 Sports',
  },
  {
    path: 'signup',
    loadComponent: () =>
      import('./features/signup/signup.component').then((m) => m.SignupComponent),
    title: 'Sign Up | NXT1 Sports',
  },
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./features/forgot-password/forgot-password.component').then(
        (m) => m.ForgotPasswordComponent
      ),
    title: 'Reset Password | NXT1 Sports',
  },
  {
    path: 'onboarding',
    loadComponent: () =>
      import('./features/onboarding/onboarding.component').then((m) => m.OnboardingComponent),
    title: 'Complete Profile | NXT1 Sports',
  },
];
