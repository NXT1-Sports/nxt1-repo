/**
 * @fileoverview News Feature Routes - Web
 * @module @nxt1/web/features/news
 * @version 1.0.0
 *
 * Route configuration for the News feature.
 */

import { Routes } from '@angular/router';
import { NEWS_API_ADAPTER } from '@nxt1/ui/news';
import { NewsApiAdapterService } from './services/news-api-adapter.service';

export const NEWS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./news.component').then((m) => m.NewsComponent),
    providers: [
      NewsApiAdapterService,
      { provide: NEWS_API_ADAPTER, useExisting: NewsApiAdapterService },
    ],
  },
];

export default NEWS_ROUTES;
