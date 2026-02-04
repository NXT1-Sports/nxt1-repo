import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * @fileoverview Server-side Routing Configuration
 * @module @nxt1/web
 *
 * Route-specific SSR configuration for optimal SEO and performance.
 *
 * Render Modes:
 * - Server: Full SSR for every request (best for SEO, public pages)
 * - Client: Client-side only (auth pages, private dashboards)
 * - Prerender: Static pre-rendering at build time (coming soon)
 *
 * SEO-Critical Routes (Server mode):
 * - Public profile pages: /profile/:unicode
 * - Team pages: /team/:slug
 * - Video pages: /video/:id
 * - Explore/discovery pages
 * - Auth pages (for social preview when sharing signup links)
 *
 * Auth State Handling:
 * - Server: ServerAuthService (returns unauthenticated state)
 * - Client: BrowserAuthService (initializes Firebase after hydration)
 *
 * Performance Note:
 * Using Server mode for all routes ensures:
 * - Consistent hydration behavior
 * - No flashing of unauthenticated state
 * - Social media crawlers see full content
 * - Fast Time to First Byte (TTFB)
 */
export const serverRoutes: ServerRoute[] = [
  // ============================================
  // PUBLIC PAGES (High SEO Priority)
  // ============================================

  /**
   * Profile Pages - Individual athlete profiles
   * Route: /profile/:unicode
   * SEO: Critical - used for recruiting, social sharing
   */
  {
    path: 'profile/:unicode',
    renderMode: RenderMode.Server,
  },

  /**
   * Team Pages (TODO: Implement in app.routes.ts first)
   * Route: /team/:slug
   * SEO: High priority
   */
  // {
  //   path: 'team/:slug',
  //   renderMode: RenderMode.Server,
  // },

  /**
   * Video/Highlight Pages (TODO: Implement in app.routes.ts first)
   * Route: /video/:id
   * SEO: High priority - video rich snippets
   */
  // {
  //   path: 'video/:id',
  //   renderMode: RenderMode.Server,
  // },

  /**
   * Post Pages (TODO: Implement in app.routes.ts first)
   * Route: /post/:userUnicode/:postId
   * SEO: Medium priority
   */
  // {
  //   path: 'post/:userUnicode/:postId',
  //   renderMode: RenderMode.Server,
  // },

  // ============================================
  // DISCOVERY PAGES (Medium SEO Priority)
  // ============================================

  /**
   * Explore/Discovery Pages
   * Routes: /tabs/explore, /explore
   */
  {
    path: 'tabs/explore',
    renderMode: RenderMode.Server,
  },
  {
    path: 'explore',
    renderMode: RenderMode.Server,
  },

  // ============================================
  // HELP CENTER (High SEO Priority)
  // ============================================

  /**
   * Help Center - Main landing, category pages, articles, videos
   * Routes: /tabs/help-center/**
   * SEO: High priority - support content, indexed for search
   */
  {
    path: 'tabs/help-center',
    renderMode: RenderMode.Server,
  },
  {
    path: 'tabs/help-center/category/:categoryId',
    renderMode: RenderMode.Server,
  },
  {
    path: 'tabs/help-center/article/:slug',
    renderMode: RenderMode.Server,
  },
  {
    path: 'tabs/help-center/video/:id',
    renderMode: RenderMode.Server,
  },
  {
    path: 'tabs/help-center/search',
    renderMode: RenderMode.Server,
  },
  {
    path: 'tabs/help-center/contact',
    renderMode: RenderMode.Server,
  },

  /**
   * Homepage
   */
  {
    path: '',
    renderMode: RenderMode.Server,
  },

  // ============================================
  // AUTH PAGES (Low SEO Priority, but needs SSR for social previews)
  // ============================================

  /**
   * Auth Pages - Login, signup, forgot password
   * Route: /auth/**
   * Note: Use Server mode so social media sees proper meta tags
   * when someone shares signup link
   */
  {
    path: 'auth',
    renderMode: RenderMode.Server,
  },
  {
    path: 'auth/**',
    renderMode: RenderMode.Server,
  },

  // ============================================
  // PRIVATE/AUTHENTICATED PAGES (No SEO needed)
  // ============================================

  /**
   * Protected Tabs - Home, Activity, Analytics, Settings
   * These are behind auth guard, so SEO not critical
   * Still using Server mode for consistent hydration
   */
  {
    path: 'tabs/home',
    renderMode: RenderMode.Server,
  },
  {
    path: 'tabs/activity',
    renderMode: RenderMode.Server,
  },
  {
    path: 'tabs/analytics',
    renderMode: RenderMode.Server,
  },
  {
    path: 'tabs/settings',
    renderMode: RenderMode.Server,
  },
  {
    path: 'tabs/agent-x',
    renderMode: RenderMode.Server,
  },
  {
    path: 'tabs/xp',
    renderMode: RenderMode.Server,
  },

  {
    path: '**',
    renderMode: RenderMode.Server,
  },
];
