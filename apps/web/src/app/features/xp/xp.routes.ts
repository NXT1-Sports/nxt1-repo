/**
 * @fileoverview XP Feature Routes - Web
 * @module @nxt1/web/features/xp
 * @version 1.0.0
 *
 * Route configuration for the XP feature.
 */

import { Routes } from '@angular/router';

export const XP_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./xp.component').then((m) => m.XpComponent),
  },
];

export default XP_ROUTES;
