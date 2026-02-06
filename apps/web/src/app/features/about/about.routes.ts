/**
 * @fileoverview About Routes - Web
 * @module @nxt1/web/features/about
 * @version 1.0.0
 */

import { Routes } from '@angular/router';

export const ABOUT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./about.component').then((m) => m.AboutComponent),
  },
];
