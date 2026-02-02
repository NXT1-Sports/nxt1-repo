/**
 * @fileoverview Missions Feature Routes - Web
 * @module @nxt1/web/features/missions
 * @version 1.0.0
 *
 * Route configuration for the Missions feature.
 */

import { Routes } from '@angular/router';

export const MISSIONS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./missions.component').then((m) => m.MissionsComponent),
  },
];

export default MISSIONS_ROUTES;
