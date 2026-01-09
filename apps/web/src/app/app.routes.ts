import { Routes } from '@angular/router';

/**
 * @fileoverview Web App Routes (Simplified)
 * @module @nxt1/web
 *
 * Minimal routing - Auth only for now.
 * Additional features will be added as needed.
 */

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
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },

  // Catch-all redirect to auth
  {
    path: '**',
    redirectTo: 'auth',
  },
];
