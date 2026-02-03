/**
 * @fileoverview News Feature Routes - Web
 * @module @nxt1/web/features/news
 * @version 1.0.0
 *
 * Route configuration for the News feature.
 */

import { Routes } from '@angular/router';

export const NEWS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./news.component').then((m) => m.NewsComponent),
  },
];

export default NEWS_ROUTES;
