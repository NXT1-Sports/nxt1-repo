import { Routes } from '@angular/router';
import { authGuard } from './features/auth/guards/auth.guards';

/**
 * @fileoverview Web App Routes
 * @module @nxt1/web
 *
 * Application routing with auth guards.
 * Home page pending - redirects to auth for now.
 */

export const routes: Routes = [
  // Redirect root to auth (home pending)
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

  {
    path: '**',
    redirectTo: 'auth',
  },
];
