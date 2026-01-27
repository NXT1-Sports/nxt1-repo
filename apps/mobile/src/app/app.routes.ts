/**
 * @fileoverview Mobile App Routes
 * @module @nxt1/mobile
 *
 * Main application routes following professional mobile app patterns.
 * Uses TabsLayoutComponent as shell for all authenticated content.
 *
 * Architecture (like Instagram, TikTok, Twitter):
 * - Auth routes are standalone (no footer)
 * - All authenticated routes are children of TabsLayoutComponent
 * - Footer persists across tab navigation (no re-render)
 */

import { Routes } from '@angular/router';

export const routes: Routes = [
  // Root redirect to tabs
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'tabs',
  },

  // Authentication Routes (no footer - standalone flow)
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },

  // Tabs Shell - All authenticated content lives here
  {
    path: 'tabs',
    loadComponent: () =>
      import('./core/layout/tabs-layout/tabs-layout.component').then((m) => m.TabsLayoutComponent),
    children: [
      // Default tab redirect
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'home',
      },

      // Home Tab
      {
        path: 'home',
        loadChildren: () => import('./features/home/home.routes').then((m) => m.HOME_ROUTES),
      },

      // Discover Tab (placeholder for now)
      {
        path: 'discover',
        loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent),
      },

      // Search Tab (placeholder for now)
      {
        path: 'search',
        loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent),
      },

      // Profile Tab (placeholder for now)
      {
        path: 'profile',
        loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent),
      },

      // Agent X Tab (placeholder for now)
      {
        path: 'agent',
        loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent),
      },
    ],
  },

  // Legacy /home redirect (for backwards compatibility)
  {
    path: 'home',
    redirectTo: 'tabs/home',
    pathMatch: 'full',
  },

  // Catch-all redirect to tabs
  {
    path: '**',
    redirectTo: 'tabs',
  },
];
