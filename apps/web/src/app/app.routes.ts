import { Routes } from '@angular/router';

/**
 * @fileoverview Web App Routes — 2026 Professional Pattern
 * @module @nxt1/web
 *
 * ⭐ NO CLIENT-SIDE AUTH GUARDS — Routes are 100% open ⭐
 *
 * Professional Pattern (like Twitter, Instagram, LinkedIn):
 * - ALL routes are publicly accessible
 * - Backend handles authorization (API returns 401/403 if needed)
 * - UI adapts based on auth state (show login prompt, etc.)
 * - Full SSR for ALL pages (SEO + performance)
 *
 * This eliminates:
 * - Hydration mismatches
 * - Flash redirects (/auth → /home)
 * - Client-side auth race conditions
 *
 * Architecture:
 * - WebShellComponent wraps main routes (provides navigation)
 * - Auth routes are standalone (different layout)
 * - Uses lazy loading for optimal performance
 * - NO /tabs/ prefix — clean, semantic URLs
 */

export const routes: Routes = [
  // ============================================
  // PUBLIC LANDING PAGE (Marketing/Welcome)
  // ============================================

  /**
   * Public Landing Page
   * SEO-critical: Main marketing page for unauthenticated users
   * Example: nxt1sports.com/welcome
   */
  {
    path: 'welcome',
    loadChildren: () => import('./features/landing/landing.routes'),
  },

  // ============================================
  // PUBLIC PROFILE & EXPLORE (SEO-Critical)
  // ============================================

  /**
   * Public Profile Pages
   * SEO-critical: Used for recruiting, social sharing
   * Example: nxt1sports.com/profile/john-doe-2026
   */
  {
    path: 'profile/:unicode',
    loadComponent: () =>
      import('./features/profile/profile.component').then((m) => m.ProfileComponent),
  },

  /**
   * Public Explore/Discovery
   * SEO-critical: Search engines index athletes, teams, etc.
   * Example: nxt1sports.com/explore
   */
  {
    path: 'explore',
    loadComponent: () =>
      import('./features/explore/explore.component').then((m) => m.ExploreComponent),
  },

  // Legacy profile redirects (for authenticated users)
  {
    path: 'profile',
    redirectTo: 'tabs/profile',
    pathMatch: 'full',
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
  {
    path: 'scout-reports',
    redirectTo: 'tabs/scout-reports',
    pathMatch: 'prefix',
  },
  {
    path: 'invite',
    redirectTo: 'tabs/invite',
    pathMatch: 'prefix',
  },

  // Authenticated Routes with Web Shell (Desktop Nav)
  // Uses /tabs/* pattern for cross-platform compatibility with mobile
  {
    path: 'tabs',
    loadComponent: () =>
      import('./core/layout/shell/web-shell.component').then((m) => m.WebShellComponent),

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
      // News - Sports Recruiting News Feed
      {
        path: 'news',
        loadChildren: () => import('./features/news/news.routes'),
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
        loadChildren: () => import('./features/xp/xp.routes'),
      },
      // Scout Reports - Athlete Scout Reports & Ratings
      {
        path: 'scout-reports',
        loadChildren: () => import('./features/scout-reports/scout-reports.routes'),
      },
      // Help Center - Help Articles, Videos, FAQs, AI Chat
      {
        path: 'help-center',
        loadChildren: () => import('./features/help-center/help-center.routes'),
      },
      // Invite - Referral & Sharing
      {
        path: 'invite',
        loadChildren: () => import('./features/invite/invite.routes'),
      },
    ],
  },

  // Static Legal Pages (Public - for SEO)
  {
    path: 'about',
    loadChildren: () => import('./features/about/about.routes').then((m) => m.ABOUT_ROUTES),
  },
  {
    path: 'terms',
    loadChildren: () => import('./features/terms/terms.routes').then((m) => m.TERMS_ROUTES),
  },
  {
    path: 'privacy',
    loadChildren: () => import('./features/privacy/privacy.routes').then((m) => m.PRIVACY_ROUTES),
  },

  // Team Pages (Public - for SEO)
  {
    path: 'team/:slug',
    loadChildren: () => import('./features/team/team.routes').then((m) => m.TEAM_ROUTES),
  },

  // Authentication Routes (Public - no layout wrapper)
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },

  // ============================================
  // MAIN APP ROUTES (With Web Shell)
  // ============================================

  /**
   * All main pages wrapped in WebShellComponent.
   * Shell provides: top navigation, sidenav, footer
   * NO AUTH GUARD - routes are open, UI adapts to auth state
   */
  {
    path: '',
    loadComponent: () =>
      import('./core/layout/shell/web-shell.component').then((m) => m.WebShellComponent),
    children: [
      // Default route → Home
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'home',
      },

      // Home Page (Dashboard)
      {
        path: 'home',
        loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent),
      },

      // Discover - Search & Discovery (matches top nav)
      {
        path: 'discover',
        loadComponent: () =>
          import('./features/explore/explore.component').then((m) => m.ExploreComponent),
      },

      // Search - Search & Discovery (mobile parity)
      {
        path: 'search',
        loadChildren: () => import('./features/explore/explore.routes'),
      },

      // Rankings - Athlete Rankings & Leaderboards
      {
        path: 'rankings',
        loadChildren: () => import('./features/rankings/rankings.routes'),
      },

      // Colleges - College Search & Information
      {
        path: 'colleges',
        loadChildren: () => import('./features/colleges/colleges.routes'),
      },

      // Messages - User Messages & Conversations
      {
        path: 'messages',
        loadChildren: () => import('./features/messages/messages.routes'),
      },

      // Agent X - AI Assistant (also accessible via /agent for mobile parity)
      {
        path: 'agent-x',
        loadChildren: () => import('./features/agent-x/agent-x.routes'),
      },
      {
        path: 'agent',
        loadChildren: () => import('./features/agent-x/agent-x.routes'),
      },

      // Activity - Notifications & Activity Feed
      {
        path: 'activity',
        loadChildren: () => import('./features/activity/activity.routes'),
      },

      // News - Sports Recruiting News Feed
      {
        path: 'news',
        loadChildren: () => import('./features/news/news.routes'),
      },

      // Profile - User's own profile (authenticated view)
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
        loadChildren: () => import('./features/xp/xp.routes'),
      },

      // Scout Reports - Athlete Scout Reports & Ratings
      {
        path: 'scout-reports',
        loadChildren: () => import('./features/scout-reports/scout-reports.routes'),
      },

      // Help Center - Help Articles, Videos, FAQs, AI Chat
      {
        path: 'help-center',
        loadChildren: () => import('./features/help-center/help-center.routes'),
      },

      // Invite - Referral & Sharing
      {
        path: 'invite',
        loadChildren: () => import('./features/invite/invite.routes'),
      },

      // Manage Team - Team Management
      {
        path: 'manage-team',
        loadChildren: () => import('./features/manage-team/manage-team.routes'),
      },
    ],
  },

  // ============================================
  // SPECIAL ROUTES (Outside Shell)
  // ============================================

  // Create Post (modal-style, outside main shell for focused experience)
  {
    path: 'create-post',
    loadChildren: () => import('./features/create-post/create-post.routes'),
  },

  // 404 Not Found Page (catch-all route)
  {
    path: '**',
    loadComponent: () => import('@nxt1/ui').then((m) => m.NotFoundComponent),
  },
];
