/**
 * @fileoverview Scout Reports Feature Routes (Mobile)
 * @module apps/mobile/features/scout-reports
 * @version 1.0.0
 *
 * Route configuration for the scout reports feature on mobile.
 * Uses IonRouterOutlet for proper Ionic navigation context.
 */

import { Routes } from '@angular/router';

export const SCOUT_REPORTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./scout-reports.component').then((m) => m.ScoutReportsComponent),
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./scout-report-detail.component').then((m) => m.ScoutReportDetailComponent),
  },
];

export default SCOUT_REPORTS_ROUTES;
