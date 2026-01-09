import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Server-side Routing Configuration - 2026 Best Practices
 *
 * Hybrid Rendering Strategy:
 * - Prerender: Static pages generated at build time (fastest, best for SEO)
 * - Server: Dynamic SSR on each request (personalized content, SEO-critical)
 * - Client: Skip SSR, render on client only (auth-protected, highly interactive)
 *
 * Decision Matrix:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ Page Type              │ RenderMode │ Reason                    │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ Landing, About, FAQ    │ Prerender  │ Static, SEO, fastest load │
 * │ Profile/:id, Explore   │ Server     │ Dynamic, SEO-critical     │
 * │ Auth, Dashboard, Feed  │ Client     │ Protected, no SEO needed  │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * @see https://angular.dev/guide/ssr#configure-server-side-rendering
 */
export const serverRoutes: ServerRoute[] = [
  // ============================================
  // PRERENDERED PAGES (Static at build time)
  // ============================================
  // These pages are generated during `ng build` and served as static HTML.
  // Best for pages that rarely change and need maximum performance.

  {
    path: '',
    renderMode: RenderMode.Prerender,
  },

  // ============================================
  // SERVER-RENDERED PAGES (Dynamic SSR)
  // ============================================
  // These pages are rendered on each request.
  // Use for SEO-critical pages with dynamic content.

  {
    path: 'explore',
    renderMode: RenderMode.Server,
  },
  {
    path: 'profile/:unicode',
    renderMode: RenderMode.Server,
  },
  {
    path: 'team/:name',
    renderMode: RenderMode.Server,
  },

  // ============================================
  // CLIENT-ONLY PAGES (No SSR)
  // ============================================
  // These pages skip SSR entirely and render on the client.
  // Use for auth-protected pages and highly interactive features.

  // Authentication flows - require browser APIs
  {
    path: 'auth/**',
    renderMode: RenderMode.Client,
  },

  // Protected user pages - require authentication
  {
    path: 'home',
    renderMode: RenderMode.Client,
  },
  {
    path: 'feed',
    renderMode: RenderMode.Client,
  },
  {
    path: 'messages',
    renderMode: RenderMode.Client,
  },
  {
    path: 'messages/**',
    renderMode: RenderMode.Client,
  },
  {
    path: 'notifications',
    renderMode: RenderMode.Client,
  },
  {
    path: 'settings',
    renderMode: RenderMode.Client,
  },
  {
    path: 'settings/**',
    renderMode: RenderMode.Client,
  },

  // ============================================
  // FALLBACK - Server render unknown routes
  // ============================================
  // This catches 404s and renders them server-side for proper HTTP status codes.

  {
    path: '**',
    renderMode: RenderMode.Server,
  },
];

