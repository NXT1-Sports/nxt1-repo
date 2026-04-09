/**
 * @fileoverview Pulse Feature Routes - Mobile
 * @module @nxt1/mobile/features/pulse
 * @version 1.0.0
 *
 * Route configuration for the Pulse feature.
 */

import { Routes } from '@angular/router';

export const PULSE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pulse.component').then((m) => m.PulseComponent),
  },
];

export default PULSE_ROUTES;
