/**
 * @fileoverview Mobile App Routes
 * @module @nxt1/mobile
 *
 * Main application routes following the same structure as web app.
 * Auth routes mirror web's AUTH_ROUTES for consistency.
 */

import { Routes } from '@angular/router';

export const routes: Routes = [
  // Redirect root to auth
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'auth',
  },

  // Authentication Routes (matches web's AUTH_ROUTES)
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },

  // Home (placeholder for main app)
  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
  },

  // Catch-all redirect to auth
  {
    path: '**',
    redirectTo: 'auth',
  },
];
