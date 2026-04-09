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
 * - No tabs prefix — clean, semantic URLs matching web
 */

import { Routes } from '@angular/router';
import { authGuard } from './features/auth/guards/auth.guards';

export const routes: Routes = [
  // ============================================
  // AUTHENTICATION ROUTES (no shell - standalone flow)
  // ============================================
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },

  // ============================================
  // INVITE / JOIN ROUTES (no auth required — user may be logged out)
  // ============================================
  {
    path: 'join/:code',
    loadComponent: () =>
      import('./features/join/join.component').then((m) => m.JoinMobileComponent),
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
    canActivate: [authGuard], // Protect all shell routes - require authentication
    loadComponent: () =>
      import('./core/layout/mobile-shell.component').then((m) => m.MobileShellComponent),
    children: [
      // Default route → Agent X (AI-first landing)
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'agent',
      },

      // Home → Explore redirect (backward compatibility)
      {
        path: 'home',
        redirectTo: 'explore',
        pathMatch: 'full',
      },

      // Explore Tab - Unified Discovery & Feed Hub
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

      // Redirect /agent-x → /agent (web deep links use /agent-x)
      {
        path: 'agent-x',
        redirectTo: 'agent',
        pathMatch: 'prefix',
      },

      // Activity Tab - Notifications & Activity Feed
      {
        path: 'activity',
        loadChildren: () =>
          import('./features/activity/activity.routes').then((m) => m.ACTIVITY_ROUTES),
      },

      // Pulse - Sports Recruiting Pulse Feed
      {
        path: 'pulse',
        loadChildren: () => import('./features/pulse/pulse.routes').then((m) => m.PULSE_ROUTES),
      },

      // Messages - User Conversations & Direct Messages
      {
        path: 'messages',
        loadChildren: () =>
          import('./features/messages/messages.routes').then((m) => m.MESSAGES_ROUTES),
      },

      // Settings - User Settings & Preferences
      {
        path: 'settings',
        loadChildren: () =>
          import('./features/settings/settings.routes').then((m) => m.SETTINGS_ROUTES),
      },

      // Usage - Payment Usage Dashboard
      {
        path: 'usage',
        loadChildren: () => import('./features/usage/usage.routes').then((m) => m.USAGE_ROUTES),
      },

      // Help Center - Support & FAQ
      {
        path: 'help-center',
        loadChildren: () =>
          import('./features/help-center/help-center.routes').then((m) => m.HELP_CENTER_ROUTES),
      },

      // Invite - Invite friends & team members
      {
        path: 'invite',
        loadChildren: () => import('./features/invite/invite.routes').then((m) => m.INVITE_ROUTES),
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

      // Profile - User profiles (inside shell for swipe-back gesture)
      {
        path: 'profile',
        loadChildren: () =>
          import('./features/profile/profile.routes').then((m) => m.PROFILE_ROUTES),
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

  // ============================================
  // ADD SPORT WIZARD (standalone — has its own IonRouterOutlet for step transitions)
  // ============================================
  {
    path: 'add-sport',
    canActivate: [authGuard],
    loadChildren: () =>
      import('./features/add-sport/add-sport.routes').then((m) => m.ADD_SPORT_ROUTES),
  },

  // 404 Not Found Page (catch-all route)
  {
    path: '**',
    loadComponent: () => import('@nxt1/ui').then((m) => m.NotFoundComponent),
  },
];
