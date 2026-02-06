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

  // Public Profile Routes (No Auth Required - SEO Optimized)
  // These MUST be before the redirect to tabs/profile to handle public URLs
  {
    path: 'profile/:unicode',
    loadComponent: () =>
      import('./features/profile/profile.component').then((m) => m.ProfileComponent),
  },

  // Public Explore Route (for SEO - no auth required)
  // Uncomment if you want /explore to be publicly accessible
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

  // Create Post (modal-style, outside main shell for focused experience)
  {
    path: 'create-post',
    canActivate: [authGuard],
    loadChildren: () => import('./features/create-post/create-post.routes'),
  },

  // 404 Not Found Page (catch-all route)
  {
    path: '**',
    loadComponent: () => import('@nxt1/ui').then((m) => m.NotFoundComponent),
  },
];
