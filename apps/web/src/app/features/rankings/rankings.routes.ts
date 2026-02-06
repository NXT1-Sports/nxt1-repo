/**
 * @fileoverview Rankings Feature Routes - Web
 * @module @nxt1/web/features/rankings
 *
 * Route configuration for the Rankings feature.
 * Displays athlete rankings, leaderboards, and performance metrics.
 */

import { Routes } from '@angular/router';

export const RANKINGS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./rankings.component').then((m) => m.RankingsComponent),
    title: 'Rankings | NXT1',
  },
];

export default RANKINGS_ROUTES;
