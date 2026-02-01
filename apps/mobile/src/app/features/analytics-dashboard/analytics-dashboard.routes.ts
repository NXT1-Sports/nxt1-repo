/**
 * @fileoverview Analytics Dashboard Feature Routes - Mobile
 * @module @nxt1/mobile/features/analytics-dashboard
 * @version 1.0.0
 *
 * Route configuration for the Analytics Dashboard feature on mobile.
 * Uses lazy loading for optimal bundle splitting.
 */

import { Routes } from '@angular/router';

export const ANALYTICS_DASHBOARD_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./analytics-dashboard.component').then((m) => m.AnalyticsDashboardComponent),
  },
];

export default ANALYTICS_DASHBOARD_ROUTES;
