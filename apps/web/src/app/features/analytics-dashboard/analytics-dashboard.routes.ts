/**
 * @fileoverview Analytics Dashboard Feature Routes - Web
 * @module @nxt1/web/features/analytics-dashboard
 * @version 2.0.0
 *
 * Route configuration for the Analytics Dashboard feature.
 * Uses lazy loading for optimal bundle splitting.
 *
 * The root route loads AnalyticsRootComponent which handles
 * the auth-aware dual-state pattern:
 * - Logged out → Marketing landing page with feature preview
 * - Logged in → Full analytics dashboard
 */

import { Routes } from '@angular/router';

export const ANALYTICS_DASHBOARD_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./analytics-root.component').then((m) => m.AnalyticsRootComponent),
  },
];

export default ANALYTICS_DASHBOARD_ROUTES;
