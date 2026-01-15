import { Routes } from '@angular/router';
import { authGuard } from './features/auth/guards/auth.guards';

/**
 * @fileoverview Web App Routes
 * @module @nxt1/web
 *
 * Application routing with auth guards.
 */

export const routes: Routes = [
  // Redirect root to home (protected)
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'home',
  },

  {
    path: 'home',
    loadComponent: () => import('./pages/home/home.component').then((m) => m.HomeComponent),
    canActivate: [authGuard],
    title: 'Home | NXT1 Sports',
  },

  // Authentication Routes
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },

  {
    path: '**',
    redirectTo: 'home',
  },
];
