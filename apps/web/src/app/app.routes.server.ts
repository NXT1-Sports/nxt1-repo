import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * @fileoverview Server-side Routing Configuration — 2026 Professional Pattern
 * @module @nxt1/web
 *
 * SSR configuration is intentionally focused on current, real-platform routes.
 * Indexing policy remains controlled by robots.txt + sitemap.xml.
 */
export const serverRoutes: ServerRoute[] = [
  // Core public SEO routes
  {
    path: '',
    renderMode: RenderMode.Server,
  },
  {
    path: 'agent-x',
    renderMode: RenderMode.Server,
  },
  {
    path: 'agent-x/**',
    renderMode: RenderMode.Server,
  },
  {
    path: 'programs',
    renderMode: RenderMode.Server,
  },
  {
    path: 'help-center',
    renderMode: RenderMode.Server,
  },
  {
    path: 'help-center/**',
    renderMode: RenderMode.Server,
  },
  {
    path: 'terms',
    renderMode: RenderMode.Server,
  },
  {
    path: 'privacy',
    renderMode: RenderMode.Server,
  },

  // Profile pages
  {
    path: 'profile/:sport/:name/:unicode',
    renderMode: RenderMode.Server,
  },
  {
    path: 'profile/:param',
    renderMode: RenderMode.Server,
  },
  {
    path: 'profile',
    renderMode: RenderMode.Server,
  },

  // Public post detail pages for social preview
  {
    path: 'post/:postId',
    renderMode: RenderMode.Server,
  },

  // Invite link landing remains client rendered (redirect behavior)
  {
    path: 'join/:code',
    renderMode: RenderMode.Client,
  },

  // Fallback
  {
    path: '**',
    renderMode: RenderMode.Server,
  },
];
