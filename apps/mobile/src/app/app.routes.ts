/**
 * @fileoverview Mobile App Routes
 * @module @nxt1/mobile
 *
 * Main application routes following the same structure as web app.
 * Auth routes mirror web's AUTH_ROUTES for consistency.
 */

import { Routes } from '@angular/router';

export const routes: Routes = [
  // Redirect root to home (home guard handles auth check)
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'home',
  },

  // Home (requires authentication + completed onboarding)
  {
    path: 'home',
    loadChildren: () => import('./features/home/home.routes').then((m) => m.HOME_ROUTES),
  },

  // Authentication Routes (matches web's AUTH_ROUTES)
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },

  // Catch-all redirect to home (guard will redirect to auth if needed)
  {
    path: '**',
    redirectTo: 'home',
  },
];
