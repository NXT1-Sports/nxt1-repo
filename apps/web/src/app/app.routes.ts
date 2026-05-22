import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID, TransferState } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { type Routes, type CanMatchFn, type UrlSegment } from '@angular/router';
import { filter, map, take } from 'rxjs/operators';
import { AuthFlowService } from './core/services/auth';
import {
  AUTH_TRANSFER_STATE_KEY,
  type TransferredAuthState,
} from './core/services/auth/ssr-tokens';

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

const EMPTY_TRANSFERRED_AUTH_STATE: TransferredAuthState = {
  user: null,
  firebaseUser: null,
};

function hasTransferredAuthUser(): boolean {
  return (
    inject(TransferState).get(AUTH_TRANSFER_STATE_KEY, EMPTY_TRANSFERRED_AUTH_STATE).user !== null
  );
}

// Agent X is the only route with distinct logged-out and logged-in shells.
// Wait for browser auth readiness before matching so refresh cannot pick the wrong shell.
function matchAgentXLayout(matchesAuthenticatedUser: boolean): ReturnType<CanMatchFn> {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) {
    return hasTransferredAuthUser() === matchesAuthenticatedUser;
  }

  const authFlow = inject(AuthFlowService);

  if (authFlow.isAuthReady()) {
    return authFlow.isAuthenticated() === matchesAuthenticatedUser;
  }

  return toObservable(authFlow.isAuthReady).pipe(
    filter(Boolean),
    take(1),
    map(() => authFlow.isAuthenticated() === matchesAuthenticatedUser)
  );
}

const _matchLoggedOutAgentXLayout: CanMatchFn = () => matchAgentXLayout(false);
const _matchAuthenticatedAgentXLayout: CanMatchFn = () => matchAgentXLayout(true);

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
  // PUBLIC MARKETING ROUTES (No heavy app shell)
  // ============================================

  {
    path: '',
    loadComponent: () =>
      import('./marketing/public-marketing-shell.component').then(
        (m) => m.PublicMarketingShellComponent
      ),
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'NXT1 Sports | The Sports Intelligence Platform',
        loadComponent: () =>
          import('./marketing/landing/landing.component').then((m) => m.LandingComponent),
      },
      {
        path: 'programs',
        loadChildren: () => import('./marketing/team-platform/team-platform.routes'),
      },
      {
        path: 'agent-x',
        canMatch: [_matchLoggedOutAgentXLayout],
        title: 'NXT1 Agent X | AI Command Center for Sports',
        loadComponent: () =>
          import('./marketing/agent-x-marketing/agent-x-marketing.component').then(
            (m) => m.AgentXMarketingComponent
          ),
      },
    ],
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
      // Agent X - logged-in command center, logged-out Agent X landing state
      {
        path: 'agent-x',
        canMatch: [_matchAuthenticatedAgentXLayout],
        title: 'NXT1 Agent X | AI Command Center for Sports',
        loadComponent: () =>
          import('./features/agent-x/agent-x.component').then((m) => m.AgentXComponent),
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

      // Manage Team - route bridge for notification deep links
      {
        path: 'manage-team',
        loadComponent: () =>
          import('./features/manage-team/manage-team-route.component').then(
            (m) => m.ManageTeamRouteComponent
          ),
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

      // ============================================
      // MARKETING PAGES (MVP Only)
      // ============================================
      // For archived/disabled routes, see app.routes.marketing.archived.ts
      // To re-enable any marketing routes, copy from the archived file.

      // ---- Legal Pages (inside shell for consistent layout) ----
      {
        path: 'terms',
        loadChildren: () => import('./legal/terms/terms.routes').then((m) => m.TERMS_ROUTES),
      },
      {
        path: 'privacy',
        loadChildren: () => import('./legal/privacy/privacy.routes').then((m) => m.PRIVACY_ROUTES),
      },

      // ── Post Detail Route ──────────────────────────────────────────────────
      // SSR-rendered route host for deep-linked post URLs.
      // In-browser: opens PostDetailOverlayComponent, navigates back on close.
      // SEO: serves Open Graph meta for social link previews.
      {
        path: 'post/:postId',
        loadChildren: () => import('./features/post/post.routes'),
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
    loadComponent: () => import('@nxt1/ui/components/not-found').then((m) => m.NotFoundComponent),
  },
];
