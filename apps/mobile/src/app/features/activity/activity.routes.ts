/**
 * @fileoverview Activity Feature Routes - Mobile
 * @module @nxt1/mobile/features/activity
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
