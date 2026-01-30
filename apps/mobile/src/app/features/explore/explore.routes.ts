/**
 * @fileoverview Explore Feature Routes - Mobile
 * @module @nxt1/mobile/features/explore
 * @version 1.0.0
 *
 * Route configuration for the Explore feature.
 */

import { Routes } from '@angular/router';

export const EXPLORE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./explore.component').then((m) => m.ExploreComponent),
  },
];

export default EXPLORE_ROUTES;
