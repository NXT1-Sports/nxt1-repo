/**
 * @fileoverview Settings Feature Routes - Web
 * @module @nxt1/web/features/settings
 * @version 1.0.0
 *
 * Route configuration for the Settings feature.
 */

import { Routes } from '@angular/router';

export const SETTINGS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./settings.component').then((m) => m.SettingsComponent),
  },
  {
    path: 'account-information',
    loadComponent: () =>
      import('./account-information.component').then((m) => m.AccountInformationComponent),
  },
];

export default SETTINGS_ROUTES;
