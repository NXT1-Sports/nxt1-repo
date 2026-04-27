import { type Routes, type CanMatchFn, type UrlSegment } from '@angular/router';

/**
 * Prevents the team route from activating for static asset URLs.
 * Browsers request .css.map / .js files relative to the current page URL,
 * which can match the `team/:slug` route and trigger spurious API calls.
 */
const rejectFileExtensionSlugs: CanMatchFn = (_route, segments: UrlSegment[]) => {
  const slug = segments[1]?.path ?? '';
  const teamCode = segments[2]?.path ?? '';
  return !slug.includes('.') && !teamCode.includes('.');
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
  // AUTHENTICATION (No layout wrapper)
  // ============================================

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
      import('./core/layout/web-shell.component').then((m) => m.WebShellComponent),
    children: [
      // Default route → Agent X (AI-first landing)
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'agent-x',
      },

      // Agent X - AI Assistant (canonical route)
      {
        path: 'agent-x',
        loadChildren: () => import('./features/agent-x/agent-x.routes'),
      },

      // Activity - Notifications & Activity Feed
      {
        path: 'activity',
        loadChildren: () => import('./features/activity/activity.routes'),
      },

      // Profile - User's own profile (authenticated view)
      {
        path: 'profile',
        loadChildren: () => import('./features/profile/profile.routes'),
      },

      // Settings - User Settings & Preferences
      {
        path: 'settings',
        loadChildren: () => import('./features/settings/settings.routes'),
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
      // Pulse - Sports News Feed
      {
        path: 'pulse',
        loadChildren: () => import('./features/pulse/pulse.routes').then((m) => m.PULSE_ROUTES),
      },

      // NIL - NIL & Monetization campaign page
      {
        path: 'nil',
        loadChildren: () => import('./marketing/nil/nil.routes'),
      },

      // Team Profile - Public Team Pages (strict canonical route)
      // Canonical URL: /team/:slug/:teamCode (e.g. /team/akron-buchtel/57L791)
      {
        path: 'team/:slug/:teamCode',
        canMatch: [rejectFileExtensionSlugs],
        loadChildren: () => import('./features/team/team.routes').then((m) => m.TEAM_ROUTES),
      },

      // Team Platform - Programs/Organizations Page
      {
        path: 'team-platform',
        loadChildren: () => import('./marketing/team-platform/team-platform.routes'),
      },

      // Super Profiles - Interactive Profile Breakdown + Athlete Landing
      {
        path: 'super-profiles',
        loadChildren: () => import('./marketing/super-profiles/super-profiles.routes'),
      },

      // ---- Persona-Specific Marketing Pages ----

      // Athletes - Student-Athlete Intelligence & Discovery
      {
        path: 'athletes',
        loadChildren: () => import('./marketing/athletes/athletes.routes'),
      },

      // Recruiting Athletes - Recruiting Radar & Signals
      {
        path: 'recruiting-athletes',
        loadChildren: () => import('./marketing/recruiting-athletes/recruiting-athletes.routes'),
      },

      // Content Creation for Athletes
      {
        path: 'content-creation-athletes',
        loadChildren: () =>
          import('./marketing/content-creation-athletes/content-creation-athletes.routes'),
      },

      // Media & Coverage for Athletes
      {
        path: 'media-coverage',
        loadChildren: () => import('./marketing/media-coverage/media-coverage.routes'),
      },

      // AI for Athletes - Intelligent Outreach & Profile Distribution
      {
        path: 'ai-athletes',
        loadChildren: () => import('./marketing/ai-athletes/ai-athletes.routes'),
      },

      // College Coaches - Prospect Discovery & Management Tools (canonical)
      {
        path: 'college-coaches',
        loadChildren: () => import('./marketing/coaches/coaches.routes'),
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
        loadChildren: () => import('./marketing/parents/parents.routes'),
      },

      // Scouts - Scouting & Evaluation Tools
      {
        path: 'scouts',
        loadChildren: () => import('./marketing/scouts/scouts.routes'),
      },

      // ---- Sport-Vertical Marketing Pages ----
      // Single component, config-driven: /football, /basketball, etc.

      {
        path: 'football',
        data: { sport: 'football' },
        loadChildren: () => import('./marketing/sport-landing/sport-landing.routes'),
      },
      {
        path: 'basketball',
        data: { sport: 'basketball' },
        loadChildren: () => import('./marketing/sport-landing/sport-landing.routes'),
      },

      // ---- Legal Pages (inside shell for consistent layout) ----
      {
        path: 'terms',
        loadChildren: () => import('./legal/terms/terms.routes').then((m) => m.TERMS_ROUTES),
      },
      {
        path: 'privacy',
        loadChildren: () => import('./legal/privacy/privacy.routes').then((m) => m.PRIVACY_ROUTES),
      },
    ],
  },

  // ============================================
  // SPECIAL ROUTES (Outside Shell)
  // ============================================

  // Add Sport / Add Team wizard (full-page, outside shell — mirrors mobile /add-sport)
  {
    path: 'add-sport',
    loadChildren: () => import('./features/add-sport/add-sport.routes'),
  },

  // Invite Link Landing Page
  // Handles /join/:code?ref=<uid>&code=<CODE>&type=<type>
  // Stores referral data in sessionStorage, then redirects to /auth?mode=signup
  {
    path: 'join/:code',
    loadComponent: () => import('./features/join/join.component').then((m) => m.JoinComponent),
  },

  // OAuth Callback Pages (Google, Microsoft, Yahoo)
  // These are minimal pages that show loading state
  // while parent window polls the URL and extracts authorization code
  {
    path: 'google/callback',
    loadComponent: () =>
      import('./features/activity/components/oauth-callback.component').then(
        (m) => m.OAuthCallbackComponent
      ),
  },
  {
    path: 'microsoft/callback',
    loadComponent: () =>
      import('./features/activity/components/oauth-callback.component').then(
        (m) => m.OAuthCallbackComponent
      ),
  },
  {
    path: 'yahoo/callback',
    loadComponent: () =>
      import('./features/activity/components/oauth-callback.component').then(
        (m) => m.OAuthCallbackComponent
      ),
  },
  {
    path: 'oauth/success',
    loadComponent: () =>
      import('./features/activity/components/oauth-callback.component').then(
        (m) => m.OAuthCallbackComponent
      ),
  },

  // 404 Not Found Page (catch-all route)
  {
    path: '**',
    loadComponent: () => import('@nxt1/ui').then((m) => m.NotFoundComponent),
  },
];
