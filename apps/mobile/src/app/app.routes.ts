/**
 * @fileoverview Mobile App Routes
 * @module @nxt1/mobile
 *
 * Main application routes following professional mobile app patterns.
 * Uses MobileShellComponent as shell for all authenticated content.
 *
 * Architecture (like Instagram, TikTok, Twitter):
 * - Auth routes are standalone (no shell/footer)
 * - All authenticated routes are children of MobileShellComponent
 * - Footer persists across tab navigation (no re-render)
 * - Each page owns its header via NxtPageHeaderComponent
 */

import { Routes } from '@angular/router';

export const routes: Routes = [
  // Root redirect to tabs
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'tabs',
  },

  // Authentication Routes (no shell - standalone flow)
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },

  // Create Post (modal-style, outside tabs shell)
  {
    path: 'create-post',
    loadChildren: () =>
      import('./features/create-post/create-post.routes').then((m) => m.CREATE_POST_ROUTES),
  },

  // Mobile Shell - All authenticated content lives here
  {
    path: 'tabs',
    loadComponent: () =>
      import('./core/layout/shell/mobile-shell.component').then((m) => m.MobileShellComponent),
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

      // Search/Explore Tab - Search & Discovery
      {
        path: 'search',
        loadChildren: () =>
          import('./features/explore/explore.routes').then((m) => m.EXPLORE_ROUTES),
      },

      // Profile Tab - User Profile Page
      {
        path: 'profile',
        loadChildren: () =>
          import('./features/profile/profile.routes').then((m) => m.PROFILE_ROUTES),
      },

      // Agent X Tab - AI Assistant
      {
        path: 'agent',
        loadChildren: () =>
          import('./features/agent-x/agent-x.routes').then((m) => m.AGENT_X_ROUTES),
      },

      // Activity Tab - Notifications & Activity Feed
      {
        path: 'activity',
        loadChildren: () =>
          import('./features/activity/activity.routes').then((m) => m.ACTIVITY_ROUTES),
      },

      // Analytics Dashboard - User Analytics & Insights
      {
        path: 'analytics',
        loadChildren: () => import('./features/analytics-dashboard/analytics-dashboard.routes'),
      },

      // Settings - User Settings & Preferences
      {
        path: 'settings',
        loadChildren: () =>
          import('./features/settings/settings.routes').then((m) => m.SETTINGS_ROUTES),
      },

      // XP - Gamified Tasks & Achievements
      {
        path: 'xp',
        loadChildren: () =>
          import('./features/missions/missions.routes').then((m) => m.MISSIONS_ROUTES),
      },

      // Developer Settings (non-production only)
      {
        path: 'dev-settings',
        loadComponent: () =>
          import('./features/dev-settings/dev-settings.component').then(
            (m) => m.DevSettingsComponent
          ),
      },
    ],
  },

  // Developer Settings (also accessible outside tabs for testing)
  {
    path: 'dev-settings',
    loadComponent: () =>
      import('./features/dev-settings/dev-settings.component').then((m) => m.DevSettingsComponent),
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
