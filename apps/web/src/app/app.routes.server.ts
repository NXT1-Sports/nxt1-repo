import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * @fileoverview Server-side Routing Configuration
 * @module @nxt1/web
 *
 * All routes use Server-Side Rendering (SSR) for:
 * - Consistent hydration behavior
 * - SEO on all public pages
 * - Fast initial page load
 * - Social media preview support
 *
 * Auth state handling:
 * - Server: ServerAuthService (returns unauthenticated state)
 * - Client: BrowserAuthService (initializes Firebase after hydration)
 */
export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Server,
  },
];
