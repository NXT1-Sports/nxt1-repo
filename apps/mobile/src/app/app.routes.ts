/**
 * @fileoverview Mobile App Routes — 2026 SEO Best Practices
 * @module @nxt1/mobile
 *
 * Clean URL architecture matching web platform for unified deep linking.
 * Uses MobileShellComponent as shell for all authenticated content.
 *
 * Architecture (like Instagram, TikTok, Twitter):
 * - Auth routes are standalone (no shell/footer)
 * - All authenticated routes are children of MobileShellComponent
 * - Footer persists across tab navigation (no re-render)
 * - Each page owns its header via NxtPageHeaderComponent
 * - NO /tabs/ prefix — clean, semantic URLs matching web
 */

import { Routes } from '@angular/router';

export const routes: Routes = [
  // ============================================
  // AUTHENTICATION ROUTES (no shell - standalone flow)
  // ============================================
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },

  // ============================================
  // SPECIAL ROUTES (Outside Shell)
  // ============================================

  // Create Post (modal-style, outside shell)
  {
    path: 'create-post',
    loadChildren: () =>
      import('./features/create-post/create-post.routes').then((m) => m.CREATE_POST_ROUTES),
  },

  // Profile (outside shell - no tabs)
  {
    path: 'profile',
    loadChildren: () => import('./features/profile/profile.routes').then((m) => m.PROFILE_ROUTES),
  },

  // ============================================
  // AUTHENTICATED ROUTES (With Mobile Shell)
  // ============================================

  /**
   * Mobile Shell - All authenticated content lives here
   * Shell provides: bottom tab bar, sidenav
   */
  {
    path: '',
    loadComponent: () =>
      import('./core/layout/shell/mobile-shell.component').then((m) => m.MobileShellComponent),
    children: [
      // Default route → Home
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

      // Explore Tab - Search & Discovery
      {
        path: 'explore',
        loadChildren: () =>
          import('./features/explore/explore.routes').then((m) => m.EXPLORE_ROUTES),
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

      // News - Sports Recruiting News Feed
      {
        path: 'news',
        loadChildren: () => import('./features/news/news.routes').then((m) => m.NEWS_ROUTES),
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
        loadChildren: () => import('./features/xp/xp.routes').then((m) => m.XP_ROUTES),
      },

      // Scout Reports - Premium recruiting analysis
      {
        path: 'scout-reports',
        loadChildren: () =>
          import('./features/scout-reports/scout-reports.routes').then(
            (m) => m.SCOUT_REPORTS_ROUTES
          ),
      },

      // Help Center - Support & FAQ
      {
        path: 'help-center',
        loadChildren: () =>
          import('./features/help-center/help-center.routes').then((m) => m.HELP_CENTER_ROUTES),
      },

      // About - Company information
      {
        path: 'about',
        loadChildren: () => import('./features/about/about.routes').then((m) => m.ABOUT_ROUTES),
      },

      // Terms - Terms of Service
      {
        path: 'terms',
        loadChildren: () => import('./features/terms/terms.routes').then((m) => m.TERMS_ROUTES),
      },

      // Privacy - Privacy Policy
      {
        path: 'privacy',
        loadChildren: () =>
          import('./features/privacy/privacy.routes').then((m) => m.PRIVACY_ROUTES),
      },

      // Team - Team pages
      {
        path: 'team/:slug',
        loadChildren: () => import('./features/team/team.routes').then((m) => m.TEAM_ROUTES),
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

  // Legacy /scout-reports redirect
  {
    path: 'scout-reports',
    redirectTo: 'tabs/scout-reports',
    pathMatch: 'prefix',
  },

  // Legacy /help-center redirect
  {
    path: 'help-center',
    redirectTo: 'tabs/help-center',
    pathMatch: 'prefix',
  },

  // 404 Not Found Page (catch-all route)
  {
    path: '**',
    loadComponent: () => import('@nxt1/ui').then((m) => m.NotFoundComponent),
  },
];
