import { type Routes, type CanMatchFn, type UrlSegment } from '@angular/router';

/**
 * Prevents the team route from activating for static asset URLs.
 * Browsers request .css.map / .js files relative to the current page URL,
 * which can match the `team/:slug` route and trigger spurious API calls.
 */
const rejectFileExtensionSlugs: CanMatchFn = (_route, segments: UrlSegment[]) => {
  const slug = segments[1]?.path ?? '';
  return !slug.includes('.');
};

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
 * - No tabs prefix — clean, semantic URLs
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
    pathMatch: 'full',
    redirectTo: '',
  },

  // ============================================
  // PUBLIC PROFILE & EXPLORE (SEO-Critical)
  // ============================================

  /**
   * Public Profile Pages
   * SEO-critical: Used for recruiting, social sharing
   * Example: nxt1sports.com/profile/john-doe-2026
   * NOTE: param name must be ':param' to match routeParam() in profile.component.ts
   */
  {
    path: 'profile/:param',
    loadComponent: () =>
      import('./features/profile/profile.component').then((m) => m.ProfileComponent),
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

  // Team Pages — redirects to shell-wrapped route
  // The actual team route lives inside WebShellComponent children
  // so it gets the sidebar, top nav, and full app shell.
  // This top-level redirect handles direct /team/:slug links.
  // {
  //   path: 'team/:slug',
  //   redirectTo: 'team/:slug',  // handled by child route below
  // },

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

      // Explore - Unified Discovery & Feed Hub
      {
        path: 'explore',
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

      // Brand - Brand Vault (raw materials for Agent X)
      {
        path: 'brand',
        loadChildren: () => import('./features/brand/brand.routes'),
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
      // Usage - Payment Usage Dashboard
      {
        path: 'usage',
        loadChildren: () => import('./features/usage/usage.routes'),
      },
      // NIL - NIL & Monetization campaign page
      {
        path: 'nil',
        loadChildren: () => import('./features/nil/nil.routes'),
      },

      // Manage Team - Team Management
      {
        path: 'manage-team',
        loadChildren: () => import('./features/manage-team/manage-team.routes'),
      },

      // Team Profile - Public Team Pages (with shell)
      {
        path: 'team/:slug',
        canMatch: [rejectFileExtensionSlugs],
        loadChildren: () => import('./features/team/team.routes').then((m) => m.TEAM_ROUTES),
      },

      // Team Platform - Programs/Organizations Page
      {
        path: 'team-platform',
        loadChildren: () => import('./features/team-platform/team-platform.routes'),
      },

      // Super Profiles - Interactive Profile Breakdown + Athlete Landing
      {
        path: 'super-profiles',
        loadChildren: () => import('./features/super-profiles/super-profiles.routes'),
      },

      // Recruiting Scouts & Colleges - Public Directory & Marketing
      {
        path: 'recruiting-scouts-colleges',
        loadChildren: () => import('./features/athlete-profiles/athlete-profiles.routes'),
      },

      // ---- Persona-Specific Marketing Pages ----

      // Athletes - Student-Athlete Recruiting
      {
        path: 'athletes',
        loadChildren: () => import('./features/athletes/athletes.routes'),
      },

      // Recruiting Athletes - Recruiting Radar & Signals
      {
        path: 'recruiting-athletes',
        loadChildren: () => import('./features/recruiting-athletes/recruiting-athletes.routes'),
      },

      // Content Creation for Athletes
      {
        path: 'content-creation-athletes',
        loadChildren: () =>
          import('./features/content-creation-athletes/content-creation-athletes.routes'),
      },

      // Media & Coverage for Athletes
      {
        path: 'media-coverage',
        loadChildren: () => import('./features/media-coverage/media-coverage.routes'),
      },

      // AI for Athletes - Communication Training & AI Recruiting Tools
      {
        path: 'ai-athletes',
        loadChildren: () => import('./features/ai-athletes/ai-athletes.routes'),
      },

      // College Coaches - Coach Recruiting Tools (canonical)
      {
        path: 'college-coaches',
        loadChildren: () => import('./features/coaches/coaches.routes'),
      },

      // Legacy alias
      {
        path: 'coaches',
        pathMatch: 'full',
        redirectTo: 'college-coaches',
      },

      // Parents - Family Recruiting Dashboard
      {
        path: 'parents',
        loadChildren: () => import('./features/parents/parents.routes'),
      },

      // Scouts - Scouting & Evaluation Tools
      {
        path: 'scouts',
        loadChildren: () => import('./features/scouts/scouts.routes'),
      },

      // ---- Sport-Vertical Marketing Pages ----
      // Single component, config-driven: /football, /basketball, etc.

      {
        path: 'football',
        data: { sport: 'football' },
        loadChildren: () => import('./features/sport-landing/sport-landing.routes'),
      },
      {
        path: 'basketball',
        data: { sport: 'basketball' },
        loadChildren: () => import('./features/sport-landing/sport-landing.routes'),
      },
    ],
  },

  // ============================================
  // SPECIAL ROUTES (Outside Shell)
  // ============================================

  // Create Post (modal-style, outside main shell for focused experience)
  {
    path: 'post/create',
    loadChildren: () => import('./features/create-post/create-post.routes'),
  },
  // Legacy create-post URL redirect
  {
    path: 'create-post',
    redirectTo: 'post/create',
    pathMatch: 'full',
  },

  // 404 Not Found Page (catch-all route)
  {
    path: '**',
    loadComponent: () => import('@nxt1/ui').then((m) => m.NotFoundComponent),
  },
];
