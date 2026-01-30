/**
 * @fileoverview Profile Feature Routes - Web
 * @module @nxt1/web/features/profile
 * @version 1.0.0
 *
 * Route configuration for the Profile feature.
 * Uses `unicode` as the unique profile identifier (matching v1 app).
 *
 * Routes:
 * - /profile — View own profile
 * - /profile/:unicode — View profile by unicode identifier
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

export default PROFILE_ROUTES;
