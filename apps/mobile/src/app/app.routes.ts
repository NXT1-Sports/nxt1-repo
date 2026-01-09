/**
 * @fileoverview Mobile App Routes (Simplified)
 * @module @nxt1/mobile
 *
 * Minimal routing - Auth only for now.
 * Additional features will be added as needed.
 */

import { Routes } from '@angular/router';

export const routes: Routes = [
  // Redirect root to auth
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'auth',
  },

  // Authentication Routes
  {
    path: 'auth',
    loadChildren: () => import('./auth/auth.routes').then((m) => m.routes),
  },

  // Catch-all redirect to auth
  {
    path: '**',
    redirectTo: 'auth',
  },
];
