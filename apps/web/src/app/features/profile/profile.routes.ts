/**
 * @fileoverview Profile Feature Routes - Web
 * @module @nxt1/web/features/profile
 * @version 1.1.0
 *
 * Route configuration for the Profile feature.
 *
 * Routes:
 * - /profile            — View own profile (me)
 * - /profile/:username  — View profile by username  (e.g. /profile/devmonster)
 * - /profile/:unicode   — View profile by unicode   (e.g. /profile/180798)
 *
 * A single wildcard `:param` catches both — the component determines
 * at runtime whether the param is numeric (unicode) or alphanumeric (username).
 */

import { Routes } from '@angular/router';

export const PROFILE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./profile.component').then((m) => m.ProfileComponent),
  },
  {
    path: ':param',
    loadComponent: () => import('./profile.component').then((m) => m.ProfileComponent),
  },
];

export default PROFILE_ROUTES;
