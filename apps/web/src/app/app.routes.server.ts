import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * @fileoverview Server-side Routing Configuration
 * @module @nxt1/web
 *
 * All routes use Server rendering for consistent hydration.
 * Auth state is handled by:
 * - Server: ServerAuthService (returns unauthenticated state)
 * - Client: BrowserAuthService (initializes Firebase after hydration)
 *
 * This ensures provideClientHydration() always has data to hydrate.
 */
export const serverRoutes: ServerRoute[] = [
  // All routes server-rendered for proper hydration
  {
    path: '**',
    renderMode: RenderMode.Server,
  },
];
