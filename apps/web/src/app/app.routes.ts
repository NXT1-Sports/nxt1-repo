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
  // Root redirects to tabs/home (matches mobile pattern)
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'tabs/home',
  },

  // Legacy routes redirect to /tabs/* for backwards compatibility
  {
    path: 'home',
    redirectTo: 'tabs/home',
    pathMatch: 'full',
  },
  {
    path: 'agent-x',
    redirectTo: 'tabs/agent-x',
    pathMatch: 'prefix',
  },
  {
    path: 'explore',
    redirectTo: 'tabs/explore',
    pathMatch: 'prefix',
  },
  {
    path: 'activity',
    redirectTo: 'tabs/activity',
    pathMatch: 'prefix',
  },
  {
    path: 'profile',
    redirectTo: 'tabs/profile',
    pathMatch: 'prefix',
  },
  {
    path: 'analytics',
    redirectTo: 'tabs/analytics',
    pathMatch: 'prefix',
  },
  {
    path: 'settings',
    redirectTo: 'tabs/settings',
    pathMatch: 'prefix',
  },
  {
    path: 'xp',
    redirectTo: 'tabs/xp',
    pathMatch: 'prefix',
  },

  // Authenticated Routes with Web Shell (Desktop Nav)
  // Uses /tabs/* pattern for cross-platform compatibility with mobile
  {
    path: 'tabs',
    loadComponent: () =>
      import('./core/layout/shell/web-shell.component').then((m) => m.WebShellComponent),
    canActivate: [authGuard],
    children: [
      // Default tab redirect
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'home',
      },
      // Home Page
      {
        path: 'home',
        loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent),
      },
      // Agent X - AI Assistant
      {
        path: 'agent-x',
        loadChildren: () => import('./features/agent-x/agent-x.routes'),
      },
      // Explore - Search & Discovery
      {
        path: 'explore',
        loadChildren: () => import('./features/explore/explore.routes'),
      },
      // Activity - Notifications & Activity Feed
      {
        path: 'activity',
        loadChildren: () => import('./features/activity/activity.routes'),
      },
      // Profile - User Profile Page
      {
        path: 'profile',
        loadChildren: () => import('./features/profile/profile.routes'),
      },
      // Analytics Dashboard - User Analytics & Insights
      {
        path: 'analytics',
        loadChildren: () => import('./features/analytics-dashboard/analytics-dashboard.routes'),
      },
      // Settings - User Settings & Preferences
      {
        path: 'settings',
        loadChildren: () => import('./features/settings/settings.routes'),
      },
      // XP - Gamified Tasks & Achievements
      {
        path: 'xp',
        loadChildren: () => import('./features/missions/missions.routes'),
      },
    ],
  },

  // Authentication Routes (Public - no layout wrapper)
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },

  // Create Post (modal-style, outside main shell for focused experience)
  {
    path: 'create-post',
    canActivate: [authGuard],
    loadChildren: () => import('./features/create-post/create-post.routes'),
  },

  // Catch-all redirects to tabs/home
  {
    path: '**',
    redirectTo: 'tabs/home',
  },
];
