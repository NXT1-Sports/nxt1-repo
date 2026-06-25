import { type Routes, type CanMatchFn, type UrlSegment } from '@angular/router';

/**
 * Prevents the team route from activating for static asset URLs.
 * Browsers request .css.map / .js files relative to the current page URL,
 * which can match the `team/:slug` route and trigger spurious API calls.
 */
const _rejectFileExtensionSlugs: CanMatchFn = (_route, segments: UrlSegment[]) => {
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
  // Shell-free Film Review popout. Opened from Agent X into its own browser window.
  {
    path: 'agent-x/film-review-popout',
    title: 'NXT1 Film Review',
    loadComponent: () =>
      import('./features/agent-x/film-review-popout.component').then(
        (m) => m.AgentXFilmReviewPopoutComponent
      ),
  },

  // ============================================
  // PUBLIC MARKETING ROUTES (No heavy app shell)
  // ============================================

  {
    path: '',
    loadChildren: () => import('./marketing/public-marketing.routes'),
  },

  // ============================================
  // AUTHENTICATION (No layout wrapper)
  // ============================================

  // Authentication Routes (Public - no layout wrapper)
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },

  {
    path: '',
    loadChildren: () => import('./app-shell.routes'),
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
    path: 'join',
    loadChildren: () => import('./features/join/join.routes').then((m) => m.JOIN_ROUTES),
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
    loadComponent: () => import('@nxt1/ui/components/not-found').then((m) => m.NotFoundComponent),
  },
];
