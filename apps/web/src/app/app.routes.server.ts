import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * @fileoverview Server-side Routing Configuration (Simplified)
 * @module @nxt1/web
 *
 * Minimal SSR config - Auth only for now.
 */
export const serverRoutes: ServerRoute[] = [
  // Root redirect
  {
    path: '',
    renderMode: RenderMode.Client,
  },

  // Auth flows - Client only (requires browser APIs)
  {
    path: 'auth/**',
    renderMode: RenderMode.Client,
  },

  // Fallback
  {
    path: '**',
    renderMode: RenderMode.Client,
  },
];
