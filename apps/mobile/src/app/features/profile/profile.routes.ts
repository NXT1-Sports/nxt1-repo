/**
 * @fileoverview Profile Routes - Mobile
 * @module @nxt1/mobile/features/profile
 */

import { Routes } from '@angular/router';

export const PROFILE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./profile.component').then((m) => m.ProfileComponent),
  },
  {
    path: ':unicode',
    loadComponent: () => import('./profile.component').then((m) => m.ProfileComponent),
  },
];
