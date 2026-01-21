import { Routes } from '@angular/router';
import { authGuard } from './features/auth/guards/auth.guards';

/**
 * @fileoverview Web App Routes
 * @module @nxt1/web
 *
 * Application routing with auth guards.
 * - / (root) → /home (protected)
 * - /auth → Authentication flows (login, register, onboarding)
 */

export const routes: Routes = [
  // Root redirects to home (protected by auth guard)
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'home',
  },

  // Home Page (Protected - requires authentication)
  {
    path: 'home',
    canActivate: [authGuard],
    loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent),
  },

  // Authentication Routes (Public - handles redirects if already logged in)
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },

  // Catch-all redirects to home
  {
    path: '**',
    redirectTo: 'home',
  },
];
