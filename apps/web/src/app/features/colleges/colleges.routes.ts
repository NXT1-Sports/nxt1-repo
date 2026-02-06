/**
 * @fileoverview Colleges Feature Routes - Web
 * @module @nxt1/web/features/colleges
 *
 * Route configuration for the Colleges feature.
 * Displays college search, information, and recruiting details.
 */

import { Routes } from '@angular/router';

export const COLLEGES_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./colleges.component').then((m) => m.CollegesComponent),
    title: 'Colleges | NXT1',
  },
];

export default COLLEGES_ROUTES;
