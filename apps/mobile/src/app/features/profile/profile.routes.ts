/**
 * @fileoverview Profile Feature Routes - Mobile
 * @module @nxt1/mobile/features/profile
 * @version 1.0.0
 *
 * Route configuration for the Profile feature.
 * Supports own-profile (/profile) and other-profile routes by unicode or Firebase UID.
 */

import { Routes } from '@angular/router';

export const PROFILE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./profile.component').then((m) => m.ProfileComponent),
  },
  {
    path: ':sport/:name/:unicode',
    loadComponent: () => import('./profile.component').then((m) => m.ProfileComponent),
  },
  {
    path: ':unicode',
    loadComponent: () => import('./profile.component').then((m) => m.ProfileComponent),
  },
];

export default PROFILE_ROUTES;
