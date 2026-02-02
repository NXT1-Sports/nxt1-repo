/**
 * @fileoverview Settings Routes - Mobile App
 * @module @nxt1/mobile/features/settings
 * @version 1.0.0
 *
 * Route configuration for the Settings feature.
 * Uses lazy loading for optimal bundle size.
 */

import { Routes } from '@angular/router';

export const SETTINGS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./settings.component').then((m) => m.SettingsComponent),
  },
];

export default SETTINGS_ROUTES;
