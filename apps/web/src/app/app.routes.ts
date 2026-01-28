import { Routes } from '@angular/router';
import { authGuard } from './features/auth/guards/auth.guards';

/**
 * @fileoverview Web App Routes
 * @module @nxt1/web
 *
 * Application routing with auth guards and layout wrappers.
 *
 * Architecture:
 * - WebShellComponent wraps authenticated routes (provides top nav)
 * - Auth routes are standalone (no shell wrapper)
 * - Uses lazy loading for optimal performance
 *
 * Route Structure:
 * - / (root) → /home (protected, with shell)
 * - /auth → Authentication flows (no shell)
 */

export const routes: Routes = [
  // Root redirects to home
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'home',
  },

  // Authenticated Routes with Web Shell (Desktop Nav)
  {
    path: '',
    loadComponent: () =>
      import('./core/layout/shell/web-shell.component').then((m) => m.WebShellComponent),
    canActivate: [authGuard],
    children: [
      // Home Page
      {
        path: 'home',
        loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent),
      },
      // Future authenticated routes go here:
      // { path: 'profile', loadComponent: ... },
      // { path: 'explore', loadComponent: ... },
      // { path: 'settings', loadComponent: ... },
    ],
  },

  // Authentication Routes (Public - no layout wrapper)
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
