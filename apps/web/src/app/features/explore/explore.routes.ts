/**
 * @fileoverview Explore Feature Routes - Web
 * @module @nxt1/web/features/explore
 * @version 1.0.0
 *
 * Route configuration for the Explore feature.
 */

import { Routes } from '@angular/router';
import { NEWS_API_ADAPTER } from '@nxt1/ui/news';
import { EXPLORE_API } from '@nxt1/ui/explore';
import { PulseApiAdapterService } from '../../core/services/api/pulse-api-adapter.service';
import { ExploreApiService } from '../../core/services/api/explore-api.service';

const newsProviders = [
  PulseApiAdapterService,
  { provide: NEWS_API_ADAPTER, useExisting: PulseApiAdapterService },
];

const exploreProviders = [
  ExploreApiService,
  { provide: EXPLORE_API, useExisting: ExploreApiService },
];

export const EXPLORE_ROUTES: Routes = [
  // Bare /explore → redirect straight to Pulse
  {
    path: '',
    redirectTo: 'pulse',
    pathMatch: 'full',
  },
  // Pulse article detail — MUST come before :tab to avoid being swallowed by the generic matcher
  {
    path: 'pulse/:id',
    loadComponent: () =>
      import('../pulse/pulse-detail.component').then((m) => m.PulseDetailComponent),
    providers: [...newsProviders],
  },
  {
    path: ':tab',
    loadComponent: () => import('./explore.component').then((m) => m.ExploreComponent),
    // Title set dynamically per-tab by ExploreComponent.updateSeoForTab()
    providers: [...newsProviders, ...exploreProviders],
  },
];

export default EXPLORE_ROUTES;
