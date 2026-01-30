/**
 * @fileoverview Explore Feature Routes - Web
 * @module @nxt1/web/features/explore
 * @version 1.0.0
 *
 * Route configuration for the Explore feature.
 */

import { Routes } from '@angular/router';

export const EXPLORE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./explore.component').then((m) => m.ExploreComponent),
    title: 'Explore | NXT1',
  },
];

export default EXPLORE_ROUTES;
