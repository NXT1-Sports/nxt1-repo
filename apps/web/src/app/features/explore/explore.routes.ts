/**
 * @fileoverview Explore Feature Routes - Web
 * @module @nxt1/web/features/explore
 * @version 1.0.0
 *
 * Route configuration for the Explore feature.
 */

import { Routes } from '@angular/router';
import { NEWS_API_ADAPTER } from '@nxt1/ui/news';
import { NewsApiAdapterService } from '../news/services/news-api-adapter.service';

const newsProviders = [
  NewsApiAdapterService,
  { provide: NEWS_API_ADAPTER, useExisting: NewsApiAdapterService },
];

export const EXPLORE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./explore.component').then((m) => m.ExploreComponent),
    // SeoService sets the full title dynamically (appends "| NXT1 Sports" automatically)
    title: 'Explore',
    providers: [...newsProviders],
  },
  {
    path: ':tab',
    loadComponent: () => import('./explore.component').then((m) => m.ExploreComponent),
    // Title set dynamically per-tab by ExploreComponent.updateSeoForTab()
    providers: [...newsProviders],
  },
];

export default EXPLORE_ROUTES;
