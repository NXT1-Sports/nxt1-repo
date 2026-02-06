/**
 * @fileoverview About Routes - Mobile
 * @module @nxt1/mobile/features/about
 * @version 1.0.0
 */

import { Routes } from '@angular/router';

export const ABOUT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./about.page').then((m) => m.AboutPage),
  },
];
