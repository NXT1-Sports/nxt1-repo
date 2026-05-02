/**
 * @fileoverview Post Feature Routes
 * @module @nxt1/web/features/post
 *
 * Registers the SSR-rendered post route host.
 * Route: /post/:userUnicode/:postId
 *
 * On server: renders SEO meta tags for social link previews.
 * On browser: opens PostDetailOverlayComponent and navigates back on close.
 */

import { Routes } from '@angular/router';

export const POST_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./post.component').then((m) => m.PostComponent),
  },
];

export default POST_ROUTES;
