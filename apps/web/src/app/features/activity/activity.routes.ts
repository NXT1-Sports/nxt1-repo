/**
 * @fileoverview Activity Feature Routes - Web
 * @module @nxt1/web/features/activity
 * @version 1.0.0
 *
 * Route configuration for the Activity feature.
 */

import { Routes } from '@angular/router';

export const ACTIVITY_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./activity.component').then((m) => m.ActivityComponent),
  },
];

export default ACTIVITY_ROUTES;
