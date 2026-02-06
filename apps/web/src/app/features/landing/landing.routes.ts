/**
 * @fileoverview Landing Page Routes
 * @module @nxt1/web/features/landing
 *
 * Public landing/marketing pages accessible to unauthenticated users.
 */

import { Routes } from '@angular/router';

export const LANDING_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./landing.component').then((m) => m.LandingComponent),
  },
];

export default LANDING_ROUTES;
