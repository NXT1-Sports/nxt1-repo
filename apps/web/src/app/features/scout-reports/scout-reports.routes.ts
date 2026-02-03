/**
 * @fileoverview Scout Reports Feature Routes (Web)
 * @module apps/web/features/scout-reports
 * @version 1.0.0
 *
 * Route configuration for the scout reports feature.
 * SSR-enabled with Server render mode for SEO benefits.
 */

import { Routes } from '@angular/router';

export const SCOUT_REPORTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./scout-reports.component').then((m) => m.ScoutReportsComponent),
    title: 'Scout Reports | NXT1',
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./scout-report-detail.component').then((m) => m.ScoutReportDetailComponent),
    title: 'Scout Report | NXT1',
  },
];

export default SCOUT_REPORTS_ROUTES;
