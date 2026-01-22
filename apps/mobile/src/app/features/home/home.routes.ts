/**
 * @fileoverview Home Routes - Mobile
 * @module @nxt1/mobile/features/home
 *
 * Routes for the home feature.
 * Protected by onboardingCompleteGuard - requires authentication AND completed onboarding.
 *
 * ⭐ IDENTICAL STRUCTURE TO WEB ⭐
 */

import { Routes } from '@angular/router';
import { onboardingCompleteGuard } from '../auth/guards/auth.guards';

export const HOME_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./home.component').then((m) => m.HomeComponent),
    canActivate: [onboardingCompleteGuard],
    title: 'Home | NXT1 Sports',
  },
];
